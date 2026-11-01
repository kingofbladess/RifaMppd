"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { registrationBatch, registerImportedList, type ImportRegistration } from "@/lib/register-imported-list";
import { normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { parseRaffleCsv, reviewRaffleColumn } from "@/lib/raffle-import";

type Registered = { id: string; document_number: string; full_name: string };
type Sheet = { sheet: string; data: unknown[][] };

export default function RaffleEligibilityImport({ raffleId, savedDocuments, registered, disabled }: {
  raffleId: string; savedDocuments: string[]; registered: Registered[]; disabled: boolean;
}) {
  const [manual, setManual] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheet, setSheet] = useState(0);
  const [column, setColumn] = useState(0);
  const [header, setHeader] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const [registering, setRegistering] = useState(false);
  const [results, setResults] = useState<ImportRegistration[]>([]);
  const [saved, setSaved] = useState(false);
  const [processTotal, setProcessTotal] = useState(0);
  const [nat, setNat] = useState<"V" | "E">("V");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const rows = sheets[sheet]?.data;
  const review = useMemo(() => reviewRaffleColumn(rows ?? manual.split(/[\r\n,;]+/).map((v) => [v]), rows ? column : 0, rows ? header : false), [rows, manual, column, header]);
  const completeDocuments = [...new Set([...savedDocuments, ...review.documents])];
  const selected = new Set(completeDocuments);
  const matched = registered.filter((p) => selected.has(normalizeRaffleDocument(p.document_number) ?? ""));
  const registeredDocs = new Set(registered.map((p) => normalizeRaffleDocument(p.document_number)));
  const inputBatch = registrationBatch(review.documents);
  const pendingBatch = registrationBatch(savedDocuments, new Set([...registeredDocs].filter((doc): doc is string => doc !== null)));
  const absent = completeDocuments.filter((doc) => !registeredDocs.has(doc));
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

  async function saveAndRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (controller.current || disabled) return;
    const form = new FormData(event.currentTarget);
    const abort = new AbortController();
    controller.current = abort;
    setRegistering(true); setError(""); setResults([]); setSaved(false); setProcessTotal(inputBatch.length);
    try {
      const response = await fetch("/api/admin/eligibility", { method: "POST", body: form,
        headers: { Accept: "application/json" }, signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar la lista");
      setSaved(true);
      await registerImportedList(inputBatch, raffleId, nat, abort.signal, setResults);
    } catch (e) {
      setError(abort.signal.aborted ? "Proceso detenido. Los registros confirmados se conservan y puedes reintentar sin duplicarlos." : (e as Error).message);
    } finally { controller.current = null; setRegistering(false); }
  }

  async function completeSaved() {
    if (controller.current || disabled || !pendingBatch.length) return;
    const abort = new AbortController(); controller.current = abort;
    setRegistering(true); setError(""); setResults([]); setSaved(true); setProcessTotal(pendingBatch.length);
    try { await registerImportedList(pendingBatch, raffleId, nat, abort.signal, setResults); }
    finally { controller.current = null; setRegistering(false); }
  }

  return <form className="card" method="post" action="/api/admin/eligibility" onSubmit={saveAndRegister} style={{ marginTop: 16 }}>
    <h2>Importar y registrar participantes</h2>
    <p>Al guardar se añaden las cédulas a la lista y se registran automáticamente las personas nuevas consultando Infopress/API. Solo se procesan las cédulas de esta entrada o archivo; no se vuelve a recorrer la lista anterior. Quienes ya están registrados no se duplican.</p>
    <fieldset disabled={registering} style={{ border: 0, padding: 0, margin: 0 }}>
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
    <label htmlFor="import-nationality">Nacionalidad para las consultas de personas nuevas</label>
    <select id="import-nationality" value={nat} onChange={(e) => setNat(e.target.value as "V" | "E")}><option value="V">Venezolana (V)</option><option value="E">Extranjera (E)</option></select>
    <input type="hidden" name="mode" value="append"/>
    <input type="hidden" name="raffle_id" value={raffleId}/>
    <input type="hidden" name="documents" value={review.documents.join("\n")}/>
    <p role="status">{review.documents.length} cédulas únicas · {review.duplicates} duplicadas · {review.invalid.length} inválidas.</p>
    {review.invalid.length > 0 && <p className="error">Revisa las filas {review.invalid.slice(0, 20).join(", ")}{review.invalid.length > 20 ? "…" : ""}. No se puede guardar mientras haya cédulas inválidas.</p>}
    <p className="small">La lista actual conserva sus {savedDocuments.length} integrantes y quedará con {completeDocuments.length} cédulas únicas después de añadir.</p>
    {completeDocuments.length > 10000 && <p className="error">La lista admite hasta 10000 cédulas.</p>}
    <h3>Cruce con los asistentes registrados</h3>
    <p>{matched.length} registrados en la lista · {absent.length} de la lista aún sin registrar · {outside.length} asistentes fuera de la lista.</p>
    <details><summary>En la lista y registrados ({matched.length})</summary><ul>{matched.map((p) => <li key={p.id}>{p.full_name} · {p.document_number}</li>)}</ul></details>
    <details><summary>En la lista, pendientes por registrar ({absent.length})</summary><p style={{ overflowWrap: "anywhere" }}>{absent.join(", ")}</p></details>
    <details><summary>Registrados fuera de la lista ({outside.length})</summary><ul>{outside.map((p) => <li key={p.id}>{p.full_name} · {p.document_number}</li>)}</ul></details>
    <p className="small">El cruce se hace por cédula, no por similitud de nombres. Los nuevos registros se cruzan automáticamente con la lista guardada al sortear.</p>
    <p className="small">Las cédulas nuevas se añaden a la lista existente. Las repetidas se omiten; ningún integrante se elimina.</p>
    <button className="btn" type="submit" disabled={disabled || loading || !!error || review.invalid.length > 0 || review.documents.length === 0 || completeDocuments.length > 10000}>Guardar lista y registrar personas</button>
    {savedDocuments.length > 0 && <button className="btn secondary" type="button" disabled={disabled || loading || pendingBatch.length === 0} onClick={() => void completeSaved()}>Completar registros pendientes ({pendingBatch.length})</button>}
    </fieldset>
    {registering && <p role="status">Registrando: {results.length} de {processTotal} cédulas revisadas. Mantén esta pantalla abierta.</p>}
    {registering && <button className="btn secondary" type="button" onClick={() => controller.current?.abort()}>Detener proceso</button>}
    {saved && !registering && <p role="status">Lista guardada. {results.filter((r) => r.status === "registered").length} registros nuevos · {results.filter((r) => r.status === "existing").length} ya registrados · {results.filter((r) => r.status === "error").length} casos sin completar{results.length < processTotal ? ` · ${processTotal - results.length} sin procesar` : ""}.</p>}
    {results.some((r) => r.status === "error") && <details open><summary>Casos que requieren revisión</summary><ul>{results.filter((r) => r.status === "error").map((r) => <li key={r.doc}>{r.doc}: {r.error}</li>)}</ul></details>}
    {saved && !registering && <a className="btn secondary" href="/admin/rifa">Ver lista y registros actualizados</a>}
  </form>;
}
