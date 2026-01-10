import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  isLoading?: boolean;
}

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPrevPage,
  onNextPage,
  isLoading = false,
}: PaginationControlsProps) {
  if (totalCount === 0) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-muted-foreground">
        Mostrando {start} - {end} de {totalCount}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0 || isLoading}
          onClick={onPrevPage}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1 || isLoading}
          onClick={onNextPage}
        >
          Siguiente
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
