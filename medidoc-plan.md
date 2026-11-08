# Plan de `medidoc`

App web privada para guardar y consultar resultados de exámenes médicos, organizados por persona de la familia.

> **El repositorio es público.** Ningún secreto, credencial, dato de pacientes ni archivo subido puede entrar en git. Ver sección 3.

## 1. Arquitectura

Monorepo con `pnpm` workspaces y **separación estricta frontend/backend**:

```
medidoc/
  frontend/          Next.js (App Router) + TS + Tailwind. SOLO UI.
                     Sin Prisma, sin secretos, sin lógica de permisos.
                     Llama a /api/* (rewrite al backend).
  backend/           API Hono + Prisma + Zod. Auth, RBAC, cifrado, storage.
    prisma/schema.prisma
    src/
      index.ts       app Hono (export default para Vercel)
      env.ts         validación de variables de entorno
      db.ts          cliente Prisma
      auth/          Google OAuth (arctic) + sesiones en BD
      access.ts      assertAccess(userId, personId, minRole)
      crypto.ts      cifrado de campos AES-256-GCM
      storage.ts     URLs firmadas R2
      routes/        personas, documentos, compartir, auditoría
  packages/shared/   schemas Zod y tipos compartidos (sin secretos)
```

- **Despliegue:** dos proyectos en Vercel (frontend y backend).
- **Mismo origen:** el frontend reenvía `/api/*` al backend con `rewrites` de Next.js. El navegador ve un solo origen (cookie first-party) y la URL del backend no se expone.
- **Base de datos:** Postgres en Neon con Prisma 7 (driver adapter `pg`).
- **Archivos:** Cloudflare R2, bucket privado.

## 2. Modelo de datos

Los campos marcados `// cifrado` se guardan como texto cifrado AES-256-GCM (`v1:iv:tag:ciphertext` en base64). Solo el backend los descifra.

```prisma
model User {
  id          String       @id @default(cuid())
  email       String       @unique
  name        String?
  createdAt   DateTime     @default(now())
  memberships Membership[]
  sessions    Session[]
}

model Session {
  id         String   @id            // sha256 del token de la cookie
  userId     String
  expiresAt  DateTime
  lastSeenAt DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Person {
  id          String       @id @default(cuid())
  name        String       // cifrado
  birthDate   String?      // cifrado (YYYY-MM-DD)
  createdAt   DateTime     @default(now())
  memberships Membership[]
  documents   Document[]
  invitations Invitation[]
}

model Membership {
  userId   String
  personId String
  role     Role
  ...
  @@id([userId, personId])
}

model Invitation {         // invitación = permiso de entrada
  id         String   @id @default(cuid())
  email      String   // normalizado a minúsculas
  personId   String
  role       Role
  invitedBy  String
  createdAt  DateTime @default(now())
  acceptedAt DateTime?
  @@unique([email, personId])
}

model Document {
  id         String    @id @default(cuid())
  personId   String
  title      String    // cifrado
  category   Category
  examDate   DateTime  @db.Date
  storageKey String    @unique   // personId/cuid.ext, generado por el backend
  mimeType   String
  sizeBytes  Int
  notes      String?   // cifrado
  uploadedBy String
  createdAt  DateTime  @default(now())
  deletedAt  DateTime?           // soft delete (papelera en fase 2)
}

model AuditLog {
  id         String      @id @default(cuid())
  userId     String
  personId   String?
  action     AuditAction // UPLOAD | VIEW | UPDATE | DELETE | SHARE | UNSHARE
  documentId String?
  createdAt  DateTime    @default(now())
}

enum Role     { OWNER EDITOR VIEWER }
enum Category { LABORATORIO IMAGENOLOGIA RECETA OTRO }
```

## 3. Seguridad (datos de salud y repo público)

### Nada sensible en GitHub
1. `.gitignore` excluye `.env*` (salvo `.env.example` con valores vacíos), uploads, dumps de BD y `*.pem`/`*.key`.
2. **Hook de pre-commit con gitleaks** (`.githooks/pre-commit`). Si gitleaks no está instalado, el commit falla.
3. Sin seeds ni fixtures con datos reales; las pruebas generan datos ficticios y los borran.
4. Activar en GitHub **Secret scanning + Push protection** (Settings → Code security).
5. Los secretos viven solo en las variables de entorno de Vercel y en `.env` local.

