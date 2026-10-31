"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

export type PanelRow = {
  id: string; number: string; name: string; rank: string | null;
  doc: string; phone: string | null; birthDate: string | null;
  photoUrl: string | null; hasIdDoc: boolean; photoSource: string | null;
  by: string | null; createdAt: string;
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
  const shown = rows;
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
  const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const avatar = (r: PanelRow) => r.photoUrl
    ? <img className="avatar" src={r.photoUrl} alt="" />
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
            <tr><th></th><th>N.º</th><th>Nombre</th><th>Grado</th><th>Cédula</th><th>Edad</th><th>Teléfono</th><th>Registró</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{avatar(r)}</td>
                <td><strong>{r.number}</strong></td>
                <td>{r.name}</td>
                <td>{r.rank || "—"}</td>
                <td className="nowrap">{r.doc}</td>
                <td>{age(r.birthDate) ?? "—"}</td>
                <td className="small">{r.phone || "—"}</td>
                <td>{r.by ?? "—"}</td>
                <td className="small">{date(r.createdAt)}</td>
                <td>{extra(r)}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={10} className="small">{query ? "Sin resultados." : "Sin inscritos todavía."}</td></tr>}
          </tbody>
        </table>
      </div>

      <ul className="p-list only-mobile">
        {shown.map((r) => (
          <li key={r.id} className="p-item">
            {avatar(r)}
            <div className="p-body">
              <div className="p-name">{r.name}</div>
              <div className="small">{[r.rank, r.doc, age(r.birthDate) !== null ? `${age(r.birthDate)} años` : ""].filter(Boolean).join(" · ")}</div>
              <div className="small p-meta">
                <span>{r.by ?? "—"} · {date(r.createdAt)}</span>
                {extra(r)}
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
