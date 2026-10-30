import "server-only";
import { cookies } from "next/headers";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, readSessionToken, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 32);
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}
