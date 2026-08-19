import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = process.argv[2];
const outputPath = process.argv[3] ?? new URL('./exercise-catalog.json', import.meta.url);
const sourceUrl = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json';

const BODY_PARTS = {
  back: 'Espalda',
  cardio: 'Cardio',
  chest: 'Pecho',
  'lower arms': 'Antebrazos',
  'lower legs': 'Pantorrillas',
  neck: 'Cuello',
  shoulders: 'Hombros',
  'upper arms': 'Brazos',
  'upper legs': 'Piernas',
  waist: 'Core',
};

const EQUIPMENT = {
  'body weight': 'Peso corporal',
  band: 'Banda elástica',
  barbell: 'Barra',
  cable: 'Polea',
  dumbbell: 'Mancuerna',
  'ez barbell': 'Barra EZ',
  kettlebell: 'Pesa rusa',
  'leverage machine': 'Máquina',
  'medicine ball': 'Balón medicinal',
  other: 'Otro',
  'resistance band': 'Banda elástica',
  'smith machine': 'Máquina Smith',
  weighted: 'Lastrado',
};

const MUSCLES = {
  abs: 'Abdominales',
  biceps: 'Bíceps',
  calves: 'Pantorrillas',
  chest: 'Pecho',
  delts: 'Deltoides',
  forearms: 'Antebrazos',
  glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales',
  lats: 'Dorsales',
  'lower back': 'Espalda baja',
  obliques: 'Oblicuos',
  pectorals: 'Pectorales',
  quadriceps: 'Cuádriceps',
  shoulders: 'Hombros',
  traps: 'Trapecios',
  triceps: 'Tríceps',
};

const PHRASES = [
  ['band horizontal pallof press', 'press Pallof horizontal con banda'],
  ['band vertical pallof press', 'press Pallof vertical con banda'],
  ['band bench press', 'press de banca con banda'],
  ['band pull through', 'jalón de cadera con banda'],
  ['band step-up', 'subida al banco con banda'],
  ['band v-up', 'abdominal en V con banda'],
  ['all fours', 'en cuadrupedia'],
  ['toe touch', 'toque de pies'],
  ['arms apart', 'brazos separados'],
  ['lower back curl', 'curl lumbar'],
  ['pelvic tilt', 'inclinación pélvica'],
  ['butt-ups', 'elevación de glúteos'],
  ['curl-up', 'abdominal'],
  ['body-up', 'elevación corporal'],
  ['bottoms-up', 'desde abajo'],
  ['barbell bench press', 'press de banca con barra'],
  ['dumbbell bench press', 'press de banca con mancuernas'],
  ['barbell shoulder press', 'press de hombros con barra'],
  ['dumbbell shoulder press', 'press de hombros con mancuernas'],
  ['barbell deadlift', 'peso muerto con barra'],
  ['dumbbell deadlift', 'peso muerto con mancuernas'],
  ['barbell full squat', 'sentadilla completa con barra'],
  ['dumbbell biceps curl', 'curl de bíceps con mancuernas'],
  ['cable crossover', 'cruce de poleas'],
  ['cable pushdown', 'extensión de tríceps en polea'],
  ['lat pulldown', 'jalón al pecho'],
  ['pull up', 'dominada'],
  ['push up', 'flexión'],
  ['sit up', 'abdominal'],
  ['leg press', 'prensa de piernas'],
  ['leg extension', 'extensión de piernas'],
  ['leg curl', 'curl femoral'],
  ['calf raise', 'elevación de pantorrillas'],
  ['lateral raise', 'elevación lateral'],
  ['front raise', 'elevación frontal'],
  ['rear delt fly', 'apertura posterior'],
  ['bent over row', 'remo inclinado'],
  ['upright row', 'remo al mentón'],
  ['romanian deadlift', 'peso muerto rumano'],
  ['bulgarian split squat', 'sentadilla búlgara'],
  ['hip thrust', 'empuje de cadera'],
  ['glute kickback', 'patada de glúteo'],
];

