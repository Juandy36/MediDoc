"use client";

import { type PersonSummary, ROLE_LABELS, formatDateOnly } from "@medidoc/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { errorMessage } from "@/lib/messages";
import { useApiData, useMutation } from "@/lib/use-api";

export function PersonView() {
  return (
    <AppShell>
      <Person />
    </AppShell>
  );
}

function Person() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, reload } = useApiData<{ person: PersonSummary }>(`/personas/${id}`);
  const del = useMutation();
  const [editing, setEditing] = useState(false);

  if (error) return <p className="alert-error">{errorMessage(error.code)}</p>;
  if (!data) return <p className="text-zinc-500">Cargando…</p>;
  const p = data.person;
  const canEdit = p.role !== "VIEWER";
  const isOwner = p.role === "OWNER";

  async function remove() {
    if (!window.confirm(`¿Eliminar a ${p.name}? Esta acción no se puede deshacer.`)) return;
    if (await del.run(`/personas/${p.id}`, { method: "DELETE" })) router.replace("/");
  }

  return (
    <>
      <nav className="text-sm">
        <Link href="/" className="text-blue-700 hover:underline dark:text-blue-400">← Familia</Link>
      </nav>

      {editing ? (
        <EditPerson person={p} onDone={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
            <p className="text-sm text-zinc-500">
              {p.birthDate ? `Nació el ${formatDateOnly(p.birthDate)}` : "Sin fecha de nacimiento"} ·{" "}
              <span className="badge">{ROLE_LABELS[p.role]}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <button className="btn-secondary" onClick={() => setEditing(true)}>Editar</button>}
            {isOwner && <Link className="btn-secondary" href={`/personas/${p.id}/compartir`}>Compartir</Link>}
            {isOwner && <Link className="btn-secondary" href={`/personas/${p.id}/actividad`}>Actividad</Link>}
            {isOwner && <button className="btn-danger" onClick={remove} disabled={del.pending}>Eliminar</button>}
          </div>
        </div>
      )}
      {del.error && <p className="alert-error">{errorMessage(del.error)}</p>}

      <section className="card">
        <h2 className="font-medium">Documentos</h2>
        <p className="mt-1 text-sm text-zinc-500">Pronto podrás subir y consultar exámenes aquí.</p>
      </section>
    </>
  );
}

function EditPerson({ person, onDone, onCancel }: { person: PersonSummary; onDone: () => void; onCancel: () => void }) {
  const { run, pending, error } = useMutation();
  const [name, setName] = useState(person.name);
  const [birthDate, setBirthDate] = useState(person.birthDate ?? "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const res = await run(`/personas/${person.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, birthDate: birthDate || null }),
    });
    if (res) onDone();
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="name" className="label">Nombre</label>
        <input id="name" className="input" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="birth" className="label">Fecha de nacimiento</label>
        <input id="birth" type="date" className="input" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
      </div>
      {error && <p className="alert-error sm:col-span-2">{errorMessage(error)}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
      </div>
    </form>
  );
}
