import type {
  Client,
  Exercise,
  ImportedExercise,
  OverloadRow,
  Routine,
  SessionRecord,
} from './types';

/**
 * Seed content. Every name, load and copy string here comes from the design
 * doc so the built screens read exactly like the mockups.
 */

export const COACH = {
  name: 'Camila Rossi',
  shortName: 'Camila R.',
  firstName: 'Camila',
  specialty: 'Fuerza e hipertrofia · Rosario',
  code: 'CR74A9',
} as const;

export const ATHLETE = {
  name: 'Nadia Ferrer',
  firstName: 'Nadia',
  goal: 'Hipertrofia · 4 días / semana',
  weightKg: 68.4,
  heightM: 1.71,
  totalSessions: 42,
  streakWeeks: 6,
} as const;

export const EXERCISES: Exercise[] = [
  {
    id: 'press-banca',
    name: 'Press banca',
    scheme: '4 × 8',
    suggested: 42.5,
    sets: 4,
    work: 45,
    rest: 90,
    focus: 'EMPUJE · PECHO, TRÍCEPS',
    cues:
      'Escápulas retraídas y pies firmes. Bajá la barra al esternón en 3 segundos, tocá sin rebote y empujá. Codos a 45 grados del torso.',
    overload: 2.5,
    lastTime: {
      date: '5 AGO',
      load: 40,
      reps: [8, 8, 8, 7],
      note: 'Cerraste con RIR 2. Por eso hoy el plan sugiere 42,5 kg.',
    },
  },
  {
    id: 'press-militar',
    name: 'Press militar',
    scheme: '3 × 10',
    suggested: 27.5,
    sets: 3,
    work: 50,
    rest: 90,
    focus: 'EMPUJE · HOMBROS',
    cues:
      'Glúteos y abdomen firmes para no arquear la espalda. Subí la barra en línea recta pasando cerca de la cara.',
    overload: null,
  },
  {
    id: 'fondos',
    name: 'Fondos en paralelas',
    scheme: '3 × 8',
    suggested: 0,
    sets: 3,
    work: 40,
    rest: 75,
    focus: 'EMPUJE · PECHO, TRÍCEPS',
    cues:
      'Incliná apenas el torso hacia adelante para cargar más pecho. Bajá hasta que el hombro quede a la altura del codo.',
    overload: null,
  },
  {
    id: 'aperturas-polea',
    name: 'Aperturas en polea',
    scheme: '3 × 12',
    suggested: 12.5,
    sets: 3,
    work: 55,
    rest: 60,
    focus: 'EMPUJE · PECHO',
    cues: 'Codos apenas flexionados y fijos. Juntá las manos al centro y aguantá un segundo.',
    overload: null,
  },
  {
    id: 'triceps-soga',
    name: 'Extensión de tríceps',
    scheme: '3 × 15',
    suggested: 15,
    sets: 3,
    work: 60,
    rest: 60,
    focus: 'EMPUJE · TRÍCEPS',
    cues: 'Codos pegados al cuerpo. Extendé hasta bloquear y volvé despacio.',
    overload: null,
  },
];

export const TODAY_ROUTINE: Routine = {
  id: 'empuje-a-s6',
  name: 'Empuje A',
  block: 'Fuerza',
  week: 6,
  day: 2,
  coach: COACH.shortName,
  athleteId: 'nadia',
  estimatedMinutes: 48,
  secondsPerSet: 45,
  exercises: EXERCISES,
};

export const TOTAL_SETS = EXERCISES.reduce((n, e) => n + e.sets, 0);

export const CLIENTS: Client[] = [
  {
    id: 'nadia',
    name: 'Nadia Ferrer',
    status: 'Empuje A · serie 2 de 16 · 07:12',
    live: { routine: 'Empuje A', setIndex: 2, totalSets: 16, elapsed: '07:12' },
  },
  { id: 'martin', name: 'Martín Juárez', status: 'Pierna B hoy · sin empezar' },
  { id: 'lucia', name: 'Lucía Paz', status: 'Terminó Tirón A · 100 %', done: true },
  { id: 'diego', name: 'Diego Ríos', status: '3 sesiones sin cargar', attention: true },
  { id: 'sofia', name: 'Sofía Aguirre', status: 'Semana 3 de 8 · al día' },
];

export const CLIENT_COUNT = 14;

export const HISTORY: SessionRecord[] = [
  {
    id: 's-11',
    date: new Date(2025, 7, 11),
    name: 'Tirón B · Espalda',
    minutes: 52,
    sets: 18,
    volume: 4210,
    completion: 100,
  },
  {
    id: 's-08',
    date: new Date(2025, 7, 8),
    name: 'Pierna A',
    minutes: 61,
    sets: 20,
    volume: 7880,
    completion: 100,
  },
  {
    id: 's-05',
    date: new Date(2025, 7, 5),
    name: 'Empuje A',
    minutes: 47,
    sets: 16,
    volume: 3640,
    completion: 88,
  },
];

