# Plan: rutinas dinámicas por alumno y día

## Objetivo

Eliminar el comportamiento heredado que muestra siempre a Lucía Fernández y hacer que la navegación y el detalle de rutina usen los datos reales de cada alumno, rutina y semana.

## Cambios

- Pasar explícitamente `routineId`, `clientId` y `weekStart` desde cada `DayRow`.
- Cargar el detalle exclusivamente con `getRoutineById(routineId)` y el alumno con `clientId`.
- Eliminar cualquier fallback al primer alumno o a `getTodayRoutine()`.
- Mostrar dinámicamente el nombre del alumno, rutina, semana, día y ejercicios.
- Eliminar `WEEKDAY_INITIALS` y el badge visual automático `M M J V`.
- Mantener solamente el texto real `DÍA N` para identificar cada rutina.
- Guardar series, reps, kg, descanso y overload mediante PATCH por ejercicio modificado.
- Mantener “Cambiar rutina” con plantilla existente o nueva rutina, conservando alumno y semana.
- Ocultar plantillas vacías o inválidas.
- Mantener el endpoint de edición protegido para coaches y desplegarlo en la VPS.

## Verificación

- Ejecutar typecheck, sintaxis del backend y bundle Android.
- Recargar o reconstruir la app en el celular para eliminar el bundle anterior.
- Probar Mateo Gómez → esta semana → Test → cada día.
- Probar Valentina Ruiz → cada día disponible.
- Confirmar que nunca aparezca Lucía Fernández en una rutina de otro alumno.
- Confirmar que no aparezcan badges `M M J V`.
- Editar series, reps, kg y descanso; guardar; salir y volver a entrar para verificar persistencia.
- Cambiar la rutina y confirmar que la nueva asignación conserva el alumno correcto.

## Supuestos

- “Sin badge” elimina el indicador visual de letras, pero conserva el texto `DÍA N`.
- No se borrarán datos existentes de PostgreSQL.
- Se preservarán los demás cambios pendientes del worktree.
- No hacer commit ni push salvo pedido explícito.

---

# Plan: sesión activa persistente y controles nativos

## Objetivo

Convertir la pantalla de sesión en un reproductor persistente. La sesión debe
seguir funcionando aunque el atleta minimice la pantalla, cambie de aplicación
o bloquee el teléfono.

El estado temporal de la sesión se guardará localmente en SQLite. No se
guardará el timer ni la sesión activa completa en la VPS. El backend sólo
recibirá los eventos necesarios para el historial: inicio, series registradas y
finalización.

## Máquina de estados

Extender `src/session/useSession.ts` y mover el estado a un provider global:

- `countdown`: cuenta regresiva inicial de 10 segundos.
- `work`: tiempo normal del ejercicio.
- `overtime`: el tiempo de trabajo llegó a cero y cuenta hacia arriba.
- `rest`: descanso configurado por el atleta.
- `completed`: rutina terminada.

Comportamiento:

- Al abrir una rutina, mostrar 10 segundos antes de comenzar.
- Mostrar el botón `SALTAR` durante la cuenta regresiva.
- Registrar el inicio remoto sólo cuando termina el countdown o se pulsa
  `SALTAR`.
- El tiempo de trabajo debe llegar a `00:00`, cambiar a rojo y mostrar
  `+00:01`, `+00:02`, etc.
- Mantener `Serie X hecha` durante el sobretiempo.
- Al registrar la serie, abrir el descanso normal.
- El descanso termina automáticamente en cero y comienza el siguiente bloque
  de trabajo.
- Al completar todas las series, pasar automáticamente al siguiente ejercicio.
- Al terminar el último ejercicio, reproducir la finalización y cerrar la
  sesión.

Cada fase tendrá un timestamp de inicio. El tiempo visible se recalculará a
partir de esos timestamps, nunca únicamente a partir de un `setInterval`, para
funcionar correctamente después de minimizar, bloquear o volver del segundo
plano.

## Persistencia local con SQLite

Agregar `expo-sqlite` y crear una base local con tablas similares a:

```sql
active_session (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  routine_json TEXT NOT NULL,
  exercise_index INTEGER NOT NULL,
  phase TEXT NOT NULL,
  phase_started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  current_set INTEGER NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  minimized INTEGER NOT NULL DEFAULT 0,
  sound_enabled INTEGER NOT NULL DEFAULT 1
);

session_sets (
  session_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  load REAL,
  reps INTEGER,
  synced INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, exercise_id, set_index)
);

pending_session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  synced INTEGER NOT NULL DEFAULT 0
);
```

Requisitos:

- Guardar el snapshot de la rutina y el estado actual localmente.
- Guardar cada carga y repetición antes de intentar sincronizar.
- Reintentar eventos pendientes cuando vuelva la conexión.
- No duplicar `startSession`, `pushSetLog` ni `endSession`.
- Borrar el snapshot y los eventos al finalizar o descartar la rutina.
- Al abrir la app con una sesión incompleta, mostrar `Continuar sesión` o
  `Descartar sesión`.
- La rutina del atleta con entrenador seguirá sin poder eliminarse.

## Sonidos y vibración

Agregar tonos locales breves mediante `expo-audio`, respetando el volumen y el
modo silencio del dispositivo. Acompañar los eventos importantes con
hápticos.

Eventos mínimos:

