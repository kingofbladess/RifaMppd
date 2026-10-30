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

// La foto puede venir como base64, data URL o URL. Se devuelve siempre como data URL.
async function toDataUrl(ref: string, headers: Record<string, string>): Promise<string | null> {
  if (!ref) return null;
  if (ref.startsWith("data:image/")) return ref;
  if (/^https?:\/\//.test(ref)) {
    const r = await fetch(ref, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") ?? "image/jpeg";
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(ref) && ref.length > 100) {
    const b64 = ref.replace(/\s/g, "");
    const type = b64.startsWith("iVBOR") ? "image/png" : "image/jpeg";
    return `data:${type};base64,${b64}`;
  }
  return null;
}

export async function lookupPerson(doc: string): Promise<LookupResult> {
  const url = process.env.PERSON_API_URL;
  if (!url) return demoLookup(doc);

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

function demoLookup(doc: string): LookupResult {
  const last = Number(doc.at(-1));
  if (last === 0) return { found: false, source: "demo", person: null, photo: null, photoDate: null };
  const seed = [...doc].reduce((a, c) => a + Number(c || 0), 0);
  const year = 1960 + (seed % 40);
  return {
    found: true, source: "demo",
    person: {
      full_name: DEMO_NAMES[seed % DEMO_NAMES.length], document_type: "CC", document_number: doc,
      birth_date: `${year}-0${(seed % 9) + 1}-1${seed % 9}`, city: "Bogotá",
      rank: ["Coordinador", "Auxiliar administrativo", "Jefe de área", "Analista", "Supervisor"][seed % 5], phone: "", email: "",
    },
    photo: last % 2 === 0 ? demoPhoto(seed) : null,
    photoDate: last % 2 === 0 ? `${2010 + (seed % 10)}-06-01` : null,
  };
}