export const HISTORY_SUMMARY = {
  sessions: 11,
  totalMinutes: 522,
  completion: 96,
} as const;

/**
 * Three weeks of the month grid on the history screen.
 * 'done' = trained, 'today' = today, 'rest' = no session planned.
 */
export type DayMark = 'done' | 'today' | 'rest' | 'planned';
export const MONTH_GRID: DayMark[] = [
  'done', 'rest', 'done', 'rest', 'done', 'rest', 'rest',
  'done', 'rest', 'done', 'done', 'rest', 'done', 'rest',
  'done', 'today', 'planned', 'rest', 'rest', 'rest', 'rest',
];

export const OVERLOAD_ROWS: OverloadRow[] = [
  { set: 1, lastLoad: 40, lastReps: 8, nextLoad: 42.5, nextReps: 8 },
  { set: 2, lastLoad: 40, lastReps: 8, nextLoad: 42.5, nextReps: 8 },
  { set: 3, lastLoad: 40, lastReps: 8, nextLoad: 42.5, nextReps: 8 },
  { set: 4, lastLoad: 40, lastReps: 7, nextLoad: 40, nextReps: 8 },
];

/** Weekly tonnage for the bar chart, normalised against the peak week. */
export const WEEKLY_VOLUME = [2380, 2880, 2760, 3880, 4640, 6270];

export const PROGRESS_SUMMARY = {
  topLoad: 42.5,
  windowLabel: 'EN 6 SEMANAS',
  growth: '+18 %',
} as const;

/** What the importer "detected" from the sample spreadsheet. */
export const IMPORT_SOURCE_FILE = 'planilla_empuje.xlsx';

export const IMPORT_SAMPLE_TEXT = `LUNES — EMPUJE
banca 4x8 42,5
militar 3x10 27.5kg
fondos 3x8 pc
aperturas polea 3x12 12,5
tríceps soga 3x15 15
descanso 90s, ultima serie al fallo`;

export const IMPORT_RESULT: ImportedExercise[] = [
  { id: 'i1', name: 'Press banca', sets: 4, reps: 8, load: 42.5, rest: 90 },
  { id: 'i2', name: 'Press militar', sets: 3, reps: 10, load: 27.5, rest: 90 },
  { id: 'i3', name: 'Fondos en paralelas', sets: 3, reps: 8, load: null, rest: 75 },
  {
    id: 'i4',
    name: 'Extensión de tríceps',
    sets: 3,
    reps: 15,
    load: 15,
    rest: 60,
    uncertain: true,
    raw: '«tríceps soga 3x15 15»',
    question: 'No sé si son 15 kg o 15 reps',
    options: ['3 × 15 · 15 KG', '3 × 15 REPS'],
  },
  { id: 'i5', name: 'Aperturas en polea', sets: 3, reps: 12, load: 12.5, rest: 60 },
];

export const IMPORT_ESTIMATE_MINUTES = 48;

export const ATHLETE_SETTINGS = [
  { id: 'units', label: 'Unidades y equipamiento', value: 'kg' },
  { id: 'rest', label: 'Descanso por defecto', value: '90 s' },
  { id: 'reminder', label: 'Recordatorio de sesión', value: '18:30', accent: true },
  { id: 'export', label: 'Exportar mis datos', value: '' },
];

export const COACH_SETTINGS = [
  { id: 'units', label: 'Unidades por defecto', value: 'kg' },
  { id: 'rest', label: 'Descanso por defecto', value: '90 s' },
  { id: 'overload', label: 'Overload automático', value: '+2,5 kg', accent: true },
  { id: 'export', label: 'Exportar datos de alumnos', value: '' },
];

/** Coach-side routine library, behind the Rutinas tab. */
export const TEMPLATES = [
  {
    id: 'empuje-a',
    name: 'Empuje A · Semana 6',
    meta: '5 ejercicios · 16 series · 48 min',
    assigned: 'Nadia F.',
  },
  {
    id: 'tiron-b',
    name: 'Tirón B · Espalda',
    meta: '6 ejercicios · 18 series · 52 min',
    assigned: 'Lucía P.',
  },
  {
    id: 'pierna-a',
    name: 'Pierna A',
    meta: '6 ejercicios · 20 series · 61 min',
    assigned: 'Martín J.',
  },
  {
    id: 'full-body',
    name: 'Full body · Inicial',
    meta: '5 ejercicios · 15 series · 40 min',
    assigned: null,
  },
];

/** Coach inbox previews, keyed by client id. */
export const THREADS = [
  { clientId: 'nadia', preview: '¿Subo a 45 la semana que viene?', when: '09:12', unread: true },
  { clientId: 'diego', preview: 'Esta semana no pude ir al gimnasio', when: 'AYER', unread: true },
  { clientId: 'lucia', preview: '¡Listo el tirón! Gracias 💪', when: 'AYER', unread: false },
  { clientId: 'martin', preview: 'Me duele el hombro en el press', when: '11 AGO', unread: false },
  { clientId: 'sofia', preview: 'Perfecto, arranco mañana', when: '09 AGO', unread: false },
];
