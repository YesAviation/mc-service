export function formatDuration(secondsTotal: number): string {
  if (!Number.isFinite(secondsTotal) || secondsTotal < 0) return '0:00';
  const total = Math.floor(secondsTotal);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatMillis(millis: number): string {
  return formatDuration(millis / 1000);
}

export function ensureAbsoluteUrl(baseUrl: string | undefined, relative: string | null | undefined): string | null {
  if (!relative) return null;
  if (/^https?:\/\//i.test(relative)) return relative;
  if (!baseUrl) return null;
  const sep = relative.startsWith('/') ? '' : '/';
  return `${baseUrl.replace(/\/+$/, '')}${sep}${relative}`;
}
