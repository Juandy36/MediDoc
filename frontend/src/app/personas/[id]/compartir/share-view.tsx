"use client";

import { type AccessList, type PersonSummary, ROLES, ROLE_LABELS, type Role } from "@medidoc/shared";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { errorMessage } from "@/lib/messages";
import { useApiData, useMutation } from "@/lib/use-api";

const ROLE_HELP: Record<Role, string> = {
  VIEWER: "Ve y descarga documentos.",
  EDITOR: "Además sube y edita documentos.",
  OWNER: "Control total: borrar, compartir y ver actividad.",
};

export function ShareView() {
  return (
    <AppShell>
      <Share />
    </AppShell>
  );
}

function Share() {
  const { id } = useParams<{ id: string }>();
  const person = useApiData<{ person: PersonSummary }>(`/personas/${id}`);
  const access = useApiData<AccessList>(`/personas/${id}/accesos`);
  const m = useMutation();

  async function changeRole(userId: string, role: Role) {
    if (await m.run(`/personas/${id}/accesos/${userId}`, { method: "PATCH", body: JSON.stringify({ role }) })) access.reload();
  }
  async function removeMember(userId: string, email: string) {
    if (!window.confirm(`¿Quitar el acceso de ${email}?`)) return;
    if (await m.run(`/personas/${id}/accesos/${userId}`, { method: "DELETE" })) access.reload();
  }
  async function cancelInvite(invId: string) {
    if (await m.run(`/personas/${id}/invitaciones/${invId}`, { method: "DELETE" })) access.reload();
  }

  const err = person.error ?? access.error;
  if (err) return <p className="alert-error">{errorMessage(err.code)}</p>;
  if (!person.data || !access.data) return <p className="text-zinc-500">Cargando…</p>;

  return (
    <>
      <nav className="text-sm">
        <Link href={`/personas/${id}`} className="text-blue-700 hover:underline dark:text-blue-400">
          ← {person.data.person.name}
        </Link>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compartir los documentos de {person.data.person.name}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Elige qué cuentas de Google pueden entrar a MediDoc y ver los exámenes de {person.data.person.name}.
        </p>
      </div>

      <InviteForm personId={id} onInvited={access.reload} />

      {m.error && <p className="alert-error">{errorMessage(m.error)}</p>}

      <section className="card">
        <h2 className="font-medium">Quién tiene acceso</h2>
        <p className="mb-3 text-sm text-zinc-500">Cuentas que pueden ver los documentos de {person.data.person.name}.</p>
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {access.data.members.map((u) => (
            <li key={u.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {u.name ?? u.email} {u.isMe && <span className="text-zinc-500">(tu cuenta)</span>}
                </p>
                <p className="truncate text-xs text-zinc-500">{u.email}</p>
              </div>
              {u.isMe ? (
                <span className="badge" title="Tu propio rol no se puede cambiar desde aquí">{ROLE_LABELS[u.role]}</span>
              ) : (
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Rol de ${u.email}`}
                  className="input w-auto py-1"
                  value={u.role}
                  disabled={m.pending}
                  onChange={(e) => changeRole(u.userId, e.target.value as Role)}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <button className="btn-danger" disabled={m.pending} onClick={() => removeMember(u.userId, u.email)}>
                  Quitar
                </button>
              </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {access.data.invitations.length > 0 && (
        <section className="card">
          <h2 className="mb-1 font-medium">Invitaciones pendientes</h2>
          <p className="mb-3 text-sm text-zinc-500">Recibirán el acceso al iniciar sesión con Google por primera vez.</p>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {access.data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="min-w-0 truncate text-sm">
                  {i.email} <span className="badge ml-1">{ROLE_LABELS[i.role]}</span>
                </p>
                <button className="btn-danger" disabled={m.pending} onClick={() => cancelInvite(i.id)}>Cancelar</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function InviteForm({ personId, onInvited }: { personId: string; onInvited: () => void }) {
  const { run, pending, error } = useMutation();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    const res = await run<{ status: "granted" | "invited" }>(`/personas/${personId}/invitaciones`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
    if (!res) return;
    setNotice(
      res.status === "granted"
        ? `${email} ya tiene acceso.`
        : `Invitación creada. ${email} debe estar también como usuario de prueba en Google mientras la app esté en modo Prueba.`,
    );
    setEmail("");
    onInvited();
  }

  return (
    <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <div>
        <label htmlFor="email" className="label">Correo de Google</label>
        <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="familiar@gmail.com" />
      </div>
      <div>
        <label htmlFor="role" className="label">Rol</label>
        <select id="role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>
      <button className="btn-primary" disabled={pending}>{pending ? "Invitando…" : "Invitar"}</button>
      <p className="text-xs text-zinc-500 sm:col-span-3">{ROLE_HELP[role]}</p>
      {error && <p className="alert-error sm:col-span-3">{errorMessage(error)}</p>}
      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 sm:col-span-3 dark:bg-green-950 dark:text-green-200">{notice}</p>}
    </form>
  );
}
