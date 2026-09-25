import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";

/** "Volver" al panel: solo visible para quienes tienen acceso al panel de administración. */
export function AdminBackButton({ className, size = "sm", variant = "outline" }: Pick<ButtonProps, "className" | "size" | "variant">) {
  const navigate = useNavigate();
  const { hasRole } = useUserRole();
  if (!(hasRole("admin") || hasRole("gerencia") || hasRole("developer"))) return null;
  return (
    <Button variant={variant} size={size} className={`gap-2 ${className ?? ""}`} onClick={() => navigate("/admin")}>
      <ArrowLeft className="w-4 h-4" />
      Volver
    </Button>
  );
}
