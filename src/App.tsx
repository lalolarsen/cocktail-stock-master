import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppSessionProvider, useAppSession } from "@/contexts/AppSessionContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { Suspense, lazy } from "react";

// Eager: rutas críticas del POS y autenticación (deben abrir al instante en tablets)
import Sales from "./pages/Sales";
import Tickets from "./pages/Tickets";
import Auth from "./pages/Auth";
import NoJornada from "./pages/NoJornada";
import ProtectedRoute from "./components/ProtectedRoute";

// Diferidas: admin, reportes, compras, developer y utilidades
const Admin = lazy(() => import("./pages/Admin"));
const Documents = lazy(() => import("./pages/Documents"));
const PickupTokens = lazy(() => import("./pages/PickupTokens"));
const PickupRedemptions = lazy(() => import("./pages/PickupRedemptions"));
const DevAuth = lazy(() => import("./pages/DevAuth"));
const Help = lazy(() => import("./pages/Help"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SystemSettings = lazy(() => import("./pages/SystemSettings"));
const Income = lazy(() => import("./pages/Income"));
const PurchasesImport = lazy(() => import("./pages/PurchasesImport"));
const ProveedoresImportDetail = lazy(() => import("./pages/ProveedoresImportDetail"));
const PendingCatalog = lazy(() => import("./pages/PendingCatalog"));
const FeatureFlagsAdmin = lazy(() => import("./pages/FeatureFlagsAdmin"));
const SystemMonitoring = lazy(() => import("./pages/SystemMonitoring"));
const Proveedores = lazy(() => import("./pages/Proveedores"));
const DebugProducts = lazy(() => import("./pages/DebugProducts"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));

const queryClient = new QueryClient();

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
        <p className="text-base text-muted-foreground">Cargando…</p>
      </div>
    </div>
  );
}


// Inner component that uses the session context
function AppRoutes() {
  const { isAuthenticated, isLoading } = useAppSession();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to="/admin" replace />
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route path="/auth" element={<Auth />} />
      <Route path="/dev-auth" element={<DevAuth />} />
      <Route path="/no-jornada" element={<NoJornada />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/documents"
        element={
          <ProtectedRoute allowedRoles={["admin", "gerencia"]}>
            <Documents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/pickup-tokens"
        element={
          <ProtectedRoute allowedRoles={["admin", "gerencia"]}>
            <PickupTokens />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/pickups"
        element={
          <ProtectedRoute allowedRoles={["admin", "gerencia"]}>
            <PickupRedemptions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/system"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <SystemSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/income"
        element={
          <ProtectedRoute allowedRoles={["admin", "gerencia"]}>
            <Income />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/proveedores"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Proveedores />
          </ProtectedRoute>
        }
      />
      <Route path="/debug/products" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DebugProducts />
        </ProtectedRoute>
      } />
      <Route
        path="/admin/purchases/import"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <PurchasesImport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/proveedores/import/:id"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <ProveedoresImportDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/catalog/pending"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <PendingCatalog />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/feature-flags"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <FeatureFlagsAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/monitoring"
        element={
          <ProtectedRoute allowedRoles={["admin", "gerencia"]}>
            <SystemMonitoring />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gerencia"
        element={
          <ProtectedRoute allowedRoles={["gerencia"]}>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedRoute allowedRoles={["vendedor", "admin"]}>
            <Sales />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tickets"
        element={
          <ProtectedRoute allowedRoles={["ticket_seller", "vendedor", "admin"]}>
            <Tickets />
          </ProtectedRoute>
        }
      />
      <Route path="/help" element={<Help />} />
      <Route path="/unsubscribe" element={<Unsubscribe />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppSessionProvider>
              <AppRoutes />
            </AppSessionProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