const WORDS = [
  ['alternate', 'alternado'],
  ['archer', 'arquero'],
  ['legs', 'piernas'],
  ['leg', 'pierna'],
  ['arms', 'brazos'],
  ['male', ''],
  ['squad stretch', 'estiramiento'],
  ['pallof', 'Pallof'],
  ['air bike', 'bicicleta de aire'],
  ['side bend', 'inclinación lateral'],
  ['heel touchers', 'toques de talón'],
  ['ankle circles', 'círculos de tobillo'],
  ['arm slingers', 'balanceos de brazos'],
  ['bent knee', 'rodillas flexionadas'],
  ['straight legs', 'piernas extendidas'],
  ['back and forth', 'adelante y atrás'],
  ['backward', 'hacia atrás'],
  ['forward', 'hacia adelante'],
  ['balance board', 'tabla de equilibrio'],
  ['assisted', 'asistido'],
  ['rollerout', 'extensión con rueda'],
  ['bench dip', 'fondos en banco'],
  ['concentration curl', 'curl concentrado'],
  ['hip lift', 'elevación de cadera'],
  ['horizontal', 'horizontal'],
  ['reverse', 'inverso'],
  ['shoulder', 'hombro'],
  ['shrug', 'encogimiento'],
  ['wrist curl', 'curl de muñeca'],
  ['battling ropes', 'cuerdas de batalla'],
  ['bear crawl', 'gateo de oso'],
  ['chest dip', 'fondos de pecho'],
  ['straight bar', 'barra recta'],
  ['chin-up', 'dominada supina'],
  ['cocoons', 'abdominales tipo oruga'],
  ['cycle', 'bicicleta'],
  ['cross trainer', 'elíptica'],
  ['dead bug', 'bicho muerto'],
  ['elbow', 'codo'],
  ['knee', 'rodilla'],
  ['exercise ball', 'pelota de ejercicio'],
  ['hug', 'abrazo'],
  ['farmers walk', 'caminata del granjero'],
  ['finger curls', 'curl de dedos'],
  ['flutter kicks', 'patadas alternas'],
  ['frog', 'rana'],
  ['front lever', 'palanca frontal'],
  ['full', 'completo'],
  ['hands', 'manos'],
  ['handstand', 'parada de manos'],
  ['hanging', 'colgado'],
  ['pike', 'pica'],
  ['high knee', 'rodilla alta'],
  ['impossible', 'imposible'],
  ['inchworm', 'gusano'],
  ['isometric', 'isométrico'],
  ['wipers', 'limpiaparabrisas'],
  ['jack burpee', 'burpee con salto de tijera'],
  ['jump rope', 'soga'],
  ['kick out', 'patada hacia afuera'],
  ['kipping', 'con balanceo'],
  ['muscle up', 'muscle-up'],
  ['korean', 'coreano'],
  ['landmine', 'mina terrestre'],
  ['lean', 'inclinado'],
  ['left hook', 'gancho izquierdo'],
  ['boxing', 'de boxeo'],
  ['flat bench', 'banco plano'],
  ['lever', 'en máquina de palanca'],
  ['gripless', 'sin agarre'],
  ['grip', 'agarre'],
  ['military', 'militar'],
  ['one arm', 'a un brazo'],
  ['overhand', 'prono'],
  ['preacher', 'predicador'],
  ['pullover', 'pull-over'],
  ['medicine ball', 'balón medicinal'],
  ['overhead', 'por encima de la cabeza'],
  ['slam', 'lanzamiento'],
  ['mixed grip', 'agarre mixto'],
  ['monster walk', 'caminata de monstruo'],
  ['mountain climber', 'escalador'],
  ['quads', 'cuádriceps'],
  ['quick feet', 'pies rápidos'],
  ['hyper', 'hiperextensión'],
  ['ring dips', 'fondos en anillas'],
  ['rope climb', 'trepa de cuerda'],
  ['run', 'carrera'],
  ['scapula', 'escápula'],
  ['short stride', 'zancada corta'],
  ['tap', 'toque'],
  ['side', 'lateral'],
  ['abduction', 'abducción'],
  ['skater', 'patinador'],
  ['ski', 'esquí'],
  ['ergometer', 'ergómetro'],
  ['sledge hammer', 'mazo'],
  ['snatch pull', 'tirón de arranque'],
  ['sphinx', 'esfinge'],
  ['stationary', 'estacionaria'],
  ['straddle', 'con piernas abiertas'],
  ['suspended', 'suspendido'],
  ['swing', 'balanceo'],
  ['tire flip', 'volteo de neumático'],
  ['upward facing dog', 'perro boca arriba'],
  ['v-sit', 'V sentado'],
  ['walk', 'caminata'],
  ['stepmill', 'escaladora'],
  ['weighted', 'lastrado'],
  ['wide-grip', 'agarre amplio'],
  ['wind sprints', 'sprints'],
  ['wrist circles', 'círculos de muñeca'],
  ['wrist rollerer', 'rodillo de muñeca'],
  ['body weight', 'peso corporal'],
  ['barbell', 'con barra'],
  ['dumbbell', 'con mancuerna'],
  ['kettlebell', 'con pesa rusa'],
  ['cable', 'en polea'],
  ['machine', 'en máquina'],
  ['smith', 'en máquina Smith'],
  ['incline', 'inclinado'],
  ['decline', 'declinado'],
  ['seated', 'sentado'],
  ['standing', 'de pie'],
  ['lying', 'acostado'],
  ['single arm', 'a un brazo'],
  ['single leg', 'a una pierna'],
  ['alternating', 'alternado'],
  ['wide grip', 'agarre amplio'],
  ['close grip', 'agarre cerrado'],
  ['reverse grip', 'agarre inverso'],
  ['squat', 'sentadilla'],
  ['deadlift', 'peso muerto'],
  ['lunge', 'zancada'],
  ['row', 'remo'],
  ['press', 'press'],
  ['curl', 'curl'],
  ['extension', 'extensión'],
  ['raise', 'elevación'],
  ['fly', 'apertura'],
  ['pulldown', 'jalón'],
  ['pull-up', 'dominada'],
  ['push-up', 'flexión'],
  ['pushdown', 'extensión en polea'],
  ['crunch', 'abdominal'],
  ['sit-up', 'abdominal'],
  ['plank', 'plancha'],
  ['twist', 'giro'],
  ['kickback', 'patada'],
  ['bridge', 'puente'],
  ['rotation', 'rotación'],
  ['stretch', 'estiramiento'],
  ['calf', 'pantorrilla'],
  ['glute', 'glúteo'],
  ['quadriceps', 'cuádriceps'],
  ['hamstring', 'femoral'],
];

