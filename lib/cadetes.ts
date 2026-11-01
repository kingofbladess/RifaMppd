import { normalizeRaffleDocument } from "./raffle-eligibility";

// Ruleta de cadetes: una lista aparte (cédula, nombre, grado) que, con el modo "cadetes" activo,
// reemplaza a los inscritos en la ruleta y la TV. Todos tienen la misma probabilidad (sin regla por grado).
export type Cadete = { cedula: string; nombre: string; grado: string | null };
export type Modo = "normal" | "cadetes";
export const MAX_CADETES = 5000;

// En la ruleta cada cadete tiene id "cad-<cédula>": nunca choca con el id (uuid) de un inscrito.
const PREFIX = "cad-";
export const cadeteId = (cedula: string) => PREFIX + cedula;
export const cedulaDeId = (id: string) => (id.startsWith(PREFIX) ? id.slice(PREFIX.length) : null);

const plain = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

export type Columnas = { cedula: number; nombre: number; grado: number };

// Busca las columnas por el encabezado; sin encabezado reconocible: cédula, nombre, grado en ese orden.
export function detectarColumnas(primeraFila: unknown[]): { columnas: Columnas; encabezado: boolean } {
  const h = primeraFila.map(plain);
  const find = (re: RegExp) => h.findIndex((c) => re.test(c));
  const cedula = find(/cedula|documento|^c\.?\s?i\.?$|^ci$/);
  const nombre = find(/nombre|apellido/);
  const grado = find(/grado|jerarquia|rango/);
  if (cedula < 0 && nombre < 0) return { columnas: { cedula: 0, nombre: 1, grado: 2 }, encabezado: false };
  return { columnas: { cedula: Math.max(0, cedula), nombre: nombre < 0 ? -1 : nombre, grado }, encabezado: true };
}

const cedulaDe = (v: unknown) =>
  typeof v === "string" || (typeof v === "number" && Number.isSafeInteger(v)) ? normalizeRaffleDocument(String(v)) : null;

// Revisa las filas del Excel/CSV: cadetes válidos (sin repetir cédula), filas inválidas (número de fila) y repetidos.
export function revisarCadetes(rows: unknown[][], col: Columnas, encabezado: boolean) {
  const cadetes: Cadete[] = [];
  const vistos = new Set<string>();
  const invalidas: number[] = [];
  let repetidos = 0;
  rows.slice(encabezado ? 1 : 0).forEach((row, i) => {
    if (!row.some((c) => clean(c))) return; // fila vacía
    const fila = i + (encabezado ? 2 : 1);
    const cedula = cedulaDe(row[col.cedula]);
    const nombre = col.nombre >= 0 ? clean(row[col.nombre]).slice(0, 120) : "";
    if (!cedula || nombre.length < 3) { invalidas.push(fila); return; }
    if (vistos.has(cedula)) { repetidos++; return; }
    vistos.add(cedula);
    cadetes.push({ cedula, nombre, grado: col.grado >= 0 ? clean(row[col.grado]).slice(0, 80) || null : null });
  });
  return { cadetes, invalidas, repetidos };
}

// Validación del lado del servidor de lo que manda el formulario.
export function validarCadetes(input: unknown): Cadete[] {
  if (!Array.isArray(input) || !input.length) throw new Error("La lista de cadetes está vacía");
  if (input.length > MAX_CADETES) throw new Error(`La lista admite hasta ${MAX_CADETES} cadetes`);
  const out: Cadete[] = [];
  const vistos = new Set<string>();
  input.forEach((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const cedula = cedulaDe(o.cedula);
    const nombre = clean(o.nombre).slice(0, 120);
    if (!cedula || nombre.length < 3) throw new Error(`Cadete inválido en la posición ${i + 1}`);
    if (vistos.has(cedula)) return;
    vistos.add(cedula);
    out.push({ cedula, nombre, grado: clean(o.grado).slice(0, 80) || null });
  });
  return out;
}

// Ganador con probabilidad igual para todos. `azar(n)` devuelve un entero 0..n-1 (randomInt de crypto en el servidor).
export function elegirCadete<T>(pool: T[], azar: (n: number) => number): T | null {
  return pool.length ? pool[azar(pool.length)] : null;
}
