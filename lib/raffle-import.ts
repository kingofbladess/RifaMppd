import { normalizeRaffleDocument } from "./raffle-eligibility";

// CSV con comillas, separadores regionales y saltos de línea dentro de una celda.
export function parseRaffleCsv(text: string): string[][] {
  if (text.length > 2_000_000) throw new Error("El CSV supera 2 MB");
  text = text.replace(/^\uFEFF/, "");
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === "\r" || ch === "\n") break;
      if (counts.has(ch)) counts.set(ch, counts.get(ch)! + 1);
    }
  }
  const delimiter = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (ch === delimiter || ch === "\n" || ch === "\r")) {
      row.push(cell); cell = "";
      if (ch !== delimiter) {
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        if (ch === "\r" && text[i + 1] === "\n") i++;
      }
    } else cell += ch;
  }
  if (quoted) throw new Error("El CSV contiene comillas sin cerrar");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.length > 20000) throw new Error("El archivo supera 20000 filas");
  return rows;
}

export function reviewRaffleColumn(rows: unknown[][], column: number, header: boolean) {
  const documents = new Set<string>();
  const invalid: number[] = [];
  let duplicates = 0;
  rows.slice(header ? 1 : 0).forEach((row, i) => {
    const value = row[column];
    if (value === null || value === undefined || String(value).trim() === "") {
      if (row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")) invalid.push(i + (header ? 2 : 1));
      return;
    }
    const doc = typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value))
      ? normalizeRaffleDocument(String(value)) : null;
    if (!doc) invalid.push(i + (header ? 2 : 1));
    else if (documents.has(doc)) duplicates++;
    else documents.add(doc);
  });
  return { documents: [...documents], invalid, duplicates };
}
