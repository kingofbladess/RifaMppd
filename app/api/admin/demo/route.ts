import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle, fetchAll } from "@/lib/participants";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Personas temporales para probar la ruleta. Se reconocen por la cédula "TEMP…" y se borran juntas.
const TEMP_PREFIX = "TEMP";
const ALLOWED = [5, 100, 1000, 5000];
const CHUNK = 500;
const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elena", "Fabián", "Gabriela", "Héctor", "Irene", "Julián",
  "Karen", "Luis", "María", "Nicolás", "Olga", "Pablo", "Rosa", "Samuel", "Tatiana", "Víctor"];
const LAST = ["Prueba", "Ejemplo", "Demo", "Muestra", "Ensayo", "Piloto", "Test", "Simulado", "Provisional", "Temporal",
  "Modelo", "Borrador", "Patrón", "Boceto", "Esbozo", "Maqueta", "Prototipo", "Plantilla", "Testigo", "Control",
  "Referencia", "Ficticio", "Inventado", "Supuesto", "Virtual"];
const RANKS = ["Coordinador", "Analista", "Jefe de área", "Supervisor", "Asistente", "Técnico", "Director", "Operador"];
// Nombre + dos apellidos: 20 × 25 × 25 combinaciones distintas.
const nameFor = (i: number) => `${FIRST[i % 20]} ${LAST[Math.floor(i / 20) % 25]} ${LAST[Math.floor(i / 500) % 25]}`;

export async function POST(req: Request) {
  const form = await req.formData();
  const back = (q: string) => NextResponse.redirect(new URL(`/admin?${q}`, req.url), 303);
  const sb = supabaseAdmin();
  const raffle = await getActiveRaffle();
  if (!raffle) return back("demo=sin-rifa");

  if (form.get("action") === "clear") {
    const { error } = await sb.from("participants").delete()
      .eq("raffle_id", raffle.id).like("document_number", `${TEMP_PREFIX}%`);
    return back(error ? "demo=error" : "demo=borrados");
  }

  const wanted = Number(form.get("count"));
  const count = ALLOWED.includes(wanted) ? wanted : 100;
  const session = await getSession();
  const by = `Prueba (${session?.name ?? "admin"})`;

  try {
    const existing = await fetchAll<{ raffle_number: number; document_number: string }>((from, to) =>
      sb.from("participants").select("raffle_number, document_number").eq("raffle_id", raffle.id).order("raffle_number").range(from, to));
    const used = new Set(existing.map((p) => p.raffle_number));
    const tempDocs = new Set(existing.filter((p) => p.document_number.startsWith(TEMP_PREFIX)).map((p) => p.document_number));

    // Números libres al azar (Fisher-Yates), igual que el registro normal.
    const free: number[] = [];
    for (let x = raffle.number_min; x <= raffle.number_max; x++) if (!used.has(x)) free.push(x);
    for (let i = free.length - 1; i > 0; i--) { const j = randomInt(i + 1); [free[i], free[j]] = [free[j], free[i]]; }

    const rows = [];
    const now = new Date().toISOString();
    for (let i = 0; rows.length < count && rows.length < free.length && i < 100000; i++) {
      const doc = `${TEMP_PREFIX}${String(i + 1).padStart(5, "0")}`;
      if (tempDocs.has(doc)) continue;
      rows.push({
        raffle_id: raffle.id, raffle_number: free[rows.length], full_name: nameFor(i), document_type: "OTRO",
        document_number: doc, phone: "0000000000", birth_date: "1990-01-01", city: "Prueba",
        photo_path: "temp/sin-foto.jpg", photo_source: "camera", rank: RANKS[i % RANKS.length],
        registered_by_name: by, consent_at: now,
      });
    }

    let added = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await sb.from("participants").insert(rows.slice(i, i + CHUNK));
      // Si alguien registró un número justo en este momento, esa tanda se salta; el resto sigue.
      if (error) { console.error("demo", error); if (error.code !== "23505") break; continue; }
      added += Math.min(CHUNK, rows.length - i);
    }
    if (!added && rows.length) return back("demo=error");
    return back(`demo=agregados&n=${added}`);
  } catch (e) {
    console.error("demo", e);
    return back("demo=error");
  }
}
