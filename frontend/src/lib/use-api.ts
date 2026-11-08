"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

type State<T> = { data: T | null; error: ApiError | null; loading: boolean };

/** Carga `path` de la API. Si la sesión no es válida, manda a /login. */
export function useApiData<T>(path: string | null) {
  const router = useRouter();
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace("/login");
          return;
        }
        setState({ data: null, error: e instanceof ApiError ? e : new ApiError(0, "network"), loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [path, version, router]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}

/** Ejecuta una mutación; si la sesión caducó, manda a /login. */
export function useMutation() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(path: string, init: RequestInit): Promise<T | null> => {
      setPending(true);
      setError(null);
      try {
        return await api<T>(path, init);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
        setError(e instanceof ApiError ? e.code : "network");
        return null;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { run, pending, error, setError };
}
