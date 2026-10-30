// Sesión firmada con HMAC en una cookie httpOnly. Funciona en Edge (middleware) y Node.
export const SESSION_COOKIE = "rifa_session";
export const sessionMaxAge = 60 * 60 * 12; // 12 horas (una jornada de registro)

export type Role = "admin" | "operator";
export type Session = { uid: string; name: string; role: Role; exp: number };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function createSessionToken(s: Omit<Session, "exp">): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + sessionMaxAge })));
  return `${payload}.${await hmac(payload)}`;
}

export async function readSessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    return s.exp > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}
