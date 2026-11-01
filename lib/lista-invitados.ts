// Lectura del archivo de la lista de invitados (Excel .xlsx o CSV), sin librerías externas.
// Columnas esperadas: cédula, nombre completo y grado. Se reconocen por el encabezado; si no hay encabezado
// se toman en ese orden (A = cédula, B = nombre, C = grado).
import { inflateRawSync } from "node:zlib";

export type Invitado = { doc: string; name: string | null; rank: string | null };
export type LecturaLista = { invitados: Invitado[]; omitidas: number; repetidas: number };

// La cédula se guarda solo con números (igual que en participants.document_number): "V-12.345.678" → "12345678".
export function limpiarCedula(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  // Excel a veces guarda la cédula como número con notación científica (1.2345678E7) o con decimales (12345678.0).
  if (/^\d+(\.\d+)?(e\+?\d+)?$/i.test(s)) s = Number(s).toFixed(0);
  return s.replace(/\D/g, "");
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------- Excel (.xlsx = zip con XML adentro) ----------
function leerZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  // Fin del directorio central: firma 0x06054b50 cerca del final del archivo.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("el archivo no es un Excel .xlsx válido");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, inflateRawSync(raw));
  }
  return files;
}

const xmlText = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, "&");
// Texto de un <si> o <is>: puede venir en varios trozos <t> (texto con formato).
const textos = (s: string) => [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join("");

// Índice de columna a partir de la referencia de celda: "C12" → 2.
function columna(ref: string): number {
  const letras = ref.replace(/\d+$/, "").toUpperCase();
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function filasXlsx(buf: Buffer): string[][] {
  const files = leerZip(buf);
  const get = (name: string) => files.get(name)?.toString("utf8");
  const shared = [...(get("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  // Primera hoja del libro (en el orden en que aparece en Excel).
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = get("xl/workbook.xml"), rels = get("xl/_rels/workbook.xml.rels");
  const firstRid = wb?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (firstRid && rels) {
    const target = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0])
      .find((r) => r.includes(`Id="${firstRid}"`))?.match(/Target="([^"]+)"/)?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = get(sheetPath) ?? [...files.keys()].filter((k) => k.startsWith("xl/worksheets/")).map(get).find(Boolean);
  if (!sheet) throw new Error("el Excel no tiene hojas");
  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const out: string[] = [];
    let next = 0;
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1];
      const col = ref ? columna(ref) : next;
      next = col + 1;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = "";
      if (type === "s") val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = textos(body);
      else if (v !== undefined) val = xmlText(v);
      out[col] = val.trim();
    }
    rows.push(Array.from(out, (x) => x ?? ""));
  }
  return rows;
}

// ---------- CSV (separado por coma, punto y coma o tabulador; con comillas) ----------
function filasCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

// ---------- De filas a invitados ----------
export function leerListaInvitados(buf: Buffer, fileName: string): LecturaLista {
  const name = fileName.toLowerCase();
  const isZip = buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
  if (name.endsWith(".xls") && !isZip) throw new Error("es un Excel antiguo (.xls). Ábrelo en Excel y usa Guardar como → Libro de Excel (.xlsx)");
  if (name.endsWith(".pdf") || buf.subarray(0, 4).toString() === "%PDF") throw new Error("los PDF no se pueden leer. Envía la lista en Excel (.xlsx) o CSV");
  const rows = isZip ? filasXlsx(buf) : filasCsv(buf.toString("utf8"));

  // Encabezado: la primera fila (de las 10 primeras) que tenga una columna de cédula.
  let header = -1, cDoc = 0, cName = 1, cRank = 2;
  for (let i = 0; i < Math.min(rows.length, 10) && header < 0; i++) {
    const cols = rows[i].map(sinAcentos);
    const d = cols.findIndex((c) => /^(cedula|c\.?\s?i\.?|ci|documento|n(ro|umero)?\.? ?(de )?cedula|cedula de identidad)\b/.test(c) || c.includes("cedula"));
    if (d < 0) continue;
    header = i; cDoc = d;
    const n = cols.findIndex((c) => c.includes("nombre") || c.includes("apellido"));
    const r = cols.findIndex((c) => /grado|rango|jerarquia|cargo/.test(c));
    cName = n >= 0 ? n : -1; cRank = r >= 0 ? r : -1;
  }

  const byDoc = new Map<string, Invitado>();
  let omitidas = 0, repetidas = 0;
  rows.slice(header + 1).forEach((r) => {
    if (!r.some((c) => c)) return; // fila vacía
    const doc = limpiarCedula(r[cDoc]);
    if (doc.length < 4 || doc.length > 15) { omitidas++; return; }
    if (byDoc.has(doc)) { repetidas++; return; }
    const txt = (i: number) => (i >= 0 && r[i]?.trim() ? r[i].trim().slice(0, 120) : null);
    byDoc.set(doc, { doc, name: txt(cName), rank: txt(cRank) });
  });
  return { invitados: [...byDoc.values()], omitidas, repetidas };
}
