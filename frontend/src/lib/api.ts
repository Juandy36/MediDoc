// Cliente mínimo de la API. Toda la lógica y los permisos viven en el backend;
// aquí solo se hacen peticiones a /api (mismo origen, vía rewrite).

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? "error");
  }
  return res.json() as Promise<T>;
}

export type Me = { user: { email: string; name: string | null } };
