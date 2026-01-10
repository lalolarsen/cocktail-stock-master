import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Sales from "./pages/Sales";
import Admin from "./pages/Admin";
import Documents from "./pages/Documents";
import PickupTokens from "./pages/PickupTokens";
import PickupRedemptions from "./pages/PickupRedemptions";
import Bar from "./pages/Bar";
import Auth from "./pages/Auth";
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
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const App = () => {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
                <ProtectedRoute allowedRoles={["ticket_seller", "admin"]}>
                  <Tickets />
                </ProtectedRoute>
              }
            />
            <Route path="/help" element={<Help />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;
