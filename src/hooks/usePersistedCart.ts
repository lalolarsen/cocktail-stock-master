import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Persisted Cart Hook
 *
 * Stores the cart in localStorage keyed by venue+pos+jornada.
 * Hydrates on mount, persists on every mutation.
 * Designed for reliability on Windows PWA / kiosk environments.
 */

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
  venueId: string | undefined;
  posId: string;
  jornadaId: string | null;
}

function buildKey(venueId: string, posId: string, jornadaId: string): string {
  return `cart:${venueId}:${posId}:${jornadaId}`;
}

export function usePersistedCart({ venueId, posId, jornadaId }: UsePersistedCartOptions) {
  const [cart, setCartState] = useState<CartItem[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [lastRemovedItem, setLastRemovedItem] = useState<CartItem | null>(null);
  const keyRef = useRef<string | null>(null);

  // Build storage key
  const storageKey = venueId && posId && jornadaId
    ? buildKey(venueId, posId, jornadaId)
    : null;

  // Hydrate from localStorage on key change
  useEffect(() => {
    if (!storageKey) {
      setCartState([]);
      setIsHydrated(true);
      return;
    }

    // If key changed, hydrate from new key
    if (keyRef.current !== storageKey) {
      keyRef.current = storageKey;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as CartItem[];
          if (Array.isArray(parsed)) {
            console.info("[Cart] hydrate", { items: parsed.length, key: storageKey });
            setCartState(parsed);
          } else {
            setCartState([]);
          }
        } else {
          setCartState([]);
        }
      } catch (e) {
        console.warn("[Cart] hydrate failed, resetting", e);
        setCartState([]);
      }
      setIsHydrated(true);
    }
  }, [storageKey]);

  // Persist to localStorage whenever cart changes (after hydration)
  useEffect(() => {
    if (!isHydrated || !storageKey) return;
    try {
      if (cart.length === 0) {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, JSON.stringify(cart));
      }
    } catch (e) {
      console.warn("[Cart] persist failed", e);
    }
  }, [cart, isHydrated, storageKey]);

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
