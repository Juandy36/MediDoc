"use client";

import { type PersonSummary, ROLE_LABELS, formatDateOnly } from "@medidoc/shared";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { errorMessage } from "@/lib/messages";
import { useApiData, useMutation } from "@/lib/use-api";

export function Home() {
  return (
    <AppShell>
      <People />
    </AppShell>
  );
}

function People() {
  const { data, error, loading, reload } = useApiData<{ people: PersonSummary[] }>("/personas");
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Familia</h1>
        {!creating && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + Nueva persona
          </button>
        )}
      </div>

      {creating && (
        <NewPersonForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {loading && <p className="text-zinc-500">Cargando…</p>}
      {error && <p className="alert-error">{errorMessage(error.code)}</p>}
      {data && data.people.length === 0 && !creating && (
        <div className="card text-center text-zinc-600 dark:text-zinc-400">
          Aún no hay nadie. Añade a la primera persona de tu familia.
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {data?.people.map((p) => (
          <li key={p.id}>
            <Link
              href={`/personas/${p.id}`}
              className="card flex items-center justify-between gap-3 transition hover:border-blue-400 dark:hover:border-blue-700"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-sm text-zinc-500">
                  {p.birthDate ? `Nació el ${formatDateOnly(p.birthDate)}` : "Sin fecha de nacimiento"}
                </p>
              </div>
              <span className="badge shrink-0">{ROLE_LABELS[p.role]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function NewPersonForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const { run, pending, error } = useMutation();
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await run("/personas", {
      method: "POST",
      body: JSON.stringify({ name, birthDate: birthDate || undefined }),
    });
    if (res) onCreated();
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="name" className="label">Nombre</label>
        <input id="name" className="input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div>
        <label htmlFor="birth" className="label">Fecha de nacimiento (opcional)</label>
        <input id="birth" type="date" className="input" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </div>
      {error && <p className="alert-error sm:col-span-2">{errorMessage(error)}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" disabled={pending}>{pending ? "Guardando…" : "Crear"}</button>
      </div>
    </form>
  );
}
