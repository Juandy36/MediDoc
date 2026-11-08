"use client";

import type { AuditAction, AuditEntry, PersonSummary } from "@medidoc/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { errorMessage } from "@/lib/messages";
import { useApiData } from "@/lib/use-api";

const ACTION_LABELS: Record<AuditAction, string> = {
  UPLOAD: "subió un documento",
  VIEW: "abrió un documento",
  UPDATE: "editó datos",
  DELETE: "eliminó un documento",
  SHARE: "cambió el acceso",
  UNSHARE: "quitó un acceso",
};

const fmt = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });

export function ActivityView() {
  return (
    <AppShell>
      <Activity />
    </AppShell>
  );
}

function Activity() {
  const { id } = useParams<{ id: string }>();
  const person = useApiData<{ person: PersonSummary }>(`/personas/${id}`);
  const log = useApiData<{ entries: AuditEntry[] }>(`/personas/${id}/actividad`);

  const err = person.error ?? log.error;
  if (err) return <p className="alert-error">{errorMessage(err.code)}</p>;
  if (!person.data || !log.data) return <p className="text-zinc-500">Cargando…</p>;

  return (
    <>
      <nav className="text-sm">
        <Link href={`/personas/${id}`} className="text-blue-700 hover:underline dark:text-blue-400">
          ← {person.data.person.name}
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold tracking-tight">Actividad</h1>
      <section className="card">
        {log.data.entries.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin actividad todavía.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {log.data.entries.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <span>
                  <span className="font-medium">{e.userEmail ?? "Usuario eliminado"}</span> {ACTION_LABELS[e.action]}
                </span>
                <time className="text-zinc-500" dateTime={e.createdAt}>{fmt.format(new Date(e.createdAt))}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
