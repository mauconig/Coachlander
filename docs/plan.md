# Plan — Poblar base de datos de prueba en el VPS

## Objetivo

Poblar la base PostgreSQL `coachlander` (VPS, contenedor `coachlander-db`) con datos
relevantes para las **dos cuentas permanentes** de `docs/cuentas.md`:

- Atleta: `coachlander.athlete.test@gmail.com`
- Entrenador: `coachlander.coach.test@gmail.com`

No se toca la cuenta temporal (`ejemplo@gmail.com`), ni los datos existentes de
`mauricioconigliaro1@gmail.com`.

## Estado actual

Todos los usuarios ya existen en `app_user` (se crean solos al iniciar sesión con Clerk).
Solo `mauricioconigliaro1@gmail.com` tiene contenido: 25 ejercicios, 4 rutinas, 13 set_logs.
El resto de tablas (`coach`, `athlete`, `client`, `template`, `session`, `setting`,
`thread`, `overload_row`, `weekly_volume`, `month_day`, `app_meta`) está vacío.

## Advertencia importante del esquema actual

`/v1/bootstrap` devuelve como **globales** las tablas `coach`, `athlete`, `client`,
`session`, `exercise`, `template`, `setting`, `thread`, `overload_row`, `weekly_volume`,
`month_day`, `app_meta`. Lo único aislado por usuario es `app_user`, `set_log` y
`routine` (filtrada por `athlete_id`). Consecuencia: los datos demo de historial,
progreso, alumnos, mensajes y catálogo de coaches **se verán también desde otras cuentas**
(esto ya pasa hoy con los ejercicios de Mauricio). Aceptado como límite del diseño actual.

## Cambios

### 1. Perfil del atleta — `app_user` (`coachlander.athlete.test@gmail.com`)

| campo | valor |
|---|---|
| display_name | Sofía Pérez |
| first_name | Sofía |
| goal | Ganar fuerza y bajar grasa |
| weight_kg | 62 |
| height_m | 1.68 |
| solo_training | true |
| role | athlete (sin cambio) |

### 2. Perfil del entrenador — `app_user` (`coachlander.coach.test@gmail.com`)

| campo | valor |
|---|---|
| display_name | Carlos Ramírez |
| first_name | Carlos |
| role | coach (sin cambio) |
| solo_training | false |

### 3. Catálogo `coach`

Lo usa el perfil del entrenador y el onboarding ("código de 6 dígitos").
El código `ALV482` es el que valida la pantalla `codigo.tsx`.

| campo | valor |
|---|---|
| id | `coach-test-carlos` |
| name | Carlos Ramírez |
| short_name | C. Ramírez |
| first_name | Carlos |
| specialty | Fuerza y acondicionamiento |
| code | ALV482 |

### 4. Alumnos del entrenador — `client` + `thread`

`client` (status es el texto que se ve al lado del nombre; `attention=1` lo marca
en lime; `done=1` muestra el check; `live_*` alimenta la tarjeta "ENTRENANDO AHORA"):

| id | name | status | attention | done | live_routine | live_set_index | live_total_sets | live_elapsed | position |
|---|---|---|---|---|---|---|---|---|---|
| client-lucia | Lucía Fernández | Entrenando ahora | 0 | 0 | Rutina de gym · Día 2 — Empuje | 3 | 12 | 12:40 | 1 |
| client-mateo | Mateo Gómez | Al día | 0 | 1 | | | | | 2 |
| client-valentina | Valentina Ruiz | Última sesión: hace 3 días | 1 | 0 | | | | | 3 |
| client-joaquin | Joaquín Díaz | Última sesión: ayer | 0 | 1 | | | | | 4 |
| client-camila | Camila Torres | Nueva alumna — sin plan | 1 | 0 | | | | | 5 |

`thread` (mensajes del entrenador, referencian `client.id`):

| client_id | preview | when_label | unread | position |
|---|---|---|---|---|
| client-lucia | Excelente la sesión de hoy. Mañana corrección de técnica | hace 5 min | 1 | 1 |
| client-mateo | Seguimos con la misma carga el jueves | ayer | 0 | 2 |
| client-valentina | Me duele un poco la rodilla en sentadilla | hace 2 días | 1 | 3 |
| client-joaquin | Listo el peso muerto, gracias | hace 3 días | 0 | 4 |

### 5. Rutina para el atleta test — `routine` + `routine_exercise` + `exercise`

Plan de 4 días, `athlete_id` = clerk user id del atleta test. Ejercicios nuevos
(ids `exercise-test-*`) para no mezclar progreso con los de Mauricio.
`is_today=1` en el día 1. Mismos parámetros que la rutina importada existente
(`seconds_per_set=45`, bloques y ejercicios realistas).

| día | name | bloque | exercises (sets × reps) |
|---|---|---|---|
| 1 | Día 1 — Pierna | Importada | Sentadilla con barra Smith 3×8, Prensa 45° 3×8, Silla de extensiones 4×10, Aductor 4×10, Pantorillas 4×8-10 |
| 2 | Día 2 — Empuje | Importada | Press inclinado articulado 3×8, Press en máquina 3×8, Press militar c/ mancuernas o máquina 3×10, Vuelos laterales 3×12, Extensiones de tríceps en polea 4×10 |
| 3 | Día 3 — Pierna posterior | Importada | Peso Muerto rumano 3×8, Hip thrust máquina 4×10, Máquina de isquios vertical 3×10, Silla para cuadriceps unilateral 3×12, Pantorillas 4×10 |
| 4 | Día 4 — Tirón | Importada | Jalón abierto al pecho 3×8, Remo abierto articulado 3×8, Remo en máquina 3×10, Curl de bíceps en polea 4×10, Dominada asistida 3×10 |

### 6. `set_logs` de ejemplo — atleta test

Unos 20 registros repartidos en los últimos ~6 semanas, referenciando los
`exercise-test-*`, con cargas crecientes (simula sobrecarga progresiva).

### 7. Historial y progreso

- `session`: 6 sesiones recientes (fechas reales, minutos, series, volumen, completion).
- `month_day`: grid del mes actual (`done`/`rest`/`today`/`planned`).
- `weekly_volume`: 6 semanas de volumen creciente.
- `overload_row`: filas para los ejercicios del atleta test (last vs next load).
- `app_meta`: `history_sessions`, `history_minutes`, `history_completion`,
  `progress_top_load`, `progress_window`, `progress_growth`, `client_count=5`.

### 8. Vista entrenador

- `template` (plantillas de la biblioteca de Rutinas):
  - Fuerza base — 4 días · 24 ejercicios · asignada a Mateo Gómez
  - Hipertrofia PPL — 4 días · 30 ejercicios · sin asignar
  - Corte fullbody — 3 días · 18 ejercicios · sin asignar
- `setting` (role=coach, para el perfil): Notificaciones (encendidas), Sesión por
  defecto (45 min), Auto sobrecarga (Sí), Unidades (kg).

## Ejecución

Un script SQL en una transacción (`BEGIN` / `COMMIT`, `ROLLBACK` si falla), ejecutado
vía `docker exec coachlander-db psql`. Primero se resuelven los `clerk_user_id` reales
de ambos emails consultando `app_user`, para evitar usar IDs hardcodeados.

## Verificación

1. `SELECT` de cada tabla insertada (conteos y muestras).
2. `curl https://coachlander.147-93-180-120.sslip.io/healthz` → `database: ok`.
3. Confirmar que `app_user` de `ejemplo@gmail.com` y los datos de
   `mauricioconigliaro1@gmail.com` no cambiaron.