/** SI sizes like Android's Files app (DESIGN.md §15). */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1e6) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  if (bytes < 1e8) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes < 1e9) return `${Math.round(bytes / 1e6)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

export function formatSpeed(bps: number | null | undefined): string {
  const s = formatSize(bps);
  return s ? `${s}/s` : '';
}

export function formatEta(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(s / 3600);
  const rest = Math.round((s - h * 3600) / 60);
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function formatPercent(fraction: number | null | undefined): string {
  const f = Math.max(0, Math.min(fraction ?? 0, 0.999999));
  return `${Math.floor(f * 100)}%`;
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '';
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "12 Oct", "12 Oct 2024". */
export function relativeTime(ms: number, now: number = Date.now()): string {
  const diff = now - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const d = new Date(ms);
  const n = new Date(now);
  const days = Math.round((startOfDay(n) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `${Math.floor(diff / 3_600_000)} h ago`;
  if (days === 1) return 'yesterday';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === n.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function clockTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/** "12 Oct at 21:04" (year added when not this year). */
export function absoluteDate(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year} at ${clockTime(ms)}`;
}

/** "Today at 08:12" for Last seen. */
export function lastSeen(ms: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(ms))) / 86_400_000);
  if (days === 0) return `Today at ${clockTime(ms)}`;
  if (days === 1) return `Yesterday at ${clockTime(ms)}`;
  return absoluteDate(ms, now);
}

/** Library date group header. */
export function dateGroup(ms: number, now: number = Date.now()): string {
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(ms))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  const d = new Date(ms);
  const n = new Date(now);
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()) return 'Earlier';
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
