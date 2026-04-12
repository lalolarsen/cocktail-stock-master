import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches all rows from a Supabase query, paginating automatically
 * to bypass the default 1000-row limit.
 *
 * @param buildQuery - A function that returns a fresh PostgREST query builder.
 *   Called once per page so `.range()` can be applied cleanly.
 * @param pageSize - Rows per page (default 1000)
 */
export async function fetchAllRows<T = any>(
  buildQuery: () => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

/**
 * Fetches rows using `.in()` filter, batching the IDs to avoid
 * URL length limits and the 1000-row cap.
 *
 * @param table - Table name
 * @param column - Column to filter with `.in()`
 * @param ids - Array of IDs to filter
 * @param selectStr - Select string
 * @param batchSize - IDs per batch (default 500)
 */
export async function fetchAllByIds<T = any>(
  table: string,
  column: string,
  ids: string[],
  selectStr: string,
  batchSize = 500
): Promise<T[]> {
  if (ids.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      return fetchAllRows<T>(() =>
        supabase.from(table).select(selectStr).in(column, batch)
      );
    })
  );

  return results.flat();
}