- Aviso en los segundos 3, 2 y 1 del countdown.
- Tono marcado al comenzar la sesión.
- Tono al comenzar cada ejercicio.
- Confirmación corta al registrar una serie.
- Tono doble y más bajo al comenzar el descanso.
- Pulsos en los últimos 3 segundos del descanso.
- Tono de transición al finalizar el descanso.
- Alerta única al entrar en sobretiempo.
- Aviso sutil cada 10 segundos de sobretiempo, nunca uno por segundo.
- Tono de transición entre ejercicios.
- Secuencia de tres tonos al terminar la rutina.

Agregar dentro de las opciones de sesión:

- `Sonidos activados/desactivados`.
- Vibración independiente cuando sea posible.

## Minimizar la sesión

Crear un `SessionProvider` en el layout raíz, fuera de las tabs, y convertir
`app/sesion.tsx` en una vista consumidora del estado global.

Al pulsar el botón superior izquierdo:

- No abandonar ni pausar la rutina.
- Guardar inmediatamente el estado en SQLite.
- Volver a `Hoy`.
- Mostrar un `MiniSessionBar` sobre la navegación inferior.
- Mostrar ejercicio, fase y tiempo actual.
- Al tocarlo, volver a `/sesion` exactamente en el ejercicio, serie y fase
  anteriores.
- No mostrar el mini-reproductor dentro de la pantalla completa de sesión.

El mini-reproductor debe desaparecer cuando la sesión termina o se descarta.

## Notificación persistente de Android

Agregar permisos, canal y configuración de notificaciones. Crear una capa nativa
con foreground service para que la sesión no dependa de que React Native esté
visible.

La notificación será persistente y mostrará:

- Nombre del ejercicio.
- Fase actual.
- Tiempo restante o sobretiempo.
- Serie actual.
- Acción `Pausar` o `Reanudar`.
- Acción `Saltar`.
- Acción `Abrir sesión`.

La notificación no podrá descartarse mientras exista una sesión activa y se
eliminará al completar o descartar la rutina.

Las acciones de la notificación deben comunicarse con el `SessionProvider` y
actualizar SQLite antes de reflejar el nuevo estado en pantalla.

## Live Activity de iOS

Preparar una integración nativa mediante módulo Expo y config plugin, sin
depender de cambios manuales permanentes en `ios/`.

La Live Activity debe mostrar en Lock Screen y Dynamic Island:

- Ejercicio actual.
- Fase.
- Timer descendente o ascendente.
- Serie actual.
- Acciones de pausar, reanudar y saltar.
- Deep link para volver a `/sesion`.

Debe iniciarse al terminar el countdown y finalizar al completar o descartar la
rutina. La compilación y prueba final de esta parte requieren macOS/Xcode.

## Integración remota

Mantener `startSession`, `pushSetLog` y `endSession` como fuente remota del
historial, pero con cola local e idempotencia:

- `startSession` sólo después del countdown.
- Cada serie se persiste localmente antes de enviarse.
- Un reintento no debe crear dos `set_log` para la misma serie.
- `endSession` sólo después de completar todos los ejercicios.
- Si la red falla, conservar los eventos hasta sincronizar.
- Si la app se cierra, continuar desde el snapshot local.

## Dependencias y build

Agregar y configurar:

- `expo-sqlite`.
- `expo-audio`.
- `expo-notifications`.
- Configuración nativa del foreground service Android.
- Módulo Expo/config plugin para Live Activity iOS.
- Deep links hacia `/sesion`.

Después de los cambios nativos se debe reconstruir el development build. Expo
Go no será suficiente para probar SQLite, foreground service, sonidos nativos,
acciones de notificación ni Live Activity.

## Verificación

- La sesión comienza mostrando 10 segundos.
- `SALTAR` inicia inmediatamente el primer ejercicio.
- Los sonidos se reproducen en cada transición definida.
- El timer de trabajo se vuelve rojo exactamente en cero.
- El sobretiempo aumenta hasta registrar la serie.
- El descanso inicia después de guardar una serie.
- El descanso termina automáticamente y avisa el siguiente bloque.
- La rutina completa reproduce el sonido final y limpia SQLite.
- Minimizar conserva ejercicio, serie, fase, timer y cargas.
- Reabrir desde el mini-reproductor conserva el estado exacto.
- Bloquear y desbloquear el teléfono recalcula correctamente el tiempo.
- Cerrar y abrir la app permite continuar o descartar la sesión.
- La notificación Android permanece visible y responde a pausar, reanudar,
  saltar y abrir.
- La notificación se elimina al completar o descartar.
- La Live Activity se inicia, actualiza y finaliza correctamente en iOS.
- La pérdida de conexión no pierde series.
- Los reintentos no duplican eventos remotos.
- Un atleta con entrenador conserva las restricciones de sus rutinas.
- Ejecutar typecheck, `node --check backend/src/server.mjs`, `git diff --check`,
  bundle Android y prueba con el teléfono conectado.
- Compilar y probar iOS en macOS/Xcode.

## Supuestos

- La cuenta regresiva inicial será de 10 segundos.
- Sólo el tiempo de trabajo entra en sobretiempo rojo.
- El descanso termina en cero y no acumula sobretiempo.
- Minimizar mantiene la sesión activa y no la pausa.
- SQLite es la fuente local temporal de la sesión activa.
- PostgreSQL conserva únicamente el historial sincronizado.
- Los tonos son locales y breves.
- El incremento de tiempo y las transiciones se basan en timestamps reales.
- No hacer commit ni push salvo pedido explícito.
