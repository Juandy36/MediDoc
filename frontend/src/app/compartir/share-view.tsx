"use client";

import { ROLES, ROLE_LABELS, type Role, type ShareOverview, type SharedAccount } from "@medidoc/shared";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { errorMessage } from "@/lib/messages";
import { useApiData, useMutation } from "@/lib/use-api";

type Choice = Role | "NONE";
const NONE_LABEL = "Sin acceso";

export function ShareView() {
  return (
    <AppShell>
      <Share />
    </AppShell>
  );
}

function Share() {
  const { data, error, reload } = useApiData<ShareOverview>("/compartir");
  // null = cerrado; "" = nuevo invitado; otro = editando ese correo
  const [editing, setEditing] = useState<string | null>("");

  if (error) return <p className="alert-error">{errorMessage(error.code)}</p>;
  if (!data) return <p className="text-zinc-500">Cargando…</p>;

  if (data.people.length === 0) {
    return (
      <div className="card text-zinc-600 dark:text-zinc-400">
        Solo puedes compartir personas que hayas creado tú (de las que eres propietario).{" "}
        <Link href="/" className="text-blue-700 underline dark:text-blue-400">Volver</Link>
      </div>
    );
  }

  const others = data.accounts.filter((a) => !a.isMe);
  const editingAccount = editing ? others.find((a) => a.email === editing) : undefined;

  return (
    <>
      <nav className="text-sm">
        <Link href="/" className="text-blue-700 hover:underline dark:text-blue-400">← Familia</Link>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Compartir</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Escribe el correo de Google de un familiar y elige qué puede hacer con los exámenes de cada persona.
        </p>
      </div>

      {editing !== null ? (
        <ShareForm
          key={editing || "new"}
          people={data.people}
          account={editingAccount}
          onCancel={others.length > 0 ? () => setEditing(null) : undefined}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : (
        <div>
          <button className="btn-primary" onClick={() => setEditing("")}>+ Compartir con alguien</button>
        </div>
      )}

      {others.length > 0 && (
        <section className="card">
          <h2 className="mb-3 font-medium">Con quién compartes</h2>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {others.map((a) => (
              <li key={a.email} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {a.name ?? a.email}
                    {a.pending && <span className="badge ml-2">Aún no ha entrado</span>}
                  </p>
                  {a.name && <p className="truncate text-xs text-zinc-500">{a.email}</p>}
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {data.people
                      .filter((p) => a.access[p.id])
                      .map((p) => `${p.name}: ${ROLE_LABELS[a.access[p.id]!]}`)
                      .join(" · ")}
                  </p>
                </div>
                <button className="btn-secondary" onClick={() => setEditing(a.email)}>Editar</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ShareForm({
  people,
  account,
  onCancel,
  onSaved,
}: {
  people: ShareOverview["people"];
  account?: SharedAccount;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const { run, pending, error } = useMutation();
  const [email, setEmail] = useState(account?.email ?? "");
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(people.map((p) => [p.id, account?.access[p.id] ?? "NONE"])),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const setAll = (c: Choice) => setChoices(Object.fromEntries(people.map((p) => [p.id, c])));
  const nothingSelected = Object.values(choices).every((c) => c === "NONE");

  async function save(e: FormEvent, removeAll = false) {
    e.preventDefault();
    if (removeAll && !window.confirm(`¿Quitar todos los accesos de ${email}?`)) return;
    const access = Object.fromEntries(
      people.map((p) => [p.id, removeAll || choices[p.id] === "NONE" ? null : choices[p.id]]),
    );
    const res = await run<{ status: "granted" | "invited" }>("/compartir", {
      method: "PUT",
      body: JSON.stringify({ email, access }),
    });
    if (!res) return;
    if (res.status === "invited" && !removeAll && !nothingSelected) {
      setNotice(email);
      return;
    }
    onSaved();
  }

  if (notice) {
    return (
      <div className="card space-y-3">
        <p className="font-medium">Listo, invitaste a {notice}.</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Mientras la app esté en modo Prueba, añade también este correo como <strong>usuario de prueba</strong> en
          Google Cloud (Google Auth Platform → Público). Después solo tiene que entrar a MediDoc con Google.
        </p>
        <button className="btn-primary" onClick={onSaved}>Entendido</button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => save(e)} className="card space-y-5">
      <div>
        <label htmlFor="email" className="label">Correo de Google</label>
        <input
          id="email"
          type="email"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="familiar@gmail.com"
          readOnly={Boolean(account)}
          autoFocus={!account}
        />
      </div>

      <fieldset>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Permisos por persona</legend>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            Poner a todos:
            <select className="input w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && setAll(e.target.value as Choice)}>
              <option value="">—</option>
              <option value="NONE">{NONE_LABEL}</option>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </label>
        </div>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {people.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-sm">{p.name}</span>
              <select
                aria-label={`Permiso sobre ${p.name}`}
                className="input w-auto py-1"
                value={choices[p.id]}
                onChange={(e) => setChoices((c) => ({ ...c, [p.id]: e.target.value as Choice }))}
              >
                <option value="NONE">{NONE_LABEL}</option>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          Lector: ve y descarga · Editor: además sube y edita · Propietario: control total, incluido compartir.
        </p>
      </fieldset>

      {error && <p className="alert-error">{errorMessage(error)}</p>}

      <div className="flex flex-wrap justify-between gap-2">
        <div>
          {account && (
            <button type="button" className="btn-danger" disabled={pending} onClick={(e) => save(e, true)}>
              Quitar todos los accesos
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>}
          <button className="btn-primary" disabled={pending || (!account && nothingSelected)}>
            {pending ? "Guardando…" : account ? "Guardar cambios" : "Compartir"}
          </button>
        </div>
      </div>
    </form>
  );
}
