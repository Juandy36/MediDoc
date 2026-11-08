"use client";

import { useSearchParams } from "next/navigation";

const MESSAGES: Record<string, string> = {
  not_allowed: "Este correo no tiene acceso. Pide a un familiar que te invite.",
  expired: "El inicio de sesión caducó. Inténtalo de nuevo.",
  oauth: "No se pudo completar el inicio de sesión con Google.",
};

export function LoginError() {
  const code = useSearchParams().get("error");
  if (!code) return null;
  return (
    <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {MESSAGES[code] ?? "Ocurrió un error. Inténtalo de nuevo."}
    </p>
  );
}
