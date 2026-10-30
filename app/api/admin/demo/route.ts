import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle } from "@/lib/participants";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// Personas temporales para probar la ruleta. Se reconocen por la cédula "TEMP…" y se borran juntas.
const TEMP_PREFIX = "TEMP";
const PEOPLE: [string, string][] = [
  ["Ana Lucía Prueba", "Coordinadora"], ["Bruno Ejemplo", "Analista"], ["Carla Demo", "Jefa de área"],
  ["Diego Muestra", "Supervisor"], ["Elena Ensayo", "Asistente"], ["Fabián Piloto", "Técnico"],
  ["Gabriela Test", "Directora"], ["Héctor Simulado", "Analista"], ["Irene Provisional", "Coordinadora"],
  ["Julián Temporal", "Operador"],
];

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
  let added = 0;
  for (const [i, [name, rank]] of PEOPLE.entries()) {
    const { error } = await sb.rpc("register_participant", {
      p_full_name: name, p_document_type: "OTRO", p_document_number: `${TEMP_PREFIX}${String(i + 1).padStart(4, "0")}`,
      p_email: null, p_phone: "0000000000", p_birth_date: "1990-01-01", p_city: "Prueba",
      p_id_document_path: null, p_photo_path: "temp/sin-foto.jpg",
      p_registered_by: null, p_registered_by_name: `Prueba (${session?.name ?? "admin"})`,
      p_photo_source: "camera", p_rank: rank,
    });
    if (!error) added++;
    else if (error.code !== "23505") { console.error("demo", error); return back("demo=error"); }
  }
  return back(`demo=agregados&n=${added}`);
}
