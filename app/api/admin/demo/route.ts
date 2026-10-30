import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle } from "@/lib/participants";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

// Personas temporales para probar la ruleta. Se reconocen por la cédula "TEMP…" y se borran juntas.
const TEMP_PREFIX = "TEMP";
const TEMP_COUNT = 100;
const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elena", "Fabián", "Gabriela", "Héctor", "Irene", "Julián"];
const LAST = ["Prueba", "Ejemplo", "Demo", "Muestra", "Ensayo", "Piloto", "Test", "Simulado", "Provisional", "Temporal"];
const RANKS = ["Coordinador", "Analista", "Jefe de área", "Supervisor", "Asistente", "Técnico", "Director", "Operador"];
// 100 combinaciones únicas: cada nombre con cada apellido.
const PEOPLE = Array.from({ length: TEMP_COUNT }, (_, i) => ({
  name: `${FIRST[i % 10]} ${LAST[Math.floor(i / 10) % 10]}`,
  rank: RANKS[i % RANKS.length],
  doc: `${TEMP_PREFIX}${String(i + 1).padStart(4, "0")}`,
}));

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

  const session = await getSession();
  const by = `Prueba (${session?.name ?? "admin"})`;
  let added = 0, failed = false;
  // En tandas de 10 para no pasar el tiempo límite de Vercel.
  for (let i = 0; i < PEOPLE.length && !failed; i += 10) {
    const results = await Promise.all(PEOPLE.slice(i, i + 10).map((p) => sb.rpc("register_participant", {
      p_full_name: p.name, p_document_type: "OTRO", p_document_number: p.doc,
      p_email: null, p_phone: "0000000000", p_birth_date: "1990-01-01", p_city: "Prueba",
      p_id_document_path: null, p_photo_path: "temp/sin-foto.jpg",
      p_registered_by: null, p_registered_by_name: by, p_photo_source: "camera", p_rank: p.rank,
    })));
    for (const { error } of results) {
      if (!error) added++;
      else if (error.code !== "23505") { console.error("demo", error); failed = true; }
    }
  }
  if (failed && !added) return back("demo=error");
  return back(`demo=agregados&n=${added}`);
}
