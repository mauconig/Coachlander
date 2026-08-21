# Plan actualizado: sesión persistente y rutinas dinámicas

## Objetivo

Mantener las rutinas correctamente aisladas por alumno y convertir la sesión de
entrenamiento en un reproductor local, resistente a minimizar, bloquear o
perder temporalmente la conexión.

La sesión activa vive en SQLite. PostgreSQL conserva únicamente el estado
remoto y el historial sincronizado.

## Estado actual

### Implementado y validado

- Las rutinas del coach usan `routineId`, `clientId` y `weekStart` reales.
- El detalle no depende del primer alumno ni de una rutina fija.
- Existe `PATCH /v1/routines/:id` para editar la composición de la rutina.
- Se pueden editar ejercicios, series, reps, carga, indicaciones y orden.
- El catálogo paginado permite agregar ejercicios nuevos con sus metadatos.
- La asignación conserva el alumno y la semana seleccionados.
- La cuenta regresiva inicial es de 10 segundos y permite `SALTAR`.
- El timer de trabajo pasa a sobretiempo rojo al llegar a cero.
- Las series se guardan primero en el estado local de la sesión.
- Minimizar conserva la sesión y muestra el mini-player.
- SQLite restaura la sesión activa al volver a abrir la app.
- Hay sonidos, vibración y notificación de sesión activa.
- El player permite saltar ejercicio, parar parcialmente y cancelar.
- La sincronización usa un único lote mediante `POST /v1/session/sync`.
- El backend valida la rutina, los ejercicios, los índices y la propiedad del
  atleta.
- La sincronización es idempotente: reintentar el mismo lote no duplica
  `set_log`.
- `POST /v1/session/end`, `/stop` y `/cancel` mantienen la semántica definida:
  sesión completa, parcial o cancelada.
- El flujo del backend fue probado con PostgreSQL y los endpoints remotos.

## Arquitectura vigente

### SQLite del celular

La base local `coachlander-session.db` utiliza actualmente:

- `active_session`: guarda un snapshot JSON completo de la sesión, incluyendo
  rutina, ejercicio actual, fase, timestamps, timer, series registradas,
  minimización y sonido.
- `pending_session_events`: tabla preparada para eventos locales pendientes.

No existe una tabla separada `session_sets`; las series confirmadas viven en
`loggedSets` dentro del snapshot JSON. Esto es intencional por ahora y evita
fragmentar el estado de una sesión activa.

### PostgreSQL de la VPS

Durante la sesión sólo recibe:

1. `POST /v1/session/start` al terminar el countdown.
2. Un único `POST /v1/session/sync` al terminar o parar.
3. Una única operación de cierre: `end`, `stop` o `cancel`.

Las series se almacenan en `set_log` con `session_id`, `routine_id`,
`exercise_id`, `set_index`, carga, repeticiones y fecha. El índice único evita
duplicados por sesión y serie.

## Pendientes priorizados

### 1. Cola offline y recuperación de sincronización — implementado

- El lote se registra en `pending_session_events` antes de llamar a la API.
- Los reintentos se ejecutan al volver la app a primer plano y periódicamente
  mientras existe una sesión activa.
- `attempts` aumenta por cada intento y `synced` sólo cambia después de una
  respuesta exitosa.
- La sesión local y el lote se conservan si falla la sincronización o el
  cierre.
- La clave única de PostgreSQL permite reintentar sin duplicar `set_log`.
- SQLite se limpia únicamente después de confirmar el cierre remoto.
- Si sincronizar funciona pero `end` o `stop` falla, el lote queda marcado como
  sincronizado y el cierre puede reintentarse sin reenviar las series.

### 2. Notificación Android realmente persistente

Prioridad media/alta si la sesión debe seguir funcionando con la app en segundo
plano o cerrada.

La implementación actual usa `expo-notifications` y actualiza una notificación
activa mientras React Native está funcionando. Falta evaluar o implementar un
Foreground Service Android que mantenga el timer y las acciones de pausar,
saltar y abrir aun cuando la app deje de estar visible.

Este bloque requiere un nuevo development build Android.

### 3. Live Activity de iOS

Prioridad posterior y opcional para el primer release.

- Módulo Expo y config plugin.
- Estado del ejercicio y timer en Lock Screen/Dynamic Island.
- Acciones de pausar, reanudar y saltar.
- Deep link hacia `/sesion`.

La compilación y prueba requieren macOS/Xcode. No bloquea el funcionamiento de
Android ni la sincronización con PostgreSQL.

## Verificación manual mínima

No se incorpora una suite E2E formal ni se ejecutan flujos automatizados de
Maestro. El backend y el flujo de sincronización ya fueron validados de forma
independiente.

Cuando se reconstruya el development build, sólo hace falta una comprobación
manual breve del front:

- abrir una rutina de 1 ejercicio y 3 series;
- confirmar una serie, minimizar y reabrir;
- completar la rutina y comprobar que aparecen exactamente 3 `set_log`;
- probar `Parar acá` y verificar estado `partial`;
- probar `Cancelar rutina` y confirmar que no quedan logs de esa sesión;
- comprobar que la rutina del atleta con entrenador no se pueda eliminar.

## Siguiente bloque recomendado

Continuar con el **Foreground Service de Android** si se necesita que el timer
y los controles sigan funcionando con la aplicación completamente en segundo
plano o cerrada. La cola offline ya está implementada sin cambiar la API ni
agregar una dependencia nativa nueva.

Live Activity queda para una etapa posterior y opcional.

## Fuera de alcance actual

- No modificar descansos: pertenecen a la configuración del atleta.
- No enviar cada cambio de timer o cada transición a PostgreSQL.
- No eliminar snapshots históricos de rutinas.
- No ejecutar seeds destructivos sobre datos reales.
- No agregar una suite E2E automatizada en esta etapa.
