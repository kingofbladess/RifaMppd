"use client";

import { useMemo, useRef, useState } from "react";
import { parseRaffleCsv } from "@/lib/raffle-import";
import { detectarColumnas, revisarCadetes, MAX_CADETES, type Columnas } from "@/lib/cadetes";

type Sheet = { sheet: string; data: unknown[][] };

// Carga la lista de cadetes desde Excel (.xlsx) o CSV: detecta las columnas, muestra una vista previa y la guarda.
export default function CadetesImport() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheet, setSheet] = useState(0);
  const [cols, setCols] = useState<Columnas>({ cedula: 0, nombre: 1, grado: 2 });
  const [header, setHeader] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const [inicio, setInicio] = useState(0); // fila de títulos detectada (las de arriba se ignoran)
  const rows = useMemo(() => sheets[sheet]?.data.slice(inicio), [sheets, sheet, inicio]);
  const review = useMemo(() => rows ? revisarCadetes(rows, cols, header) : null, [rows, cols, header]);
  const maxColumns = rows ? Math.max(0, ...rows.slice(0, 100).map((r) => r.length)) : 0;

  function chooseSheet(i: number, data = sheets) {
    setSheet(i);
    const { columnas, encabezado, inicio } = detectarColumnas(data[i]?.data ?? []);
    setInicio(inicio); setCols(columnas); setHeader(encabezado);
  }

  async function importFile(file?: File) {
    if (!file) return;
    const id = ++seq.current;
    setError(""); setLoading(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MB");
      let result: Sheet[];
      if (/\.csv$/i.test(file.name)) result = [{ sheet: file.name, data: parseRaffleCsv(await file.text()) }];
      else if (/\.xlsx$/i.test(file.name)) {
        const { default: readExcel } = await import("read-excel-file/browser");
        result = await readExcel(file);
      } else throw new Error("Usa Excel .xlsx o CSV. Si tienes .xls, guárdalo como .xlsx antes de cargarlo.");
      if (!result.length || !result.some((s) => s.data.length)) throw new Error("El archivo está vacío");
      if (seq.current !== id) return;
      setSheets(result);
      // Si el libro trae una hoja de cadetes, se abre esa.
      chooseSheet(Math.max(0, result.findIndex((x) => /cadete/i.test(x.sheet))), result);
    } catch (e) { if (seq.current === id) setError((e as Error).message); }
    finally { if (seq.current === id) setLoading(false); }
  }

  const colSelect = (label: string, key: keyof Columnas, optional: boolean) => <div>
    <label htmlFor={`col-${key}`}>{label}</label>
    <select id={`col-${key}`} value={cols[key]} onChange={(e) => setCols((c) => ({ ...c, [key]: Number(e.target.value) }))}>
      {optional && <option value={-1}>(ninguna)</option>}
      {Array.from({ length: maxColumns }, (_, i) => <option key={i} value={i}>Columna {i + 1}{header && rows ? ` · ${String(rows[0]?.[i] ?? "")}` : ""}</option>)}
    </select>
  </div>;

  const tooMany = (review?.cadetes.length ?? 0) > MAX_CADETES;
  return <form className="card" method="post" action="/api/admin/cadetes" style={{ marginTop: 16 }}>
    <h2>Cargar lista de cadetes</h2>
    <p className="small">Excel (.xlsx) o CSV con las columnas cédula, nombre completo y grado. Guardar reemplaza la lista anterior de cadetes.</p>
    <label htmlFor="cadetes-file">Archivo</label>
    <input id="cadetes-file" type="file" accept=".xlsx,.csv" disabled={loading} onChange={(e) => void importFile(e.target.files?.[0])} />
    {loading && <p role="status">Leyendo archivo…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {rows && review && <>
      {sheets.length > 1 && <><label htmlFor="cad-sheet">Hoja</label>
        <select id="cad-sheet" value={sheet} onChange={(e) => chooseSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={i} value={i}>{s.sheet}</option>)}</select></>}
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={header} onChange={(e) => setHeader(e.target.checked)} /> La primera fila tiene los títulos</label>
      <div className="list-module-search">
        {colSelect("Columna de cédula", "cedula", false)}
        {colSelect("Columna de nombre", "nombre", false)}
        {colSelect("Columna de grado", "grado", true)}
      </div>
      <p role="status"><b>{review.cadetes.length} cadetes</b> · {review.repetidos} repetidos (se cuentan una vez) · {review.invalidas.length} filas inválidas.</p>
      {review.invalidas.length > 0 && <p className="error">Filas sin cédula válida o sin nombre: {review.invalidas.slice(0, 20).map((f) => f + inicio).join(", ")}{review.invalidas.length > 20 ? "…" : ""}. Corrígelas en el archivo o se dejarán fuera.</p>}
      {review.filasRepetidas.length > 0 && <p className="small">Filas con una cédula ya usada más arriba (se dejó la primera; revisa si es un error de tipeo): {review.filasRepetidas.slice(0, 20).map((f) => f + inicio).join(", ")}{review.filasRepetidas.length > 20 ? "…" : ""}.</p>}
      {tooMany && <p className="error">La lista admite hasta {MAX_CADETES} cadetes.</p>}
      <div className="table-wrap"><table className="list-module-table">
        <thead><tr><th>Cédula</th><th>Nombre</th><th>Grado</th></tr></thead>
        <tbody>{review.cadetes.slice(0, 10).map((c) => <tr key={c.cedula}><td>{c.cedula}</td><td>{c.nombre}</td><td>{c.grado ?? "—"}</td></tr>)}</tbody>
      </table></div>
      {review.cadetes.length > 10 && <p className="small">Vista previa: primeros 10 de {review.cadetes.length}.</p>}
      <input type="hidden" name="cadetes" value={JSON.stringify(review.cadetes)} />
    </>}
    <button className="btn" type="submit" disabled={loading || !review || !review.cadetes.length || tooMany} style={{ marginTop: 12 }}>Guardar lista de cadetes</button>
  </form>;
}