### En la aplicación
1. **Cifrado de campos** (`crypto.ts`): AES-256-GCM, clave de 32 bytes en `FIELD_ENCRYPTION_KEY`. La búsqueda (fase 2) se hace en el backend tras descifrar.
2. **Login:** Google OAuth gestionado por el backend (PKCE + state). Solo entran los `ADMIN_EMAILS` y los correos con una `Invitation` pendiente o aceptada. No hay registro abierto.
3. **Sesiones en BD:** cookie `__Host-session`, httpOnly, Secure, SameSite=Lax, con un token aleatorio de 32 bytes. En BD solo se guarda su sha256. Expira a los 7 días o tras 24 h de inactividad.
4. **CSRF:** las peticiones que modifican datos exigen la cabecera `Origin` igual a `APP_ORIGIN`.
5. **RBAC en cada ruta:** `assertAccess(userId, personId, minRole)`. Nunca se confía en el `personId` del cliente sin comprobar el `Membership`.

   | Acción | VIEWER | EDITOR | OWNER |
   |---|---|---|---|
   | Ver y descargar | ✔ | ✔ | ✔ |
   | Subir y editar metadatos | | ✔ | ✔ |
   | Borrar documento o persona | | | ✔ |
   | Compartir, quitar acceso, ver auditoría | | | ✔ |

6. **Archivos en R2 privado:** subida directa desde el navegador con URL PUT firmada (5 min) y descarga con URL GET firmada (60 s), ambas emitidas tras comprobar permisos. Solo PDF/JPG/PNG, máximo 15 MB. Al confirmar la subida, el backend verifica el MIME real leyendo los primeros bytes del objeto.
7. **Transacciones:** `Document` + `AuditLog` en un único `$transaction`.
8. **Fechas:** `examDate` se guarda como `@db.Date` y viaja como string `YYYY-MM-DD`. En el cliente nunca se usa `new Date("YYYY-MM-DD")`.
9. **Cabeceras:** `Cache-Control: private, no-store` en todas las respuestas de la API, más CSP y `X-Content-Type-Options` en el frontend.

## 4. Pantallas del MVP

Diseño responsive para móvil y escritorio por igual: en móvil, la subida permite usar la cámara; en escritorio, arrastrar archivos.

1. `/login`: botón de Google.
2. `/`: personas a las que tengo acceso, más botón para crear una persona (quien la crea queda como OWNER).
3. `/personas/[id]`: documentos por fecha de examen, con filtro por categoría y año.
4. Subida: título, categoría, fecha, archivo y notas.
5. `/personas/[id]/compartir` (OWNER): invitar un correo con rol y quitar accesos.
6. `/personas/[id]/actividad` (OWNER): auditoría.

## 5. Fases

- **Fase 1 (MVP):** todo lo anterior.
- **Fase 2:** búsqueda, etiquetas, vista previa de PDF, pantalla de papelera y purga a los 30 días.
- **Fase 3:** recordatorios, exportar ZIP, 2FA.

## 6. Entornos

- **Producción:** rama principal de Neon y bucket R2 `medidoc-prod`.
- **Desarrollo y pruebas:** rama `dev` de Neon y bucket R2 `medidoc-dev`. Nunca se tocan datos reales.
- **Pruebas** (Vitest, en `backend/`): autosuficientes. Crean usuarios, personas y documentos ficticios y los eliminan (registro y archivo) al terminar. Casos mínimos:
  - un usuario sin `Membership` no puede ver ni descargar;
  - un `VIEWER` no puede subir ni borrar;
  - un `EDITOR` no puede borrar;
  - las fechas no se desfasan;
  - los campos cifrados no aparecen en claro en la BD.

## 7. Variables de entorno (solo backend)

Ver `backend/.env.example`. El frontend solo necesita `BACKEND_URL` (destino del rewrite, en el servidor de Next.js; nunca `NEXT_PUBLIC_`).

## 8. Cuentas pendientes

- [x] Vercel
- [x] Neon
- [ ] Cloudflare (R2)
- [ ] Google Cloud (cliente OAuth)
