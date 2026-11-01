"use client";

import { useMemo, useState } from "react";

type Fila = { cedula: string; nombre: string; grado: string | null; estado: string };
const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Lista guardada de cadetes: buscar, quitar una cédula o agregar un cadete a mano.
export default function CadetesLista({ filas }: { filas: Fila[] }) {
  const [q, setQ] = useState("");
  const visibles = useMemo(() => {
    const t = plano(q.trim()).replace(/[.\s-]/g, "");
    return t ? filas.filter((f) => plano(`${f.cedula}${f.nombre}`).replace(/[.\s-]/g, "").includes(t)) : filas;
  }, [filas, q]);
  return <div className="card" style={{ marginTop: 16 }}>
    <h2>Lista de cadetes guardada ({filas.length})</h2>
    <form method="post" action="/api/admin/cadetes/editar" className="list-module-search" style={{ alignItems: "end" }}>
      <input type="hidden" name="accion" value="agregar" />
      <div><label htmlFor="add-ced">Cédula</label><input id="add-ced" name="cedula" required placeholder="V-12.345.678" /></div>
      <div><label htmlFor="add-nom">Nombre completo</label><input id="add-nom" name="nombre" required minLength={3} /></div>
      <div><label htmlFor="add-gra">Grado</label><input id="add-gra" name="grado" /></div>
      <button className="btn secondary" type="submit">Agregar cadete</button>
    </form>
    <label htmlFor="cad-buscar" style={{ marginTop: 12 }}>Buscar por cédula o nombre</label>
    <input id="cad-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej. 30828607 o Nava" />
    <p className="small">{visibles.length} de {filas.length}.</p>
    <div className="table-wrap"><table className="list-module-table">
      <thead><tr><th>Cédula</th><th>Nombre</th><th>Grado</th><th>Estado</th><th></th></tr></thead>
      <tbody>{visibles.slice(0, 300).map((f) => <tr key={f.cedula}>
        <td>{f.cedula}</td><td>{f.nombre}</td><td>{f.grado ?? "—"}</td><td>{f.estado}</td>
        <td><form method="post" action="/api/admin/cadetes/editar"
          onSubmit={(e) => { if (!confirm(`¿Quitar a ${f.nombre} (${f.cedula}) de la lista de cadetes?`)) e.preventDefault(); }}>
          <input type="hidden" name="accion" value="quitar" /><input type="hidden" name="cedula" value={f.cedula} />
          <button className="btn secondary danger" type="submit">Quitar</button>
        </form></td>
      </tr>)}</tbody>
    </table></div>
    {visibles.length > 300 && <p className="small">Mostrando 300; usa el buscador para encontrar a alguien.</p>}
    <p className="small">Quitar a alguien de esta lista no borra su registro: solo deja de salir en la ruleta de cadetes.</p>
  </div>;
}
