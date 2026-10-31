import "server-only";

// Adaptador para la API externa que entrega datos y foto de una persona por número de cédula.
// Cuando tengamos la documentación real, solo hay que ajustar fetchPerson() y mapPerson().

export type Person = {
  full_name: string;
  document_type: string;
  document_number: string;
  birth_date: string; // YYYY-MM-DD o ""
  city: string;
  rank: string;   // rango o cargo administrativo
  phone: string;
  email: string;
};

export type LookupResult = {
  found: boolean;
  source: "api" | "demo";
  person: Person | null;
  photo: string | null;      // data URL (se descarga en el servidor para evitar CORS y no exponer el token)
  photoDate: string | null;  // fecha de la foto si la API la informa (para saber si es vieja)
  photoPending?: boolean;    // Infopress aún prepara la foto: el navegador la vuelve a pedir sin bloquear el formulario
};

const TIMEOUT_MS = 8000;

// Busca el primer campo presente entre varios nombres posibles (tolerante a cómo venga la API).
function pick(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = k.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], o);
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function normDate(s: string): string {
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

const title = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();

export function mapPerson(raw: Record<string, unknown>, doc: string): { person: Person; photoRef: string; photoDate: string } {
  const data = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
  const names = pick(data, ["nombres", "primer_nombre", "first_name", "given_names"]);
  const surnames = pick(data, ["apellidos", "primer_apellido", "last_name", "surnames"]);
  const full = pick(data, ["nombre_completo", "full_name", "nombre", "name"]) || `${names} ${surnames}`;
  return {
    person: {
      full_name: title(full),
      document_type: pick(data, ["tipo_documento", "document_type"]) || "CC",
      document_number: pick(data, ["numero_documento", "cedula", "documento", "document_number"]).replace(/\D/g, "") || doc,
      birth_date: normDate(pick(data, ["fecha_nacimiento", "birth_date", "fechaNacimiento"])),
      city: title(pick(data, ["ciudad", "municipio", "city", "lugar_nacimiento"])),
      rank: pick(data, ["rango", "cargo", "grado", "rank", "position", "puesto", "cargo_administrativo"]),
      phone: pick(data, ["telefono", "celular", "phone", "mobile"]),
      email: pick(data, ["correo", "email"]),
    },
    photoRef: pick(data, ["foto", "foto_base64", "photo", "photo_base64", "foto_url", "photo_url", "imagen"]),
    photoDate: normDate(pick(data, ["fecha_foto", "photo_date", "foto_fecha"])),
  };
}

// Tipo real de la imagen según sus primeros bytes (S3 a veces responde "binary/octet-stream").
// Solo se aceptan formatos que cualquier navegador muestra; JPEG 2000 u otros quedan fuera y se toma foto.
function sniffImage(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (b.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

// La foto puede venir como base64, data URL o URL. Se devuelve siempre como data URL.
async function toDataUrl(ref: string, headers: Record<string, string>): Promise<string | null> {
  if (!ref) return null;
  if (ref.startsWith("data:image/")) return ref;
  if (/^https?:\/\//.test(ref)) {
    const r = await fetch(ref, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const type = sniffImage(buf);
    if (!type) {
      console.warn(`foto de la API descartada: formato no compatible (${r.headers.get("content-type") ?? "sin tipo"}, ${buf.length} bytes)`);
      return null;
    }
    return `data:${type};base64,${buf.toString("base64")}`;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(ref) && ref.length > 100) {
    const b64 = ref.replace(/\s/g, "");
    const type = b64.startsWith("iVBOR") ? "image/png" : "image/jpeg";
    return `data:${type};base64,${b64}`;
  }
  return null;
}

export async function lookupPerson(doc: string, nat: "V" | "E" = "V"): Promise<LookupResult> {
  if (process.env.INFOPRESS_API_KEY) return infopressLookup(doc, nat);
  const url = process.env.PERSON_API_URL;
  if (!url) return demoLookup(doc, nat);
  // Infopress solo funciona con su clave; sin ella, el modo genérico recibe un rechazo y parece "no encontrado".
  if (/infopress/i.test(url)) throw new Error("falta INFOPRESS_API_KEY en .env.local");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.PERSON_API_TOKEN) headers.Authorization = `Bearer ${process.env.PERSON_API_TOKEN}`;

  const target = url.includes("{doc}") ? url.replace("{doc}", encodeURIComponent(doc)) : `${url}${url.includes("?") ? "&" : "?"}cedula=${encodeURIComponent(doc)}`;
  const r = await fetch(target, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (r.status === 404) return { found: false, source: "api", person: null, photo: null, photoDate: null };
  if (!r.ok) throw new Error(`API de personas respondió ${r.status}`);

  const raw = (await r.json()) as Record<string, unknown>;
  const { person, photoRef, photoDate } = mapPerson(raw, doc);
  if (!person.full_name) return { found: false, source: "api", person: null, photo: null, photoDate: null };
  const photo = await toDataUrl(photoRef, headers).catch(() => null);
  return { found: true, source: "api", person, photo, photoDate: photoDate || null };
}

// ---------- Infopress (SAIME / IPSFA / Resoluciones) ----------
// Solo se alcanza dentro de la red local (192.168.150.30 con los nombres en el archivo hosts), así que esta
// consulta funciona cuando la app corre en una laptop de esa red, no desde Vercel. Las fotos llegan como
// enlaces S3 privados: el servidor las descarga y las entrega como data URL, igual que con la API genérica.
const INFOPRESS_TIMEOUT_MS = 125_000;           // Infopress puede tardar hasta 110 s consultando a los proveedores

type Source = { status?: string; data?: Record<string, unknown> | null };
type InfopressPhoto = { source?: string; status?: string; url?: string };
type InfopressResponse = { sources?: Record<string, Source | undefined>; photos?: InfopressPhoto[]; error?: string };

// IPSFA conserva los tipos del proveedor: un grado puede venir como texto o como objeto con su descripción.
function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["descripcion", "nombre", "abreviatura", "valor", "value"]) if (o[k] !== undefined) return text(o[k]);
  }
  return "";
}

async function infopressFetch(cedula: string): Promise<{ status: number; body: InfopressResponse }> {
  const base = process.env.INFOPRESS_BASE_URL || "https://infopress.sidefensa.nexus.ia.ve";
  const r = await fetch(new URL(`/v1/consulta/${encodeURIComponent(cedula)}`, base), {
    headers: { Accept: "application/json", "X-API-Key": process.env.INFOPRESS_API_KEY! },
    signal: AbortSignal.timeout(INFOPRESS_TIMEOUT_MS), redirect: "error", cache: "no-store",
  });
  const body = (await r.json().catch(() => ({}))) as InfopressResponse;
  if (r.status === 200 || r.status === 404) return { status: r.status, body };
  const reqId = r.headers.get("x-request-id");
  const why: Record<number, string> = {
    400: "cédula inválida", 401: "API key de Infopress inválida o vencida",
    429: `límite de consultas alcanzado, espera ${r.headers.get("retry-after") ?? "unos"} s`,
    503: "Infopress no disponible por ahora",
  };
  throw new Error(`Infopress: ${why[r.status] ?? `respondió ${r.status}`}${reqId ? ` (request ${reqId})` : ""}`);
}

const found = (s: Source | undefined) => (s?.status === "found" && s.data ? s.data : null);

function mapInfopress(body: InfopressResponse, doc: string, nat: "V" | "E"): Person | null {
  const saime = found(body.sources?.saime);
  const ipsfa = found(body.sources?.ipsfa);
  const reso = found(body.sources?.resoluciones);
  const id = (Array.isArray(saime?.identity) ? saime.identity[0] : undefined) as Record<string, unknown> | undefined;
  const basico = ((ipsfa?.Persona as Record<string, unknown> | undefined)?.DatoBasico ?? undefined) as Record<string, unknown> | undefined;

  const fromSaime = id ? [id.firstName, id.secondName, id.firstSurname, id.secondSurname].map(text) : [];
  const fromIpsfa = basico ? [basico.nombreprimero, basico.nombresegundo, basico.apellidoprimero, basico.apellidosegundo].map(text) : [];
  const full = (fromSaime.some(Boolean) ? fromSaime : fromIpsfa).filter(Boolean).join(" ");
  if (!full) return null;

  // Grado: primero IPSFA (la fuente oficial del cargo); si no, el contexto de Resoluciones.
  const rank = text(basico?.Grado ?? ipsfa?.Grado) || text(reso?.grado);
  return {
    full_name: title(full),
    document_type: nat,
    document_number: doc,
    birth_date: normDate(text(id?.birthDate) || text(basico?.fechanacimiento)),
    city: "", rank, phone: "", email: "",
  };
}

async function infopressLookup(doc: string, nat: "V" | "E"): Promise<LookupResult> {
  const cedula = `${nat}${doc}`;
  const { status, body } = await infopressFetch(cedula);
  const none: LookupResult = { found: false, source: "api", person: null, photo: null, photoDate: null };
  if (status === 404) return none;
  const person = mapInfopress(body, doc, nat);
  if (!person) return none;

  // La foto lista se descarga de una vez; si está "pending" se responde ya con los datos y el navegador
  // la vuelve a pedir en segundo plano, para que el operador no espere sin ver nada.
  const ready = ["saime", "ipsfa"].map((src) => body.photos?.find((p) => p.source === src && p.status === "ready" && p.url)).find(Boolean);
  // El enlace S3 firmado se usa tal cual (con todos sus parámetros X-Amz-*) y sin la API key.
  const photo = ready?.url ? await toDataUrl(ready.url, {}).catch(() => null) : null;
  const photoPending = !photo && !!body.photos?.some((p) => p.status === "pending");
  return { found: true, source: "api", person, photo, photoDate: null, photoPending };
}

// ---------- Modo demo (sin PERSON_API_URL) ----------
// Cédulas que terminan en 0: "no encontrada". En número par: con foto. En impar: sin foto.
const DEMO_NAMES = ["Ana María Pérez Gómez", "Luis Fernando Rojas Díaz", "Camila Andrea Torres Ruiz", "Jorge Iván Castro Mejía",
  "Valentina Herrera López", "Santiago Moreno Vargas", "Daniela Ortiz Silva", "Andrés Felipe Ramírez", "Laura Jiménez Mendoza"];

function demoPhoto(seed: number): string {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600">
<rect width="480" height="600" fill="hsl(${hue},45%,82%)"/><circle cx="240" cy="230" r="110" fill="hsl(${hue},30%,96%)"/>
<rect x="70" y="370" width="340" height="260" rx="170" fill="hsl(${hue},30%,96%)"/>
<text x="240" y="580" font-family="sans-serif" font-size="28" text-anchor="middle" fill="hsl(${hue},40%,35%)">FOTO DEMO</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function demoLookup(doc: string, nat: "V" | "E"): LookupResult {
  const last = Number(doc.at(-1));
  if (last === 0) return { found: false, source: "demo", person: null, photo: null, photoDate: null };
  const seed = [...doc].reduce((a, c) => a + Number(c || 0), 0);
  const year = 1960 + (seed % 40);
  return {
    found: true, source: "demo",
    person: {
      full_name: DEMO_NAMES[seed % DEMO_NAMES.length], document_type: nat, document_number: doc,
      birth_date: `${year}-0${(seed % 9) + 1}-1${seed % 9}`, city: "Bogotá",
      rank: ["Coordinador", "Auxiliar administrativo", "Jefe de área", "Analista", "Supervisor"][seed % 5], phone: "", email: "",
    },
    photo: last % 2 === 0 ? demoPhoto(seed) : null,
    photoDate: last % 2 === 0 ? `${2010 + (seed % 10)}-06-01` : null,
  };
}
