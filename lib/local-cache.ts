// Solo servidor (usa el disco). Sin "server-only" para poder usarse también desde instrumentation.ts.
import { mkdir, readFile, writeFile, rename } from "fs/promises";
import path from "path";

// Copia local (solo en la laptop, nunca en Vercel) de lo mínimo para seguir trabajando sin internet:
// los usuarios (con su contraseña ya cifrada) para poder iniciar sesión, y la rifa activa para abrir el registro.
// Se actualiza cada vez que Supabase responde; si Supabase no responde, se usa la última copia.
// Vive en .cache/ junto a la app (ignorado por git), así que sobrevive a reiniciar la laptop.
const DIR = path.join(process.cwd(), ".cache");
export const localCacheEnabled = () => !process.env.VERCEL;

const mem = new Map<string, unknown>();

export async function saveLocal(name: string, value: unknown) {
  if (!localCacheEnabled()) return;
  mem.set(name, value);
  try {
    await mkdir(DIR, { recursive: true });
    const file = path.join(DIR, `${name}.json`), tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
    await rename(tmp, file); // nunca queda un archivo a medio escribir
  } catch (e) {
    console.warn(`no se pudo guardar la copia local ${name}: ${(e as Error).message}`);
  }
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
