import * as oauth from "oauth4webapi";
import { env } from "../env";

const issuer = new URL("https://accounts.google.com");
let discovered: oauth.AuthorizationServer | undefined;

async function authServer(): Promise<oauth.AuthorizationServer> {
  discovered ??= await oauth.processDiscoveryResponse(issuer, await oauth.discoveryRequest(issuer));
  return discovered;
}

const client = (): oauth.Client => ({ client_id: env().GOOGLE_CLIENT_ID });
export const redirectUri = () => `${env().APP_ORIGIN}/api/auth/google/callback`;

/** Datos efímeros del flujo, guardados en una cookie httpOnly de 10 minutos. */
export type OAuthFlow = { state: string; nonce: string; verifier: string };

export async function buildAuthorizationUrl(): Promise<{ url: URL; flow: OAuthFlow }> {
  const as = await authServer();
  const flow: OAuthFlow = {
    state: oauth.generateRandomState(),
    nonce: oauth.generateRandomNonce(),
    verifier: oauth.generateRandomCodeVerifier(),
  };
  const url = new URL(as.authorization_endpoint!);
  url.searchParams.set("client_id", env().GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("code_challenge", await oauth.calculatePKCECodeChallenge(flow.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", flow.state);
  url.searchParams.set("nonce", flow.nonce);
  url.searchParams.set("prompt", "select_account");
  return { url, flow };
}

/** Valida state, PKCE y nonce, y devuelve el correo verificado por Google. */
export async function completeAuthorization(
  callbackUrl: URL,
  flow: OAuthFlow,
): Promise<{ email: string; name: string | null }> {
  const as = await authServer();
  const params = oauth.validateAuthResponse(as, client(), callbackUrl, flow.state);
  const response = await oauth.authorizationCodeGrantRequest(
    as,
    client(),
    oauth.ClientSecretPost(env().GOOGLE_CLIENT_SECRET),
    params,
    redirectUri(),
    flow.verifier,
  );
  const result = await oauth.processAuthorizationCodeResponse(as, client(), response, {
    expectedNonce: flow.nonce,
    requireIdToken: true,
  });
  const claims = oauth.getValidatedIdTokenClaims(result)!;
  if (typeof claims.email !== "string" || claims.email_verified !== true) {
    throw new Error("Google no devolvió un correo verificado");
  }
  return { email: claims.email, name: typeof claims.name === "string" ? claims.name : null };
}
