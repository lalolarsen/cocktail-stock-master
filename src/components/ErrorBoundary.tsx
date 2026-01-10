import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";
import { logError } from "@/lib/monitoring";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error to database
    logError({
      route: window.location.pathname,
      error_message: error.message,
      stack: error.stack,
      meta: {
        componentStack: errorInfo.componentStack,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
    });
    
    // Also log to console for development
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  handleReport = () => {
    const { error, errorInfo } = this.state;
    const subject = encodeURIComponent(`Error Report: ${error?.message || "Unknown error"}`);
    const body = encodeURIComponent(
      `Error: ${error?.message}\n\nStack: ${error?.stack}\n\nComponent Stack: ${errorInfo?.componentStack}`
    );
    window.open(`mailto:soporte@coctelstock.com?subject=${subject}&body=${body}`);
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                
                <div>
                  <h2 className="text-xl font-bold mb-2">Algo salió mal</h2>
                  <p className="text-muted-foreground text-sm">
                    Ha ocurrido un error inesperado. Nuestro equipo ha sido notificado.
                  </p>
                </div>

                {this.state.error && (
                  <div className="bg-muted rounded-lg p-3 text-left">
                    <p className="text-xs font-mono text-muted-foreground break-all">
                      {this.state.error.message}
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button onClick={this.handleRetry} className="flex-1 gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Reintentar
                  </Button>
                  <Button onClick={this.handleGoHome} variant="outline" className="flex-1 gap-2">
                    <Home className="h-4 w-4" />
                    Volver al inicio
                  </Button>
                </div>

                <Button
                  onClick={this.handleReport}
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-muted-foreground"
                >
                  <Bug className="h-4 w-4" />
                  Reportar problema
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
