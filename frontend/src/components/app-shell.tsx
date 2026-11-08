"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api, type Me } from "@/lib/api";
import { useApiData } from "@/lib/use-api";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data } = useApiData<Me>("/auth/me");

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-4 px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            MediDoc
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {data && (
              <span className="hidden max-w-56 truncate text-zinc-600 sm:inline dark:text-zinc-400">{data.user.email}</span>
            )}
            <button onClick={logout} className="btn-secondary">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:py-10">
        {data ? children : <p className="text-zinc-500">Cargando…</p>}
      </main>
    </div>
  );
}
