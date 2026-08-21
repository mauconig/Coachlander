# E2E front + back

Esta suite valida el contrato local-first de una sesión: la app guarda las
series en SQLite mientras el atleta entrena y manda un único lote a la API al
finalizar o guardar una sesión parcial. Los flujos nunca usan datos de
Mauricio ni de cuentas reales.

## Requisitos

- Node.js y dependencias del proyecto instaladas.
- SSH configurado con el alias `vps` y acceso a `/opt/coachlander`.
- `psql` disponible dentro del contenedor `coachlander-db` en la VPS.
- Una cuenta Clerk E2E de coach y otra de atleta ya creadas.
- Sus tokens de sesión obtenidos fuera del repositorio.
- Maestro instalado en la máquina que ejecuta Android.
- Teléfono Android con el development build de `com.coachlander.tempo` y USB debugging.

Nunca guardes tokens, contraseñas ni códigos de verificación en este archivo o
en Git. La autenticación UI puede hacerse una vez manualmente; los flujos de
sesión parten de la cuenta atleta ya autenticada para que las pruebas sean
repetibles y no dependan del correo de Clerk.

## Variables

PowerShell de ejemplo:

```powershell
$env:E2E_RUN_ID = "20260821-001"
$env:E2E_API_URL = "https://coachlander.147-93-180-120.sslip.io"
$env:E2E_DB_TARGET = "vps"
$env:E2E_COACH_CLERK_ID = "user_..."
$env:E2E_ATHLETE_CLERK_ID = "user_..."
$env:E2E_COACH_TOKEN = "..."
$env:E2E_ATHLETE_TOKEN = "..."
$env:E2E_COACH_EMAIL = "coach-e2e@example.test"
$env:E2E_ATHLETE_EMAIL = "athlete-e2e@example.test"
$env:E2E_ATHLETE_PASSWORD = "(só para el flujo opcional de login UI)"

# Reiniciar Metro después de definirlas para habilitar las trazas de desarrollo.
$env:EXPO_PUBLIC_E2E_RUN_ID = $env:E2E_RUN_ID
$env:EXPO_PUBLIC_E2E_TRACE = "true"
```

El `runId` identifica todas las filas como `E2E-<runId>`. No se usan IDs de
Clerk hardcodeados en SQL: los IDs reales llegan por variables.

## Orden recomendado

1. Desplegar sólo API y esquema, con backup remoto:

   ```powershell
   npm run e2e:deploy
   ```

2. Crear o reemplazar únicamente el fixture de esta ejecución:

   ```powershell
   npm run e2e:prepare
   ```

3. Ejecutar la suite protegida contra la VPS:

   ```powershell
   npm run e2e:api
   ```

4. Arrancar Metro con el development build, autenticar el atleta E2E y correr
   Maestro. El comando principal ejecuta el cierre completo:

   ```powershell
   adb reverse tcp:8081 tcp:8081
   npm run start -- --dev-client --localhost
   npm run e2e:android
   ```

   Para los demás escenarios, volver a preparar el fixture antes de cada uno:

   ```powershell
   npm run e2e:prepare; npm run e2e:android:stop
   npm run e2e:prepare; npm run e2e:android:cancel
   npm run e2e:prepare; npm run e2e:android:resume
   ```

   El login UI es opcional y no se ejecuta como parte de `e2e:android`:

   ```powershell
   npm run e2e:android:auth
   ```

5. Revisar estado y artefactos antes de limpiar:

   ```powershell
   npm run e2e:db
   npm run e2e:report
   ```

6. Al finalizar la revisión, borrar sólo el fixture identificado por el run:

   ```powershell
   npm run e2e:cleanup
   npm run e2e:report
   ```

Si se ejecuta el flujo completo, preparar de nuevo entre escenarios que
completan la rutina, porque una rutina completada no debe reutilizarse como si
estuviera programada.

## Casos incluidos

- `session-complete.yaml`: countdown, dos series, descanso, cierre completo.
- `session-stop.yaml`: una serie, `PARAR`, continuar y guardar como parcial.
- `session-cancel.yaml`: una serie local y cancelación sin dejar logs nuevos.
- `session-resume.yaml`: minimizar y reabrir desde el mini-player.
- `auth-athlete.yaml`: acceso de atleta por email si la sesión no está preparada.

Los asserts de PostgreSQL son responsabilidad de `e2e:api`, `e2e:db` y las
consultas guardadas en `e2e-artifacts/<runId>`. El directorio está ignorado por
Git porque contiene snapshots y trazas de una ejecución concreta.

## Checks de entrega

```powershell
npm run typecheck
node --check backend/src/server.mjs
npx expo export --platform android --clear
git diff --check
```

La aprobación final requiere además que pasen `e2e:api`, los flujos Maestro y
la comparación de conteos después de `e2e:cleanup`.
