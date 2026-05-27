import type { Pagination } from './types';

const SAFETY_PAGE_CAP = 50;

type PageResponse<T, K extends string> = { pagination: Pagination | null } & Record<K, T[]>;

export async function fetchAllPages<T, K extends string>(
  fetcher: (page: number, pageSize: number) => Promise<PageResponse<T, K>>,
  itemsKey: K,
  pageSize = 100,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= SAFETY_PAGE_CAP; page++) {
    const res = await fetcher(page, pageSize);
    const items = res[itemsKey];
    if (!items?.length) break;
    all.push(...items);
    const totalPages = res.pagination?.total_pages ?? 1;
    if (page >= totalPages) break;
  }
  return all;
}
