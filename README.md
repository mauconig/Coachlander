# Tempo — Coachlander

App de coaching fitness para entrenadores y alumnos en Latinoamérica. El entrenador carga la
rutina; el alumno aprieta play y entrena con los tiempos y las cargas ya calculadas, serie por
serie.

React Native sobre Expo (SDK 56), iOS y Android. Interfaz en español, sin i18n: los textos viven
donde se usan.

## Arrancar

```bash
npm install
npm run start          # luego i (iOS) o a (Android)
npm run check          # tipos + SQL
```

### Development build (el camino principal)

```bash
npm run android        # expo run:android — compila e instala en el dispositivo
npm run db:pull        # baja tempo.db (+ sidecars WAL) al proyecto
sqlite3 tempo.db "SELECT * FROM set_log ORDER BY logged_at DESC;"
```

La primera compilación es lenta: arma el código nativo desde cero para la ABI
del dispositivo. Hace falta USB debugging activado y aceptar el diálogo
«¿Permitir depuración por USB?» en el teléfono.

`npm run db:shell` abre un `sqlite3` directamente en el dispositivo, si la
imagen lo trae.

### Expo Go

**Expo Go soporta una sola versión de SDK por build.** El proyecto está en SDK
56, así que necesita Expo Go 56.x — un Expo Go 54 o 57 lo rechaza con un error
explícito, no es que "no anda". Por eso el SDK del proyecto está atado a la
versión de Expo Go que usa el equipo.

Además Expo Go no sirve para mirar la base: `adb run-as` sólo funciona sobre un
APK debuggable, y Expo Go viene firmado como release. Para eso, development
build.

## Cómo está armado

```
app/                 rutas (expo-router, file-based)
  (onboarding)/      bienvenida → crear-cuenta → rol → codigo → datos → listo
  (athlete)/         tabs del alumno: hoy · progreso · historial · perfil
  (coach)/           tabs del entrenador: alumnos · rutinas · mensajes · perfil
  sesion.tsx         reproductor de sesión en vivo
  ejercicio/[id]     detalle de ejercicio
  rutina/[id]        editor de rutina
  importar/          origen → pegar → revision → asignar
src/
  theme/             tokens de color, radios y escala tipográfica
  components/        primitivas compartidas (Screen, Card, Row, Button, Sheet…)
  session/           máquina de estados de la sesión en vivo
  state/             contexto de cuenta/rol y del flujo de importación
  db/                esquema SQLite, seed, consultas y hooks
  data/              contenido semilla y tipos de dominio
  lib/               formato es-AR (coma decimal, miles con espacio, fechas)
scripts/             check-sql.mjs, pull-db.mjs
```

Nada de estilos sueltos: todo color, radio y tamaño de texto sale de `src/theme`. Si algo necesita
un valor nuevo, se agrega ahí y se mueve toda la app junta.

## Pantallas del diseño → rutas

El diseño (`Tempo App.dc.html`) numera 18 pantallas en cuatro bloques.

| #  | Pantalla                  | Ruta                        |
|----|---------------------------|-----------------------------|
| 01 | Hoy                       | `(athlete)/hoy`             |
| 02 | Sesión en vivo            | `sesion`                    |
| 03 | Detalle de ejercicio      | `ejercicio/[id]`            |
| 04 | Progressive overload      | `(athlete)/progreso`        |
| 05 | Historial de sesiones     | `(athlete)/historial`       |
| 06 | Perfil del alumno         | `(athlete)/perfil`          |
| 07 | Mis alumnos               | `(coach)/alumnos`           |
| 08 | Editor de rutina          | `rutina/[id]`               |
| 09 | Bienvenida                | `(onboarding)/bienvenida`   |
| 10 | Crear cuenta con email    | `(onboarding)/crear-cuenta` |
| 11 | ¿Alumno o entrenador?     | `(onboarding)/rol`          |
| 12 | Código del entrenador     | `(onboarding)/codigo`       |
| 13 | Tus datos                 | `(onboarding)/datos`        |
| 14 | Todo listo                | `(onboarding)/listo`        |
| 15 | De dónde viene la rutina  | `importar/origen`           |
| 16 | Pegar texto               | `importar/pegar`            |
| 17 | Lo que detectó la IA      | `importar/revision`         |
| 18 | Guardar y asignar         | `importar/asignar`          |

Tres rutas no están en el diseño pero las exige la tab bar del entrenador que sí lo está
(pantalla 07): `(coach)/rutinas`, `(coach)/mensajes` y `(coach)/perfil`. Están construidas con
las mismas primitivas y sirven de conexión entre el editor y el importador.

## La sesión en vivo

`src/session/useSession.ts` es el corazón funcional y replica la lógica del diseño:

1. El cronómetro corre la fase de trabajo del ejercicio actual.
2. Al cerrar una serie se abre la hoja de carga: sugerido del plan, un poco más (+2,5 kg) o
   teclado numérico.
3. Elegida la carga, arranca el descanso y al terminar vuelve solo a la siguiente serie.
4. Cerrada la última serie, el ejercicio avanza al siguiente sin intervención.

La pantalla mantiene el teléfono despierto mientras dura la sesión.

## Datos

Todavía no hay backend. Las pantallas leen de una base SQLite local (`expo-sqlite`) que se crea y
se puebla en el primer arranque, desde `app/_layout.tsx`:

```
src/db/schema.ts    tablas y SCHEMA_VERSION
src/db/seed.ts      carga el contenido de src/data/mock.ts
src/db/migrate.ts   corre en onInit; resembra si cambia la versión
src/db/queries.ts   consultas tipadas que devuelven los tipos de dominio
src/db/useQuery.ts  useQuery / useMutation
```

`src/data/mock.ts` sigue siendo la única fuente de verdad de *qué* contiene la base —Nadia,
Camila, la rutina Empuje A, los mismos nombres y cargas del diseño—, pero ya no lo leen las
pantallas: lo lee el seed.

Las lecturas son síncronas y las pantallas no tienen estado de carga: el dataset es chico y local,
y `SQLiteProvider` monta a sus hijos recién cuando la base está lista. Después de escribir,
`useMutation` avisa y todas las consultas montadas se vuelven a correr.

```tsx
const routine = useQuery(getTodayRoutine);
const exercise = useQuery((db) => getExercise(db, id), [id]);
const logSet = useMutation(insertSetLog);
```

La tabla `set_log` es la única que no viene del seed: la escribe el reproductor cada vez que se
cierra una serie, así que sobrevive a un reinicio y aparece bajo Progreso. Perfil tiene
«Restablecer datos de ejemplo» para volver al estado inicial.

Los puntos donde entraría la red están marcados en el código (selector de archivos en
`importar/origen`, detección de rutina en `importar/pegar`, video demo en `sesion` y
`ejercicio/[id]`, publicación de rutina en `rutina/[id]`).

### Esquema

`coach`, `athlete`, `exercise`, `routine`, `routine_exercise`, `client`, `session`,
`overload_row`, `weekly_volume`, `month_day`, `setting`, `template`, `thread`, `import_line`,
`set_log`, `app_meta`.

`npm run check:sql` aplica el esquema a una base en memoria y prepara todas las sentencias de
`src/db` contra ella. Vale la pena correrlo: ni el bundler ni `tsc` ven un error de SQL — eso sólo
aparece en el dispositivo.
