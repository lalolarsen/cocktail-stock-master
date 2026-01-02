import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  HelpCircle, 
  Store, 
  Wine, 
  Warehouse, 
  RefreshCw, 
  Users, 
  FileText, 
  Mail,
  MessageCircle,
  BookOpen,
  ExternalLink
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useNavigate } from "react-router-dom";

const FAQS = [
  {
    question: "¿Cuál es la diferencia entre Barra, POS y Bodega?",
    answer: `
      <strong>Bodega (Warehouse):</strong> Es tu almacén central donde guardas todo el inventario. Solo hay una bodega por local.
      <br/><br/>
      <strong>Barra:</strong> Es un punto de despacho donde se preparan los tragos. Cada barra tiene su propio inventario que se repone desde la bodega. Puedes tener múltiples barras (ej: Barra Principal, Barra Terraza).
      <br/><br/>
      <strong>POS (Caja):</strong> Es el terminal de venta donde los vendedores registran las ventas. Cada POS está asociado a una barra para el despacho de los pedidos.
    `
  },
  {
    question: "¿Cómo funciona el flujo de inventario?",
    answer: `
      1. <strong>Compras:</strong> El inventario entra a la Bodega principal.
      <br/><br/>
      2. <strong>Reposición:</strong> Antes de cada jornada, el admin crea un plan de reposición para mover productos desde la Bodega a cada Barra.
      <br/><br/>
      3. <strong>Ventas:</strong> Cuando el barman escanea un QR de retiro, el stock se descuenta de la Barra correspondiente.
      <br/><br/>
      4. <strong>Trazabilidad:</strong> Cada movimiento queda registrado para reportes y auditoría.
    `
  },
  {
    question: "¿Cómo funcionan los códigos QR de retiro?",
    answer: `
      Cuando un vendedor registra una venta, el sistema genera un código QR único que el cliente muestra en la barra.
      <br/><br/>
      El barman escanea el QR con su dispositivo, verificando:
      <ul class="list-disc pl-6 mt-2">
        <li>Que el pago esté confirmado</li>
        <li>Que el QR no haya sido usado antes</li>
        <li>Que no esté expirado (2 horas)</li>
        <li>Que haya stock disponible</li>
      </ul>
      <br/>
      Al confirmar, el stock se descuenta automáticamente y el pedido se marca como entregado.
    `
  },
  {
    question: "¿Pueden varios vendedores vender al mismo tiempo?",
    answer: `
      ¡Sí! El sistema está diseñado para múltiples cajas simultáneas:
      <br/><br/>
      <ul class="list-disc pl-6">
        <li>Cada venta recibe un número único garantizado</li>
        <li>Los números de venta se generan con secuencias de base de datos</li>
        <li>No hay conflictos aunque 10 vendedores procesen ventas al mismo instante</li>
      </ul>
    `
  },
  {
    question: "¿Qué es una Jornada?",
    answer: `
      Una Jornada es un período de operación (típicamente un día o turno). Permite:
      <br/><br/>
      <ul class="list-disc pl-6">
        <li>Agrupar todas las ventas del período</li>
        <li>Hacer corte de caja al final</li>
        <li>Generar reportes por período</li>
        <li>Controlar cuándo se puede vender</li>
      </ul>
      <br/>
      Solo puede haber una jornada activa a la vez.
    `
  },
  {
    question: "¿Cómo agrego más productos o cócteles?",
    answer: `
      <strong>Productos (ingredientes):</strong>
      <br/>
      Ve a Panel Admin → Productos → Agregar producto. También puedes importar desde Excel.
      <br/><br/>
      <strong>Cócteles (menú):</strong>
      <br/>
      Ve a Panel Admin → Menú → Agregar cóctel. Define el nombre, precio, y la receta (qué productos e ingredientes usa).
    `
  },
  {
    question: "¿Qué roles de usuario existen?",
    answer: `
      <ul class="list-disc pl-6">
        <li><strong>Admin:</strong> Control total del sistema</li>
        <li><strong>Gerencia:</strong> Vista de reportes y datos (solo lectura)</li>
        <li><strong>Vendedor:</strong> Acceso al portal de ventas</li>
        <li><strong>Bar:</strong> Acceso al portal de despacho (escaneo QR)</li>
      </ul>
    `
  }
];

const CONCEPTS = [
  {
    icon: <Warehouse className="w-6 h-6" />,
    title: "Bodega",
    description: "Tu almacén central. Todo el inventario empieza aquí y se repone a las barras."
  },
  {
    icon: <Wine className="w-6 h-6" />,
    title: "Barra",
    description: "Punto de despacho con su propio inventario. Los barmen preparan los pedidos aquí."
  },
  {
    icon: <Store className="w-6 h-6" />,
    title: "Caja POS",
    description: "Terminal de venta donde los vendedores registran las ventas y generan QRs."
  },
  {
    icon: <RefreshCw className="w-6 h-6" />,
    title: "Reposición",
    description: "Proceso de mover productos desde la bodega a las barras antes de cada jornada."
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: "Jornada",
    description: "Un período de operación (día o turno) que agrupa ventas, gastos y reportes."
  },
  {
    icon: <FileText className="w-6 h-6" />,
    title: "Documentos",
    description: "Boletas y facturas electrónicas emitidas automáticamente con cada venta."
  }
];

export default function Help() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <HelpCircle className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Centro de Ayuda</h1>
              <p className="text-muted-foreground">Guías y preguntas frecuentes</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Volver
          </Button>
        </div>

        {/* Concepts Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Conceptos Clave
            </CardTitle>
            <CardDescription>
              Entiende cómo funciona el sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {CONCEPTS.map((concept, index) => (
                <Card key={index} className="p-4 bg-muted/30">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                      {concept.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold">{concept.title}</h3>
                      <p className="text-sm text-muted-foreground">{concept.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* FAQs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              Preguntas Frecuentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <div 
                      className="text-muted-foreground prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: faq.answer }}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Support Contact */}
        <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/20 rounded-lg">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">¿Necesitas más ayuda?</h3>
                  <p className="text-muted-foreground">
                    Nuestro equipo está listo para asistirte
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <a href="mailto:soporte@coctelstock.cl">
                    <Mail className="w-4 h-4 mr-2" />
                    soporte@coctelstock.cl
                  </a>
                </Button>
                <Button asChild>
                  <a href="https://wa.me/56912345678" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}