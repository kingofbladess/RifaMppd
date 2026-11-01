"use client";

import { useMemo, useRef, useState } from "react";
import { normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { parseRaffleCsv, reviewRaffleColumn } from "@/lib/raffle-import";

type Registered = { id: string; document_number: string; full_name: string };
type Sheet = { sheet: string; data: unknown[][] };

export default function RaffleEligibilityImport({ raffleId, savedDocuments, registered, disabled }: {
  raffleId: string; savedDocuments: string[]; registered: Registered[]; disabled: boolean;
}) {
  const [manual, setManual] = useState(savedDocuments.join("\n"));
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheet, setSheet] = useState(0);
  const [column, setColumn] = useState(0);
  const [header, setHeader] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const rows = sheets[sheet]?.data;
  const review = useMemo(() => reviewRaffleColumn(rows ?? manual.split(/[\r\n,;]+/).map((v) => [v]), rows ? column : 0, rows ? header : false), [rows, manual, column, header]);
  const selected = new Set(review.documents);
  const matched = registered.filter((p) => selected.has(normalizeRaffleDocument(p.document_number) ?? ""));
  const registeredDocs = new Set(registered.map((p) => normalizeRaffleDocument(p.document_number)));
  const absent = review.documents.filter((doc) => !registeredDocs.has(doc));
  const outside = registered.filter((p) => !selected.has(normalizeRaffleDocument(p.document_number) ?? ""));
  const maxColumns = rows ? Math.max(0, ...rows.slice(0, 100).map((row) => row.length)) : 0;

  function chooseSheet(index: number, data = sheets) {
    setSheet(index);
    const first = data[index]?.data[0] ?? [];
    const inferred = first.findIndex((cell) => /cedula|documento|document number/.test(String(cell ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
    setColumn(Math.max(0, inferred));
    setHeader(inferred >= 0);
  }

  async function importFile(file?: File) {
    if (!file) return;
    const id = ++sequence.current;
    setError(""); setLoading(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MB");
      let result: Sheet[];
      if (/\.csv$/i.test(file.name)) result = [{ sheet: file.name, data: parseRaffleCsv(await file.text()) }];
      else if (/\.xlsx$/i.test(file.name)) {
        const { default: readExcel } = await import("read-excel-file/browser");
        result = await readExcel(file);
      } else throw new Error("Usa Excel .xlsx o CSV. Si tienes .xls, guárdalo como .xlsx antes de importarlo.");
      if (!result.length || result.some((s) => s.data.length > 20000)) throw new Error("Archivo vacío o con más de 20000 filas por hoja");
      if (sequence.current !== id) return;
      setSheets(result); chooseSheet(0, result);
    } catch (e) { if (sequence.current === id) setError((e as Error).message); }
    finally { if (sequence.current === id) setLoading(false); }
  }

  return <form className="card" method="post" action="/api/admin/eligibility" style={{ marginTop: 16 }}>
    <h2>Importar y cruzar la lista</h2>
    <label htmlFor="roster-file">Archivo Excel (.xlsx) o CSV</label>
    <input id="roster-file" type="file" accept=".xlsx,.csv" disabled={loading} onChange={(e) => void importFile(e.target.files?.[0])}/>
    {loading && <p role="status">Leyendo archivo…</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {rows && <div style={{ marginTop: 12 }}>
      <label htmlFor="sheet">Hoja</label>
      <select id="sheet" value={sheet} onChange={(e) => chooseSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={i} value={i}>{s.sheet}</option>)}</select>
      <label><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)}/> La primera fila contiene encabezados</label>
      <label htmlFor="document-column">Columna de cédula</label>
      <select id="document-column" value={column} onChange={(e) => setColumn(Number(e.target.value))}>{Array.from({ length: maxColumns }, (_, i) => <option key={i} value={i}>Columna {i + 1}{header ? ` · ${String(rows[0]?.[i] ?? "")}` : ""}</option>)}</select>
      <p className="small">Primeras cédulas válidas: {review.documents.slice(0, 5).join(", ") || "ninguna"}.</p>
      <button className="btn secondary" type="button" onClick={() => { setManual(review.documents.join("\n")); setSheets([]); }}>Pasar cédulas válidas a entrada manual</button>
    </div>}
    {!rows && <>
      <label htmlFor="manual-documents">Entrada manual (una cédula por línea, sin nombres)</label>
      <textarea id="manual-documents" rows={12} maxLength={250000} value={manual} onChange={(e) => { setManual(e.target.value); setError(""); }} style={{ width: "100%" }}/>
    </>}
    <input type="hidden" name="raffle_id" value={raffleId}/>
    <input type="hidden" name="documents" value={review.documents.join("\n")}/>
    <p role="status">{review.documents.length} cédulas únicas · {review.duplicates} duplicadas · {review.invalid.length} inválidas.</p>
    {review.invalid.length > 0 && <p className="error">Revisa las filas {review.invalid.slice(0, 20).join(", ")}{review.invalid.length > 20 ? "…" : ""}. No se puede guardar mientras haya cédulas inválidas.</p>}
    {review.documents.length > 10000 && <p className="error">La lista admite hasta 10000 cédulas.</p>}
    <h3>Cruce con los asistentes registrados</h3>
    <p>{matched.length} registrados en la lista · {absent.length} de la lista aún sin registrar · {outside.length} asistentes fuera de la lista.</p>
    <details><summary>En la lista y registrados ({matched.length})</summary><ul>{matched.map((p) => <li key={p.id}>{p.full_name} · {p.document_number}</li>)}</ul></details>
    <details><summary>En la lista, pendientes por registrar ({absent.length})</summary><p style={{ overflowWrap: "anywhere" }}>{absent.join(", ")}</p></details>
    <details><summary>Registrados fuera de la lista ({outside.length})</summary><ul>{outside.map((p) => <li key={p.id}>{p.full_name} · {p.document_number}</li>)}</ul></details>
    <p className="small">El cruce se hace por cédula, no por similitud de nombres. Los nuevos registros se cruzan automáticamente con la lista guardada al sortear.</p>
    <p className="small">Guardar reemplaza la lista completa de esta rifa. No elimina asistentes ni cambia ganadores anteriores.</p>
    <button className="btn" type="submit" disabled={disabled || loading || !!error || review.invalid.length > 0 || review.documents.length === 0 || review.documents.length > 10000}>Guardar lista revisada</button>
  </form>;
}
