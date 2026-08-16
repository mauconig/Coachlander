# Coachlander

App de coaching fitness para entrenadores y alumnos en Latinoamérica. React Native sobre Expo
SDK 56, con Clerk para autenticación y PostgreSQL remoto como fuente única de verdad.

## Arrancar

```bash
npm install
npm run start          # luego i (iOS) o a (Android)
npm run check          # typecheck
npm run android        # development build para el dispositivo
```

Hace falta USB debugging activado y aceptar el diálogo de depuración en el teléfono. La app usa
un development build de Expo; Expo Go debe coincidir con el SDK 56 si se usa para una prueba rápida.

## Arquitectura

```
app/                 rutas Expo Router
  (onboarding)/      bienvenida → crear cuenta → rol → datos → listo
  (athlete)/         hoy · progreso · historial · perfil
  (coach)/           alumnos · rutinas · mensajes · perfil
  sesion.tsx         reproductor de sesión en vivo
  ejercicio/[id]     detalle de ejercicio
  rutina/[id]        editor de rutina
  importar/          flujo de importación
src/
  api/               cliente del API y bootstrap remoto
  state/             sesión, snapshot remoto y flujo de importación
  db/queries.ts      selectores puros sobre el snapshot remoto
  components/        primitivas visuales compartidas
  session/           máquina de estados de la sesión en vivo
  theme/             tokens visuales
backend/
  src/server.mjs     API Fastify autenticada con Clerk
  db/schema.sql      esquema PostgreSQL
```

La app no usa SQLite ni seeds locales. Al iniciar sesión, el API devuelve el perfil del usuario y
las tablas remotas; React mantiene ese snapshot sólo en memoria para renderizarlo. Clerk conserva
la sesión según su cache nativa. Los sets cerrados se escriben en PostgreSQL mediante
`POST /v1/set-logs`.

## Backend

El VPS expone el API en:

```
https://coachlander.147-93-180-120.sslip.io
```

El despliegue se realiza con Docker Compose desde `/opt/coachlander`. PostgreSQL se mantiene en el
volumen Docker del VPS y el API ejecuta el esquema al arrancar. No hay datos demo automáticos:
los perfiles, rutinas, ejercicios y logs deben provenir de operaciones reales de la aplicación.

Health check:

```bash
curl https://coachlander.147-93-180-120.sslip.io/healthz
```

## Flujo de datos

```tsx
const routine = useQuery(getTodayRoutine);
const exercise = useQuery((remote) => getExercise(remote, id), [id]);
```

Cuando PostgreSQL no tiene una rutina, las pantallas muestran estados vacíos en vez de cargar
contenido de ejemplo. El dashboard sin rutina es una vista válida para usuarios que entrenan por
su cuenta.
