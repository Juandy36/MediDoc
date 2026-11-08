import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { finalizeLogin, isEmailAllowed } from "../auth/allow";
import {
  clearSessionCookie,
  sessionCookieName,
  setFlowCookie,
  setSessionCookie,
  takeFlowCookie,
} from "../auth/cookies";
import { buildAuthorizationUrl, completeAuthorization } from "../auth/google";
import { createSession, deleteSession } from "../auth/session";
import { env } from "../env";
import type { AppEnv } from "../middleware";

export const authRoutes = new Hono<AppEnv>();

const toLogin = (error: string) => `${env().APP_ORIGIN}/login?error=${error}`;

authRoutes.get("/google/login", async (c) => {
  const { url, flow } = await buildAuthorizationUrl();
  setFlowCookie(c, flow);
  return c.redirect(url.toString(), 302);
});

authRoutes.get("/google/callback", async (c) => {
  const flow = takeFlowCookie(c);
  if (!flow) return c.redirect(toLogin("expired"), 302);

  let identity: { email: string; name: string | null };
  try {
    identity = await completeAuthorization(new URL(c.req.url), flow);
  } catch (err) {
    console.warn("OAuth callback rechazado:", err instanceof Error ? err.message : "desconocido");
    return c.redirect(toLogin("oauth"), 302);
  }

  if (!(await isEmailAllowed(identity.email))) {
    return c.redirect(toLogin("not_allowed"), 302);
  }

  const user = await finalizeLogin(identity.email, identity.name);
  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(c, token, expiresAt);
  return c.redirect(`${env().APP_ORIGIN}/`, 302);
});

authRoutes.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  return c.json({ user: { email: user.email, name: user.name } });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, sessionCookieName());
  if (token) await deleteSession(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});
