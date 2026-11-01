"use client";

import { useMemo, useState } from "react";
import RaffleEligibilityImport from "./RaffleEligibilityImport";
import { normalizeRaffleDocument } from "@/lib/raffle-eligibility";

type Attendee = { id: string; document_number: string; full_name: string; rank: string | null; drawStatus: "available" | "winner" | "excluded" };
const PAGE_SIZE = 25;
const normalized = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function RaffleListManager({ raffleId, documents, registered, disabled }: {
  raffleId: string; documents: string[]; registered: Attendee[]; disabled: boolean;
}) {
  const [tab, setTab] = useState<"list" | "import" | "cross">("list");
  const [draft, setDraft] = useState(documents);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [newDoc, setNewDoc] = useState("");
  const [notice, setNotice] = useState("");
  const members = useMemo(() => new Set(draft), [draft]);
  const byDoc = useMemo(() => new Map(registered.map((p) => [normalizeRaffleDocument(p.document_number), p])), [registered]);
  const changed = draft.length !== documents.length || draft.some((doc, i) => doc !== documents[i]);
  const rows = useMemo(() => {
    const list = draft.map((doc) => {
      const attendee = byDoc.get(doc);
      return { doc, attendee, status: !attendee ? "pending" : attendee.drawStatus };
    });
    const outside = registered.filter((p) => !members.has(normalizeRaffleDocument(p.document_number) ?? ""))
      .map((attendee) => ({ doc: attendee.document_number, attendee, status: "outside" }));
    const source = tab === "cross" ? [...list, ...outside] : list;
    const q = normalized(query.trim());
    return source.filter((row) => (filter === "all" || row.status === filter) && (!q || normalized(`${row.doc} ${row.attendee?.full_name ?? ""}`).includes(q)));
  }, [draft, byDoc, registered, members, tab, query, filter]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const statusLabel: Record<string, string> = { pending: "Pendiente de registro", available: "Disponible para ganar", winner: "Ya ganó", excluded: "Grado con peso cero", outside: "Fuera de la lista" };

  function add() {
    const doc = normalizeRaffleDocument(newDoc);
    if (!doc) { setNotice("Escribe una cédula válida."); return; }
    if (members.has(doc)) { setNotice("Esta cédula ya está en la lista."); return; }
    if (draft.length >= 10000) { setNotice("La lista admite hasta 10000 cédulas."); return; }
    setDraft((list) => [...list, doc]); setNewDoc(""); setNotice("Cédula añadida al borrador. Guarda los cambios para aplicarla."); setPage(0);
  }

  return <section aria-label="Administración de la lista">
    <nav className="list-module-tabs" aria-label="Secciones de la lista">
      {([["list", "Administrar lista"], ["import", "Importar lista"], ["cross", "Cruzar con asistencia"]] as const).map(([id, label]) =>
        <button key={id} type="button" className={`btn${tab === id ? "" : " secondary"}`} aria-pressed={tab === id} onClick={() => { setTab(id); setFilter("all"); setPage(0); }}>{label}</button>)}
    </nav>
    {changed && <p role="status" className="list-module-draft">Hay cambios sin guardar. El sorteo sigue utilizando la lista guardada.</p>}
    {tab === "import" ? <>
      {changed && <p>Guarda o descarta tus cambios en «Administrar lista» antes de reemplazar la lista mediante importación.</p>}
      <RaffleEligibilityImport raffleId={raffleId} savedDocuments={documents} registered={registered} disabled={disabled || changed}/>
    </> : <div className="card">
      <h2>{tab === "list" ? "Integrantes de la lista" : "Cruce con la asistencia"}</h2>
      {tab === "list" && <form className="list-module-add" onSubmit={(event) => { event.preventDefault(); add(); }}>
        <div><label htmlFor="new-member">Añadir cédula</label><input id="new-member" value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="V-12.345.678" disabled={disabled}/></div>
        <button className="btn secondary" disabled={disabled} type="submit">Añadir a la lista</button>
      </form>}
      {notice && <p role="status">{notice}</p>}
      <div className="list-module-search">
        <div><label htmlFor="member-search">Buscar por cédula o nombre</label><input id="member-search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }}/></div>
        <div><label htmlFor="member-filter">Estado</label><select id="member-filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
          <option value="all">Todos</option><option value="available">Disponibles para ganar</option><option value="pending">Pendientes de registro</option><option value="winner">Ya ganaron</option><option value="excluded">Grado con peso cero</option>{tab === "cross" && <option value="outside">Fuera de la lista</option>}
        </select></div>
      </div>
      <p className="small">{rows.length} resultados · {draft.length} cédulas en {changed ? "el borrador" : "la lista guardada"}.</p>
      <div className="table-wrap"><table className="list-module-table"><thead><tr><th>Cédula</th><th>Nombre registrado</th><th>Grado</th><th>Estado</th>{tab === "list" && <th>Acciones</th>}</tr></thead>
        <tbody>{rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((row) => <tr key={row.doc}>
          <td>{row.doc}</td><td>{row.attendee?.full_name ?? "Sin registro de asistencia"}</td><td>{row.attendee?.rank || "—"}</td><td>{statusLabel[row.status]}</td>
          {tab === "list" && <td><button type="button" className="btn secondary danger" disabled={disabled} aria-label={`Quitar cédula ${row.doc}`} onClick={() => { setDraft((list) => list.filter((doc) => doc !== row.doc)); setNotice("Cédula quitada del borrador. El registro de asistencia se conserva."); }}>Quitar</button></td>}
        </tr>)}</tbody></table></div>
      {!rows.length && <p>No hay personas que coincidan con esta búsqueda.</p>}
      <div className="list-module-pagination"><button className="btn secondary" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Anterior</button><span>Página {currentPage + 1} de {totalPages}</span><button className="btn secondary" type="button" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div>
      {tab === "list" && <form className="list-module-save" method="post" action="/api/admin/eligibility">
        <input type="hidden" name="raffle_id" value={raffleId}/><input type="hidden" name="documents" value={draft.join("\n")}/>
        <button className="btn" disabled={disabled || !changed || draft.length === 0}>Guardar cambios</button>
        <button className="btn secondary" type="button" disabled={!changed} onClick={() => { setDraft(documents); setNotice("Cambios descartados."); }}>Descartar cambios</button>
        {draft.length === 0 && changed && <p>La lista necesita al menos una cédula para guardar.</p>}
      </form>}
    </div>}
    <p className="small">Los cambios de esta pantalla no eliminan asistentes ni los ocultan en la pantalla pública.</p>
  </section>;
}
