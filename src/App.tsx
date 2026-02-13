import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppSessionProvider, useAppSession } from "@/contexts/AppSessionContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// Lazy load pages for better performance
import Sales from "./pages/Sales";
import Admin from "./pages/Admin";
import Documents from "./pages/Documents";
import PickupTokens from "./pages/PickupTokens";
import PickupRedemptions from "./pages/PickupRedemptions";
import Bar from "./pages/Bar";
import Auth from "./pages/Auth";
import DevAuth from "./pages/DevAuth";
import Help from "./pages/Help";
import NotFound from "./pages/NotFound";
import SystemSettings from "./pages/SystemSettings";
import Tickets from "./pages/Tickets";
import Income from "./pages/Income";
import IncomeStatement from "./pages/IncomeStatement";
import PurchasesImport from "./pages/PurchasesImport";
import PendingCatalog from "./pages/PendingCatalog";
import FeatureFlagsAdmin from "./pages/FeatureFlagsAdmin";
import SystemMonitoring from "./pages/SystemMonitoring";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

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
        path="/admin/reports/estado-resultados"
        element={
          <ProtectedRoute allowedRoles={["admin", "gerencia"]}>
            <IncomeStatement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/purchases/import"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <PurchasesImport />
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
        path="/bar"
        element={
          <ProtectedRoute allowedRoles={["bar"]}>
            <Bar />
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
