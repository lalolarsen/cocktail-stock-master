import { AlertTriangle } from "lucide-react";

interface DemoWatermarkProps {
  showBanner?: boolean;
}

export function DemoWatermark({ showBanner = true }: DemoWatermarkProps) {
  return (
    <>
      {/* Top Banner */}
      {showBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-amber-950 py-1.5 px-4 flex items-center justify-center gap-2 text-sm font-medium shadow-md">
          <AlertTriangle className="w-4 h-4" />
          <span>MODO DEMO — Los datos pueden reiniciarse en cualquier momento</span>
          <AlertTriangle className="w-4 h-4" />
        </div>
      )}
      
      {/* Watermark overlay */}
      <div 
        className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center opacity-[0.03]"
        style={{ 
          fontSize: '10vw',
          fontWeight: 900,
          letterSpacing: '0.1em',
          transform: 'rotate(-15deg)',
          userSelect: 'none'
        }}
      >
        DEMO
      </div>
    </>
  );
}
