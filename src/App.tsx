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
import ProtectedRoute from "./components/ProtectedRoute";
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
                <ProtectedRoute allowedRoles={["ticket_seller"]}>
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
  );
};

export default App;
