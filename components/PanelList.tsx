"use client";
import { useMemo, useState } from "react";

export type PanelRow = {
  id: string; number: string; name: string; rank: string | null;
  doc: string; phone: string | null; email: string | null; city: string | null;
  photoUrl: string | null; hasIdDoc: boolean; photoSource: string | null;
  by: string | null; createdAt: string;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Lista de inscritos: tabla en PC, tarjetas en celular, con buscador por nombre, cédula o número.
export default function PanelList({ rows }: { rows: PanelRow[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return rows;
    return rows.filter((r) => norm(`${r.name} ${r.doc} ${r.number} ${r.rank ?? ""} ${r.by ?? ""}`).includes(t));
  }, [rows, q]);
  const date = (s: string) => new Date(s).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const extra = (r: PanelRow) => r.hasIdDoc
    ? <a href={`/api/admin/document/${r.id}`} target="_blank" rel="noreferrer">Ver cédula</a>
    : <span className="small">{r.photoSource === "api" ? "Foto API" : "Foto nueva"}</span>;
  const avatar = (r: PanelRow) => r.photoUrl ? <img className="avatar" src={r.photoUrl} alt="" /> : <div className="avatar" />;

  return (
    <>
      {rows.length > 0 && (
        <input className="panel-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, cédula o número" aria-label="Buscar inscrito" />
      )}

      <div className="card table-wrap only-desk">
        <table>
          <thead>
            <tr><th></th><th>N.º</th><th>Nombre</th><th>Documento</th><th>Contacto</th><th>Ciudad</th><th>Registró</th><th>Fecha</th><th></th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{avatar(r)}</td>
                <td><strong>{r.number}</strong></td>
                <td>{r.name}{r.rank && <><br /><span className="small">{r.rank}</span></>}</td>
                <td>{r.doc}</td>
                <td>{r.phone}<br /><span className="small">{r.email ?? ""}</span></td>
                <td>{r.city ?? "—"}</td>
                <td>{r.by ?? "—"}</td>
                <td className="small">{date(r.createdAt)}</td>
                <td>{extra(r)}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={9} className="small">{rows.length ? "Sin resultados." : "Sin inscritos todavía."}</td></tr>}
          </tbody>
        </table>
      </div>

      <ul className="p-list only-mobile">
        {shown.map((r) => (
          <li key={r.id} className="p-item">
            {avatar(r)}
            <div className="p-body">
              <div className="p-name">{r.name}</div>
              <div className="small">{[r.rank, r.doc].filter(Boolean).join(" · ")}</div>
              <div className="small p-meta">
                <span>{r.by ?? "—"} · {date(r.createdAt)}</span>
                {extra(r)}
              </div>
            </div>
            <div className="p-num">{r.number}</div>
          </li>
        ))}
        {!shown.length && <li className="small p-empty">{rows.length ? "Sin resultados." : "Sin inscritos todavía."}</li>}
      </ul>
    </>
  );
}
