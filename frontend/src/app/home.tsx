"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api, type Me } from "@/lib/api";

export function Home() {
  const router = useRouter();
  const [me, setMe] = useState<Me["user"] | null>(null);

  useEffect(() => {
    api<Me>("/auth/me")
      .then((r) => setMe(r.user))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login");
      });
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }

  if (!me) {
    return <main className="flex flex-1 items-center justify-center p-4 text-zinc-500">Cargando…</main>;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">MediDoc</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">{me.email}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <p className="text-zinc-600 dark:text-zinc-400">Hola{me.name ? `, ${me.name}` : ""}. Aquí aparecerán las personas de tu familia.</p>
    </main>
  );
}
