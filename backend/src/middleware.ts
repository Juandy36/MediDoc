import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { sessionCookieName } from "./auth/cookies";
import { type SessionUser, validateSession } from "./auth/session";
import { env } from "./env";

export type AppEnv = { Variables: { user: SessionUser | null } };

/** Carga el usuario de la sesión (o null) en c.var.user. */
export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, sessionCookieName());
  c.set("user", token ? await validateSession(token) : null);
  await next();
});

/** Exige sesión válida. */
export const requireUser = createMiddleware<AppEnv & { Variables: { user: SessionUser } }>(
  async (c, next) => {
    if (!c.get("user")) throw new HTTPException(401, { message: "unauthenticated" });
    await next();
  },
);

/**
 * Protección CSRF: toda petición que modifica datos debe venir de nuestro propio origen.
 * La cookie es SameSite=Lax, y esto añade una segunda barrera.
 */
export const requireSameOrigin = createMiddleware(async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (c.req.header("origin") !== env().APP_ORIGIN) {
      throw new HTTPException(403, { message: "bad_origin" });
    }
  }
  await next();
});
