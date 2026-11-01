"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { esMilitar } from "@/lib/grados";

export type PanelRow = {
  id: string; number: string; name: string; rank: string | null;
  doc: string; phone: string | null; birthDate: string | null;
  photoUrl: string | null; hasIdDoc: boolean; photoSource: string | null;
  by: string | null; createdAt: string;
  fuera?: "no-invitado" | "excluido"; // no sale en la ruleta: no está en la lista de invitados, o está excluido
};

// Lista de inscritos: tabla en PC, tarjetas en celular. El buscador consulta en el servidor
// (por nombre, cédula, número, cargo u operador) para que funcione igual con miles de inscritos.
export default function PanelList({ rows, total, query, limit }: { rows: PanelRow[]; total: number; query: string; limit: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(query);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function onSearch(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const t = value.trim();
      startTransition(() => router.replace(t ? `${pathname}?q=${encodeURIComponent(t)}` : pathname, { scroll: false }));
    }, 350);
  }
  // Borrar inscrito (el panel solo lo abre el admin). Si había ganado, también sale de los ganadores.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  async function onDelete(r: PanelRow) {
    if (deleting || !confirm(`¿Borrar a ${r.name} (n.º ${r.number})? Si ganó, también sale de los ganadores. No se puede deshacer.`)) return;
    setDeleting(r.id);
    try {
      const res = await fetch(`/api/admin/participants/${r.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) throw new Error(data.error ?? "No se pudo borrar");
      setHidden((h) => new Set(h).add(r.id));
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }
  const del = (r: PanelRow) => (
    <button type="button" className="row-del" onClick={() => onDelete(r)} disabled={!!deleting} title="Borrar inscrito" aria-label={`Borrar a ${r.name}`}>
      {deleting === r.id ? "…" : "🗑️"}
    </button>
  );
  const shown = rows.filter((r) => !hidden.has(r.id));
  const caption = query
    ? `${rows.length >= limit ? `Más de ${limit}` : rows.length} resultado${rows.length === 1 ? "" : "s"}${rows.length >= limit ? " (afina la búsqueda)" : ""}`
    : total > rows.length ? `Mostrando los ${rows.length} más recientes de ${total}. Usa el buscador para encontrar a cualquiera.` : "";
  // Hora de Venezuela fija: el servidor (Vercel, en UTC) y el teléfono deben pintar lo mismo, si no la hora salía
  // corrida 4 h y React reportaba un error de hidratación.
  const date = (s: string) => new Date(s).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" });
  const extra = (r: PanelRow) => r.hasIdDoc
    ? <a href={`/api/admin/document/${r.id}`} target="_blank" rel="noreferrer">Ver cédula</a>
    : <span className="small">{r.photoSource === "api" ? "Foto API" : "Foto nueva"}</span>;
  // Edad a partir de la fecha de nacimiento (YYYY-MM-DD), que es lo que entrega Infopress.
  const age = (d: string | null) => {
    if (!d) return null;
    const [y, m, day] = d.split("-").map(Number), now = new Date();
    const a = now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < day) ? 1 : 0);
    return Number.isFinite(a) ? a : null;
  };
  // Mismo criterio que la ruleta: un grado escrito que no está en la lista sortea como civil (se marca para corregirlo).
  const fueraBadge = (r: PanelRow) => r.fuera === "excluido"
    ? <span className="badge warn" title="Está en la lista de excluidos: no sale en la ruleta">Excluido</span>
    : r.fuera ? <span className="badge warn" title="No está en la lista de invitados: no sale en la ruleta">Fuera de lista</span> : null;
  const tipo = (r: PanelRow) => esMilitar(r.rank) ? <span className="badge on">Militar</span>
    : r.rank?.trim() ? <span className="badge warn" title="Grado no reconocido: en la ruleta sortea como civil">Civil ⚠️</span>
    : <span className="badge">Civil</span>;
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const [badPhotos, setBadPhotos] = useState<Set<string>>(() => new Set());
  const markBad = (id: string) => setBadPhotos((s) => (s.has(id) ? s : new Set(s).add(id)));
  // Si la foto no carga (enlace vencido, red que la bloquea, archivo dañado) se muestran las iniciales.
  const avatar = (r: PanelRow) => r.photoUrl && !badPhotos.has(r.id)
    ? <img className="avatar" src={r.photoUrl} alt="" onError={() => markBad(r.id)}
        ref={(el) => { if (el?.complete && !el.naturalWidth) markBad(r.id); }} />
    : <div className="avatar initials" style={{ fontSize: ".85rem" }}>{initials(r.name)}</div>;

  return (
    <>
      {(total > 0 || query) && (
        <div className="panel-search-wrap">
          <input className="panel-search" type="search" value={q} onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por nombre, cédula o número" aria-label="Buscar inscrito" />
          {pending && <span className="spinner" aria-label="Buscando" />}
        </div>
      )}
      {caption && <p className="small list-caption">{caption}</p>}

      <div className="card table-wrap only-desk">
        <table>
          <thead>
            <tr><th></th><th>N.º</th><th>Nombre</th><th>Tipo</th><th>Grado</th><th>Cédula</th><th>Edad</th><th>Registró</th><th>Fecha</th><th></th><th></th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{avatar(r)}</td>
                <td><strong>{r.number}</strong></td>
                <td>{r.name}</td>
                <td>{tipo(r)} {fueraBadge(r)}</td>
                <td>{r.rank || "—"}</td>
                <td className="nowrap">{r.doc}</td>
                <td>{age(r.birthDate) ?? "—"}</td>
                <td>{r.by ?? "—"}</td>
                <td className="small">{date(r.createdAt)}</td>
                <td>{extra(r)}</td>
                <td>{del(r)}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={11} className="small">{query ? "Sin resultados." : "Sin inscritos todavía."}</td></tr>}
          </tbody>
        </table>
      </div>

      <ul className="p-list only-mobile">
        {shown.map((r) => (
          <li key={r.id} className="p-item">
            {avatar(r)}
            <div className="p-body">
              <div className="p-name">{r.name} {fueraBadge(r)}</div>
              <div className="small">{[r.rank ? (esMilitar(r.rank) ? r.rank : `${r.rank} (civil ⚠️)`) : "Civil", r.doc, age(r.birthDate) !== null ? `${age(r.birthDate)} años` : ""].filter(Boolean).join(" · ")}</div>
              <div className="small p-meta">
                <span>{r.by ?? "—"} · {date(r.createdAt)}</span>
                {extra(r)}
                {del(r)}
              </div>
            </div>
            <div className="p-num">{r.number}</div>
          </li>
        ))}
        {!shown.length && <li className="small p-empty">{query ? "Sin resultados." : "Sin inscritos todavía."}</li>}
      </ul>
    </>
  );
}
