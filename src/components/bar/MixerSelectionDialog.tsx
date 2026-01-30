import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GlassWater, Check, X, Loader2 } from "lucide-react";

export interface MixerSlot {
  slot_index: number;
  label: string;
  default_product_id: string;
  default_product_name: string;
  quantity: number;
  available_options: { id: string; name: string }[];
}

interface MixerSelectionDialogProps {
  mixerSlots: MixerSlot[];
  onConfirm: (selections: { slot_index: number; product_id: string }[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function MixerSelectionDialog({
  mixerSlots,
  onConfirm,
  onCancel,
  isLoading = false,
}: MixerSelectionDialogProps) {
  // Initialize selections with defaults
  const [selections, setSelections] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    mixerSlots.forEach((slot) => {
      initial[slot.slot_index] = slot.default_product_id;
    });
    return initial;
  });

  const handleSelect = (slotIndex: number, productId: string) => {
    setSelections((prev) => ({ ...prev, [slotIndex]: productId }));
  };

  const handleConfirm = () => {
    const result = Object.entries(selections).map(([slot_index, product_id]) => ({
      slot_index: parseInt(slot_index),
      product_id,
    }));
    onConfirm(result);
  };

  // All slots must have a selection
  const allSelected = mixerSlots.every((slot) => selections[slot.slot_index]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <GlassWater className="w-8 h-8" />
        <div>
          <h1 className="text-xl font-bold">Seleccionar Mixer</h1>
          <p className="text-sm opacity-90">¿Con qué bebida lo preparo?</p>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {mixerSlots.map((slot) => (
            <div key={slot.slot_index} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">{slot.label}</h2>
                <Badge variant="secondary">{slot.quantity}ml</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {slot.available_options.map((option) => {
                  const isSelected = selections[slot.slot_index] === option.id;
                  const isDefault = option.id === slot.default_product_id;

                  return (
                    <Card
                      key={option.id}
                      onClick={() => handleSelect(slot.slot_index, option.id)}
                      className={`p-3 cursor-pointer transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 ring-2 ring-primary"
                          : "hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <Check className="w-5 h-5 text-primary shrink-0" />
                        )}
                        <span className={`text-sm ${isSelected ? "font-semibold" : ""}`}>
                          {option.name}
                        </span>
                        {isDefault && !isSelected && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t bg-muted/50 flex gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 h-14 text-lg"
        >
          <X className="w-5 h-5 mr-2" />
          Cancelar
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={!allSelected || isLoading}
          className="flex-1 h-14 text-lg"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <Check className="w-5 h-5 mr-2" />
          )}
          Confirmar
        </Button>
      </div>
    </div>
  );
}
