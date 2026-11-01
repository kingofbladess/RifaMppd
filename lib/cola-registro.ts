// Cola de registros en el teléfono (IndexedDB) para cuando la laptop se queda sin internet.
// El registro se guarda aquí con su foto y se envía solo cuando vuelve la conexión, con el mismo código
// (request_id), así que reenviarlo nunca duplica. El número de rifa lo da Supabase: llega al enviarse.
// Sobrevive a recargar la página y a cerrar el navegador. Solo se usa en el navegador.

export type Pendiente = {
  id: string;                       // request_id del registro
  name: string;
  doc: string;
  fields: Record<string, string>;
  photo: Blob;
  idPhoto: Blob | null;
  photoSource: "api" | "camera";
  at: number;                       // cuándo se puso en cola
  status: "pendiente" | "error" | "enviado";
  error?: string;
  number?: number;                  // número de rifa, cuando ya se envió
  sentAt?: number;                  // cuándo se envió (a los 60 s desaparece de la lista)
};

const DB = "rifa-cola", STORE = "registros";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const colaDisponible = () => typeof indexedDB !== "undefined";
export const listarCola = () => tx<Pendiente[]>("readonly", (s) => s.getAll() as IDBRequest<Pendiente[]>)
  .then((l) => l.sort((a, b) => a.at - b.at));
export const guardarEnCola = (p: Pendiente) => tx("readwrite", (s) => s.put(p));
export const quitarDeCola = (id: string) => tx("readwrite", (s) => s.delete(id));

// Mismo formulario que el guardado normal.
export function formularioRegistro(p: Pick<Pendiente, "id" | "fields" | "photo" | "idPhoto" | "photoSource">): FormData {
  const fd = new FormData();
  Object.entries(p.fields).forEach(([k, v]) => fd.set(k, v));
  fd.set("photo", p.photo, "foto.jpg");
  fd.set("photo_source", p.photoSource);
  if (p.idPhoto) fd.set("id_document", p.idPhoto, "documento.jpg");
  fd.set("request_id", p.id);
  return fd;
}

export type Envio =
  | { ok: true; number: number; name: string }
  | { ok: false; reintentar: boolean; error: string };

// Envía un registro. reintentar = true cuando falló la red (o la laptop no llega a Supabase): vale la pena
// intentarlo más tarde. false = respuesta clara del servidor (ya inscrita, datos inválidos, rifa llena...).
export async function enviarRegistro(fd: FormData): Promise<Envio> {
  let r: Response;
  try {
    r = await fetch("/api/register", { method: "POST", body: fd, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    const timeout = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError";
    return { ok: false, reintentar: true, error: timeout ? "El servidor no respondió" : "Sin conexión con el servidor" };
  }
  const j = (await r.json().catch(() => null)) as { error?: string; number?: number; name?: string } | null;
  if (r.ok && j?.number !== undefined) return { ok: true, number: j.number, name: j.name ?? "" };
  // 502/503/504 o una respuesta que no es JSON (página de error de un proxy): problema de red, no del registro.
  const reintentar = !j || r.status === 502 || r.status === 503 || r.status === 504;
  return { ok: false, reintentar, error: j?.error ?? `El servidor respondió ${r.status}` };
}