const canonicalGroups = (exercise) => {
  const text = [exercise.name, exercise.body_part, exercise.target, exercise.muscle_group, ...(exercise.secondary_muscles ?? [])]
    .join(' ')
    .toLowerCase();
  const groups = [];
  const add = (key) => {
    if (!groups.includes(key)) groups.push(key);
  };
  if (/chest|pectoral/.test(text)) add('pecho');
  if (/back|lat|trap|dorsal/.test(text)) add('espalda');
  if (/lower back|lumbar/.test(text)) add('espalda_baja');
  if (/shoulder|delt/.test(text)) add('hombros');
  if (/arm|biceps|triceps|forearm/.test(text)) add('brazos');
  if (/glute|hip|quadriceps|hamstring|upper leg|leg|thigh/.test(text)) add('cuadriceps');
  if (/calf|lower leg/.test(text)) add('pantorrillas');
  if (/waist|abs|oblique|core/.test(text)) add('core');
  return groups.length ? groups : ['otros'];
};

function titleCase(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function translateName(name) {
  let value = name.toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  for (const [from, to] of PHRASES) value = value.replaceAll(from, to);
  for (const [from, to] of WORDS) value = value.replaceAll(from, to);
  value = value.replace(/\bthe\b/g, '').replace(/\bwith\b/g, 'con');
  value = value.replace(/\s+([,/)])/g, '$1').replace(/\s+/g, ' ').trim();
  return titleCase(value);
}

function label(value, dictionary) {
  return dictionary[value] ?? translateName(value);
}

async function loadSource() {
  if (sourcePath) return JSON.parse(await readFile(sourcePath, 'utf8'));
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`No pudimos descargar el dataset: ${response.status}`);
  return response.json();
}

const source = await loadSource();
const output = source.map((exercise) => ({
  id: exercise.id,
  name_en: exercise.name,
  name_es: translateName(exercise.name),
  category_en: exercise.category,
  category_es: label(exercise.category, BODY_PARTS),
  body_part_en: exercise.body_part,
  body_part_es: label(exercise.body_part, BODY_PARTS),
  equipment_en: exercise.equipment,
  equipment_es: label(exercise.equipment, EQUIPMENT),
  target_en: exercise.target,
  target_es: label(exercise.target, MUSCLES),
  muscle_group_en: exercise.muscle_group,
  muscle_group_es: label(exercise.muscle_group, MUSCLES),
  secondary_muscles_en: exercise.secondary_muscles ?? [],
  secondary_muscles_es: (exercise.secondary_muscles ?? []).map((muscle) => label(muscle, MUSCLES)),
  muscle_groups: canonicalGroups(exercise),
  instructions_es: exercise.instructions?.es ?? '',
  instruction_steps_es: exercise.instruction_steps?.es ?? [],
  image_url: `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/${exercise.image}`,
  gif_url: `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/${exercise.gif_url}`,
  attribution: exercise.attribution || '© Gym visual — https://gymvisual.com/',
  source: 'hasaneyldrm/exercises-dataset',
}));

await writeFile(outputPath, `${JSON.stringify(output)}\n`, 'utf8');
console.log(`Generated ${output.length} exercises at ${outputPath}`);
