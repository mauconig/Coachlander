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
