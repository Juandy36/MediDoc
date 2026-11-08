import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import { isSecureOrigin } from "../env";
import type { OAuthFlow } from "./google";

// En producción (HTTPS) se usa el prefijo __Host-: el navegador exige Secure, Path=/ y sin Domain.
// En local (http://localhost) no se puede usar ese prefijo.
export const sessionCookieName = () => (isSecureOrigin() ? "__Host-medidoc_session" : "medidoc_session");
const flowCookieName = () => (isSecureOrigin() ? "__Host-medidoc_oauth" : "medidoc_oauth");

const base = (): CookieOptions => ({
  httpOnly: true,
  secure: isSecureOrigin(),
  sameSite: "Lax", // Lax: necesario para volver desde Google con la cookie del flujo
  path: "/",
});

export function setSessionCookie(c: Context, token: string, expires: Date) {
  setCookie(c, sessionCookieName(), token, { ...base(), expires });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, sessionCookieName(), base());
}

export function setFlowCookie(c: Context, flow: OAuthFlow) {
  setCookie(c, flowCookieName(), JSON.stringify(flow), { ...base(), maxAge: 600 });
}

/** Lee y borra la cookie del flujo OAuth (un solo uso). */
export function takeFlowCookie(c: Context): OAuthFlow | null {
  const raw = getCookie(c, flowCookieName());
  deleteCookie(c, flowCookieName(), base());
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OAuthFlow>;
    return typeof v.state === "string" && typeof v.nonce === "string" && typeof v.verifier === "string"
      ? (v as OAuthFlow)
      : null;
  } catch {
    return null;
  }
}
