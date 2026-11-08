# MediDoc

App web privada para guardar resultados de exámenes médicos de la familia. Diseño y decisiones en [medidoc-plan.md](medidoc-plan.md).

> Repo **público**: ningún secreto ni dato de pacientes entra en git. Los secretos viven en `.env` local y en las variables de entorno de Vercel.

## Estructura

| Carpeta | Qué es |
|---|---|
| `frontend/` | Next.js, solo UI. Reenvía `/api/*` al backend. |
| `backend/` | API Hono + Prisma (Neon) + R2. Auth, permisos, cifrado. |
| `packages/shared/` | Schemas Zod compartidos (sin código de servidor). |

## Puesta en marcha

1. Requisitos: Node 22+, pnpm y **gitleaks** (`winget install gitleaks`; sin él, el hook bloquea los commits).
2. `pnpm install` (activa además el hook de pre-commit).
3. `cp backend/.env.example backend/.env` y rellénalo con la rama **dev** de Neon y el bucket de dev.
4. `cp frontend/.env.example frontend/.env.local` con `BACKEND_URL=http://localhost:4000`.
5. `pnpm --filter backend db:migrate`
6. En dos terminales: `pnpm dev:backend` y `pnpm dev:frontend`. Abre http://localhost:3000.

## Comandos

- `pnpm typecheck`: tipos de todos los paquetes
- `pnpm test`: pruebas del backend
- `pnpm secrets:scan`: escanea todo el historial de git en busca de secretos
