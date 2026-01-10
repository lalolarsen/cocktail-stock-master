import { useState, useMemo, useCallback } from "react";

export const DEFAULT_PAGE_SIZE = 25;

interface PaginationState {
  page: number;
  pageSize: number;
}

interface UsePaginationOptions {
  initialPage?: number;
  pageSize?: number;
}

interface UsePaginationReturn {
  page: number;
  pageSize: number;
  offset: number;
  setPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  resetPage: () => void;
  getRange: () => { from: number; to: number };
  totalPages: (totalCount: number) => number;
  hasNextPage: (totalCount: number) => boolean;
  hasPrevPage: () => boolean;
}

export function usePagination(options: UsePaginationOptions = {}): UsePaginationReturn {
  const { initialPage = 0, pageSize = DEFAULT_PAGE_SIZE } = options;
  
  const [state, setState] = useState<PaginationState>({
    page: initialPage,
    pageSize,
  });

  const offset = useMemo(() => state.page * state.pageSize, [state.page, state.pageSize]);

  const setPage = useCallback((page: number) => {
    setState((prev) => ({ ...prev, page: Math.max(0, page) }));
  }, []);

  const nextPage = useCallback(() => {
    setState((prev) => ({ ...prev, page: prev.page + 1 }));
  }, []);

  const prevPage = useCallback(() => {
    setState((prev) => ({ ...prev, page: Math.max(0, prev.page - 1) }));
  }, []);

  const resetPage = useCallback(() => {
    setState((prev) => ({ ...prev, page: 0 }));
  }, []);

  const getRange = useCallback(() => ({
    from: state.page * state.pageSize,
    to: (state.page + 1) * state.pageSize - 1,
  }), [state.page, state.pageSize]);

  const totalPages = useCallback((totalCount: number) => 
    Math.ceil(totalCount / state.pageSize), [state.pageSize]);

  const hasNextPage = useCallback((totalCount: number) => 
    (state.page + 1) * state.pageSize < totalCount, [state.page, state.pageSize]);

  const hasPrevPage = useCallback(() => state.page > 0, [state.page]);

  return {
    page: state.page,
    pageSize: state.pageSize,
    offset,
    setPage,
    nextPage,
    prevPage,
    resetPage,
    getRange,
    totalPages,
    hasNextPage,
    hasPrevPage,
  };
}

// Utility component for consistent pagination UI
export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalCount: number;
}

export function getPaginationText(info: PaginationInfo): string {
  const start = info.page * info.pageSize + 1;
  const end = Math.min((info.page + 1) * info.pageSize, info.totalCount);
  return `${start} - ${end} de ${info.totalCount}`;
}
