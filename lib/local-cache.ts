// Solo servidor (usa el disco). Sin "server-only" para poder usarse también desde instrumentation.ts.
import { mkdir, readFile, writeFile, rename, unlink } from "fs/promises";
import path from "path";

// Copia local (solo en la laptop, nunca en Vercel) de lo mínimo para seguir trabajando sin internet:
// los usuarios (con su contraseña ya cifrada) para poder iniciar sesión, y la rifa activa para abrir el registro.
// Se actualiza cada vez que Supabase responde; si Supabase no responde, se usa la última copia.
// Vive en .cache/ junto a la app (ignorado por git), así que sobrevive a reiniciar la laptop.
const DIR = path.join(process.cwd(), ".cache");
export const localCacheEnabled = () => !process.env.VERCEL;

const mem = new Map<string, unknown>();

// Escrituras en cola por archivo: cada consulta de cédula vuelve a guardar la rifa, y si dos escrituras
// iban a la vez con el mismo .tmp, la segunda ya no lo encontraba al renombrar (ENOENT en la terminal).
const queue = new Map<string, Promise<void>>();
const lastSaved = new Map<string, string>();
let seq = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function writeFileAtomic(file: string, json: string) {
  const tmp = `${file}.${process.pid}.${++seq}.tmp`; // nombre único por escritura
  await writeFile(tmp, json, { mode: 0o600 });
  for (let i = 0; ; i++) {
    try {
      await rename(tmp, file); // nunca queda un archivo a medio escribir
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      // En Windows el antivirus o el indexador pueden tener el archivo abierto un instante.
      if (i < 4 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) { await sleep(50 * (i + 1)); continue; }
      await unlink(tmp).catch(() => {});
      throw e;
    }
  }
}

export async function saveLocal(name: string, value: unknown) {
  if (!localCacheEnabled()) return;
  mem.set(name, value);
  const prev = queue.get(name) ?? Promise.resolve();
  const next = prev.then(async () => {
    const json = JSON.stringify(value ?? null);
    if (lastSaved.get(name) === json) return; // sin cambios: no se toca el disco
    try {
      await mkdir(DIR, { recursive: true });
      await writeFileAtomic(path.join(DIR, `${name}.json`), json);
      lastSaved.set(name, json);
    } catch (e) {
      console.warn(`no se pudo guardar la copia local ${name}: ${(e as Error).message}`);
    }
  });
  queue.set(name, next);
  await next;
  if (queue.get(name) === next) queue.delete(name);
}

export async function readLocal<T>(name: string): Promise<T | null> {
  if (!localCacheEnabled()) return null;
  if (mem.has(name)) return mem.get(name) as T;
  try {
    const v = JSON.parse(await readFile(path.join(DIR, `${name}.json`), "utf8")) as T;
    mem.set(name, v);
    return v;
  } catch {
    return null;
  }
}

// Error de red hacia Supabase (sin internet), a diferencia de un error de la base (tabla, clave, datos).
const NET_ERR = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONN|ETIMEDOUT|UND_ERR|network|socket/i;
export const isNetErr = (e: unknown) => !!e && NET_ERR.test(
  `${(e as { message?: string }).message ?? ""} ${(e as { details?: string }).details ?? ""} ${String((e as { cause?: unknown }).cause ?? "")}`);
