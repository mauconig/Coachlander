/**
 * Number and date formatting for es-AR: comma decimal separator, thin-space
 * thousands grouping ("4 210 kg"), 24h clock.
 */

/** 42.5 -> "42,5"  ·  40 -> "40" */
export function num(value: number): string {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

/** 4210 -> "4 210" */
export function grouped(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Weight with unit, or "peso corporal" when the exercise carries no load. */
export function weight(value: number | null, unit: 'kg' | 'lb' = 'kg'): string {
  if (!value) return 'peso corporal';
  return `${num(value)} ${unit}`;
}

/** Same as `weight` but capitalised for standalone display. */
export function weightLabel(value: number | null, unit: 'kg' | 'lb' = 'kg'): string {
  if (!value) return 'Peso corporal';
  return `${num(value)} ${unit}`;
}

/** 432 -> "7:12" */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 522 -> "8 h 42" */
export function hoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const WEEKDAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];

/** Date -> "MARTES 12 AGO" */
export function longDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Date -> { day: "11", month: "AGO" } for the calendar badges */
export function dayBadge(date: Date): { day: string; month: string } {
  return { day: String(date.getDate()).padStart(2, '0'), month: MONTHS[date.getMonth()] };
}

export function monthName(date: Date): string {
  return MONTHS[date.getMonth()];
}

/** "4 × 8" -> 8 */
export function repsOfScheme(scheme: string): number {
  const parts = scheme.split('×');
  return parseInt((parts[1] ?? parts[0]).trim(), 10) || 0;
}

/** "4 × 8" -> 4 */
export function setsOfScheme(scheme: string): number {
  return parseInt(scheme.split('×')[0].trim(), 10) || 0;
}
