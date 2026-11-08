"use client";

import {
  ALLOWED_MIME_TYPES,
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type DocumentSummary,
  MAX_FILE_BYTES,
  type Role,
  type UploadTicket,
  formatDateOnly,
} from "@medidoc/shared";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { errorMessage } from "@/lib/messages";
import { useApiData, useMutation } from "@/lib/use-api";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const formatSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export function Documents({ personId, role }: { personId: string; role: Role }) {
  const { data, error, reload } = useApiData<{ documents: DocumentSummary[] }>(`/personas/${personId}/documentos`);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | "">("");
  const [year, setYear] = useState("");
  const del = useMutation();
  const canEdit = role !== "VIEWER";

  const docs = useMemo(() => data?.documents ?? [], [data]);
  const years = useMemo(() => [...new Set(docs.map((d) => d.examDate.slice(0, 4)))].sort().reverse(), [docs]);
  const visible = docs.filter((d) => (!category || d.category === category) && (!year || d.examDate.startsWith(year)));

  async function remove(d: DocumentSummary) {
    if (!window.confirm(`¿Eliminar "${d.title}"?`)) return;
    if (await del.run(`/documentos/${d.id}`, { method: "DELETE" })) reload();
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">Documentos</h2>
        {canEdit && !uploading && (
          <button className="btn-primary" onClick={() => setUploading(true)}>+ Subir examen</button>
        )}
      </div>

      {uploading && (
        <UploadForm personId={personId} onCancel={() => setUploading(false)} onDone={() => { setUploading(false); reload(); }} />
      )}

      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <select aria-label="Filtrar por categoría" className="input w-auto py-1" value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
            <option value="">Todas las categorías</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <select aria-label="Filtrar por año" className="input w-auto py-1" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Todos los años</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {error && <p className="alert-error">{errorMessage(error.code)}</p>}
      {del.error && <p className="alert-error">{errorMessage(del.error)}</p>}
      {data && docs.length === 0 && !uploading && <p className="text-sm text-zinc-500">Aún no hay documentos.</p>}
      {docs.length > 0 && visible.length === 0 && <p className="text-sm text-zinc-500">Ningún documento coincide con el filtro.</p>}

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {visible.map((d) =>
          editing === d.id ? (
            <li key={d.id} className="py-3">
              <MetaForm
                initial={d}
                submitLabel="Guardar"
                onCancel={() => setEditing(null)}
                onSubmit={async (m) => {
                  await api(`/documentos/${d.id}`, { method: "PATCH", body: JSON.stringify(m) });
                  setEditing(null);
                  reload();
                }}
              />
            </li>
          ) : (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{d.title}</p>
                <p className="text-sm text-zinc-500">
                  {formatDateOnly(d.examDate)} · {CATEGORY_LABELS[d.category]} · {formatSize(d.sizeBytes)}
                </p>
                {d.notes && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{d.notes}</p>}
              </div>
              <div className="flex flex-wrap gap-1">
                <a className="btn-secondary" href={`/api/documentos/${d.id}/archivo?modo=ver`} target="_blank" rel="noopener noreferrer">Ver</a>
                <a className="btn-secondary" href={`/api/documentos/${d.id}/archivo`}>Descargar</a>
                {canEdit && <button className="btn-secondary" onClick={() => setEditing(d.id)}>Editar</button>}
                {role === "OWNER" && <button className="btn-danger" onClick={() => remove(d)} disabled={del.pending}>Eliminar</button>}
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

type Meta = { title: string; category: Category; examDate: string; notes: string };

function MetaFields({ meta, set }: { meta: Meta; set: (m: Meta) => void }) {
  return (
    <>
      <div className="sm:col-span-2">
        <label htmlFor="title" className="label">Título</label>
        <input id="title" className="input" required maxLength={200} value={meta.title} onChange={(e) => set({ ...meta, title: e.target.value })} placeholder="Ej. Hemograma completo" />
      </div>
      <div>
        <label htmlFor="category" className="label">Categoría</label>
        <select id="category" className="input" value={meta.category} onChange={(e) => set({ ...meta, category: e.target.value as Category })}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="examDate" className="label">Fecha del examen</label>
        <input id="examDate" type="date" required className="input" max={todayLocal()} value={meta.examDate} onChange={(e) => set({ ...meta, examDate: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="notes" className="label">Notas (opcional)</label>
        <textarea id="notes" rows={2} maxLength={2000} className="input" value={meta.notes} onChange={(e) => set({ ...meta, notes: e.target.value })} />
      </div>
    </>
  );
}

function MetaForm({ initial, submitLabel, onCancel, onSubmit }: {
  initial: DocumentSummary;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (m: Meta) => Promise<void>;
}) {
  const [meta, setMeta] = useState<Meta>({ title: initial.title, category: initial.category, examDate: initial.examDate, notes: initial.notes ?? "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSubmit(meta);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "network");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <MetaFields meta={meta} set={setMeta} />
      {error && <p className="alert-error sm:col-span-2">{errorMessage(error)}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" disabled={pending}>{pending ? "Guardando…" : submitLabel}</button>
      </div>
    </form>
  );
}

/** Sube directo a R2 con XHR para poder mostrar el progreso. */
function putWithProgress(ticket: UploadTicket, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", ticket.url);
    for (const [k, v] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, "upload_failed")));
    xhr.onerror = () => reject(new ApiError(0, "upload_failed"));
    xhr.send(file);
  });
}

function UploadForm({ personId, onCancel, onDone }: { personId: string; onCancel: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta>({ title: "", category: "LABORATORIO", examDate: todayLocal(), notes: "" });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return setFile(null);
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(f.type)) {
      setError("file_type");
      return setFile(null);
    }
    if (f.size > MAX_FILE_BYTES) {
      setError("file_too_large");
      return setFile(null);
    }
    setFile(f);
    if (!meta.title) setMeta((m) => ({ ...m, title: f.name.replace(/\.[^.]+$/, "").slice(0, 200) }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return setError("file_missing");
    setError(null);
    setProgress(0);
    try {
      const ticket = await api<UploadTicket>(`/personas/${personId}/documentos/subidas`, {
        method: "POST",
        body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
      });
      await putWithProgress(ticket, file, setProgress);
      await api(`/personas/${personId}/documentos`, {
        method: "POST",
        body: JSON.stringify({ ...meta, notes: meta.notes || undefined, uploadId: ticket.uploadId }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "network");
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border border-dashed border-zinc-300 p-4 sm:grid-cols-2 dark:border-zinc-700">
      <div
        className="sm:col-span-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
      >
        <label htmlFor="file" className="label">Archivo (PDF, JPG o PNG · máx. 15 MB)</label>
        <input
          id="file"
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:file:bg-zinc-800"
          onChange={(e) => pick(e.target.files?.[0])}
          disabled={busy}
        />
        <p className="mt-1 text-xs text-zinc-500">En el móvil puedes tomar una foto; en el ordenador, arrastrar el archivo aquí.</p>
      </div>
      <MetaFields meta={meta} set={setMeta} />
      {busy && (
        <div className="sm:col-span-2">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-500">{progress < 100 ? `Subiendo… ${progress}%` : "Verificando archivo…"}</p>
        </div>
      )}
      {error && <p className="alert-error sm:col-span-2">{errorMessage(error)}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
        <button className="btn-primary" disabled={busy || !file}>{busy ? "Subiendo…" : "Subir"}</button>
      </div>
    </form>
  );
}
