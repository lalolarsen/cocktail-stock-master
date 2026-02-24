import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Persisted Cart Hook
 *
 * Stores the cart in localStorage with a SINGLE STABLE key: stockia_cart_v1
 * This ensures the cart works reliably across all platforms including
 * Windows PWA, iPad, Android, and Chrome.
 *
 * Key design decisions:
 * - Single stable key prevents issues with dynamic keys (venue/pos/jornada)
 *   that caused the cart to appear empty on Windows PWA.
 * - Hydrates on mount, persists on every mutation.
 * - Fallback: if React state has 0 items but storage has items, rehydrate.
 */

const STORAGE_KEY = "stockia_cart_v1";

export type SelectedAddon = {
  id: string;
  name: string;
  price: number;
};

export type Cocktail = {
  id: string;
  name: string;
  price: number;
  category: string;
};

export type CartItem = {
  cocktail: Cocktail;
  quantity: number;
  addons: SelectedAddon[];
  isCourtesy?: boolean;
  courtesyCode?: string;
};

interface UsePersistedCartOptions {
  /** @deprecated No longer used for storage key – kept for API compat */
  venueId?: string | undefined;
  /** @deprecated No longer used for storage key – kept for API compat */
  posId?: string;
  /** @deprecated No longer used for storage key – kept for API compat */
  jornadaId?: string | null;
}

function readCartFromStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (e) {
    console.warn("[Cart] read from storage failed", e);
    return [];
  }
}

function writeCartToStorage(cart: CartItem[]) {
  try {
    if (cart.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    }
  } catch (e) {
    console.warn("[Cart] write to storage failed", e);
  }
}

export function usePersistedCart(_opts?: UsePersistedCartOptions) {
  const [cart, setCartState] = useState<CartItem[]>(() => readCartFromStorage());
  const [isHydrated, setIsHydrated] = useState(false);
  const [lastRemovedItem, setLastRemovedItem] = useState<CartItem | null>(null);
  const didHydrate = useRef(false);

  // Hydrate once on mount
  useEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    const stored = readCartFromStorage();
    if (stored.length > 0) {
      console.info("[Cart] hydrate", { items: stored.length });
      setCartState(stored);
    }
    setIsHydrated(true);
  }, []);

  // Persist to localStorage whenever cart changes (after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    writeCartToStorage(cart);
  }, [cart, isHydrated]);

  // Fallback: periodically check if React state lost items but storage has them
  useEffect(() => {
    if (!isHydrated) return;
    const interval = setInterval(() => {
      if (cart.length === 0) {
        const stored = readCartFromStorage();
        if (stored.length > 0) {
          console.info("[Cart] fallback rehydrate", { items: stored.length });
          setCartState(stored);
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [cart.length, isHydrated]);

  // Migrate from old dynamic keys on first load
  useEffect(() => {
    if (!isHydrated) return;
    try {
      // Check for old cart:* keys and migrate
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("cart:") && key !== STORAGE_KEY) {
          const oldRaw = localStorage.getItem(key);
          if (oldRaw && cart.length === 0) {
            const oldItems = JSON.parse(oldRaw);
            if (Array.isArray(oldItems) && oldItems.length > 0) {
              console.info("[Cart] migrating from old key", { key, items: oldItems.length });
              setCartState(oldItems);
            }
          }
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn("[Cart] migration failed", e);
    }
  }, [isHydrated]);

  // ── Cart mutations ──

  const setCart = useCallback((updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setCartState(updater);
  }, []);

  const addToCart = useCallback((cocktail: Cocktail, opts?: {
    isCourtesy?: boolean;
    courtesyCode?: string;
    overrideQty?: number;
  }) => {
    if (!opts?.isCourtesy && (!cocktail.price || cocktail.price <= 0)) return;
    setLastRemovedItem(null);

    if (opts?.isCourtesy) {
      console.info("[Cart] add courtesy", { productId: cocktail.id, qty: opts.overrideQty || 1 });
      setCartState((prev) => [
        ...prev,
        {
          cocktail: { ...cocktail, price: 0 },
          quantity: opts.overrideQty || 1,
          addons: [],
          isCourtesy: true,
          courtesyCode: opts.courtesyCode,
        },
      ]);
      return;
    }

    console.info("[Cart] add", { productId: cocktail.id, qty: 1 });
    setCartState((prev) => {
      const existing = prev.find((item) => item.cocktail.id === cocktail.id && !item.isCourtesy);
      if (existing) {
        return prev.map((item) =>
          item.cocktail.id === cocktail.id && !item.isCourtesy
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { cocktail, quantity: 1, addons: [] }];
    });
  }, []);

  const increaseQuantity = useCallback((cocktailId: string) => {
    console.info("[Cart] increase", { productId: cocktailId });
    setCartState((prev) =>
      prev.map((item) =>
        item.cocktail.id === cocktailId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  }, []);

  const decreaseQuantity = useCallback((cocktailId: string) => {
    setCartState((prev) => {
      const item = prev.find((i) => i.cocktail.id === cocktailId);
      if (!item) return prev;

      if (item.quantity > 1) {
        console.info("[Cart] decrease", { productId: cocktailId, newQty: item.quantity - 1 });
        return prev.map((i) =>
          i.cocktail.id === cocktailId ? { ...i, quantity: i.quantity - 1 } : i
        );
      }

      console.info("[Cart] remove", { productId: cocktailId });
      setLastRemovedItem(item);
      return prev.filter((i) => i.cocktail.id !== cocktailId);
    });
  }, []);

  const updateCartItemAddons = useCallback((cocktailId: string, addons: SelectedAddon[]) => {
    console.info("[Cart] update addons", { productId: cocktailId, addons: addons.length });
    setCartState((prev) =>
      prev.map((item) =>
        item.cocktail.id === cocktailId ? { ...item, addons } : item
      )
    );
  }, []);

  const undoLastRemove = useCallback(() => {
    if (lastRemovedItem) {
      console.info("[Cart] undo remove", { productId: lastRemovedItem.cocktail.id });
      setCartState((prev) => [...prev, lastRemovedItem]);
      setLastRemovedItem(null);
    }
  }, [lastRemovedItem]);

  const clearCart = useCallback(() => {
    console.info("[Cart] clear");
    setCartState([]);
    setLastRemovedItem(null);
  }, []);

  const calculateTotal = useCallback(() => {
    return cart.reduce((sum, item) => {
      const basePrice = item.cocktail.price * item.quantity;
      const addonsPrice = item.addons.reduce((a, addon) => a + addon.price, 0) * item.quantity;
      return sum + basePrice + addonsPrice;
    }, 0);
  }, [cart]);

  return {
    cart,
    setCart,
    isHydrated,
    lastRemovedItem,
    addToCart,
    increaseQuantity,
    decreaseQuantity,
    updateCartItemAddons,
    undoLastRemove,
    clearCart,
    calculateTotal,
  };
}
