# Handoff — Coachlander

Estado actual: la app Expo SDK 56 corre en un development build Android y usa Clerk para auth.
El backend Fastify/PostgreSQL está desplegado en el VPS y responde en /healthz.

## Arquitectura actual

- PostgreSQL remoto es la única fuente de verdad.
- El API expone /v1/bootstrap, /v1/profile y /v1/set-logs.
- El cliente mantiene el bootstrap en memoria mientras la sesión está activa.
- No hay SQLite, seed local, reset de datos demo ni usuario de ejemplo hardcodeado.
- Si el usuario no tiene entrenador o rutina, el dashboard y Progreso muestran estados vacíos.
- Clerk conserva la sesión mediante su token cache nativa.

## Backend

Servidor: vps, proyecto en /opt/coachlander.

```bash
ssh vps "cd /opt/coachlander && docker compose ps"
curl https://coachlander.147-93-180-120.sslip.io/healthz
```

El API ya no ejecuta ningún seed al iniciar. Las filas demo fueron eliminadas del PostgreSQL
remoto; el app_user existente y sus set_log se conservaron.

## Cliente

```bash
npm run check
npm run android
```

El flujo de autenticación incluye email y Google. La ruta app/sso-callback.tsx evita el error de
Unmatched Route después de OAuth. El onboarding de usuario sin entrenador termina en un dashboard
vacío y no intenta inventar un plan ni asignar un entrenador.

## Próximos pasos

1. Probar en el teléfono el alta de un usuario nuevo y confirmar el bootstrap vacío.
2. Crear las operaciones reales de coach/importación que alimentarán rutinas, ejercicios y clientes
   en PostgreSQL.
3. Rehacer la pasada visual de Progreso y el resto de pantallas con datos reales.
4. Antes de commitear, revisar git status para excluir cualquier captura o archivo generado.
