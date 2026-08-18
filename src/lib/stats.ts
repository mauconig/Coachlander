export type StatsRange = { from: string; to: string };

export type StatsPreset = 'week' | 'month' | 'threeMonths' | 'custom';

const pad = (value: number) => String(value).padStart(2, '0');

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayRange(): StatsRange {
  return { from: isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: isoDate(new Date()) };
}

export function presetRange(preset: Exclude<StatsPreset, 'custom'>, now = new Date()): StatsRange {
  const to = isoDate(now);
  if (preset === 'week') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    return { from: isoDate(monday), to };
  }
  if (preset === 'threeMonths') {
    return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to };
  }
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to };
}

export function displayDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
}

export function displayRange(range: StatsRange): string {
  return `${displayDate(range.from)} — ${displayDate(range.to)}`;
}

export function parseDisplayDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function presetLabel(preset: StatsPreset, range: StatsRange): string {
  if (preset === 'week') return 'ESTA SEMANA';
  if (preset === 'month') return 'ESTE MES';
  if (preset === 'threeMonths') return 'ÚLTIMOS 3 MESES';
  return displayRange(range);
}
