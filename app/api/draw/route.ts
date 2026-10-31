import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle, fetchAll } from "@/lib/participants";

export const runtime = "nodejs";

// Lista de sorteos en orden: la pantalla espejo (TV) la consulta seguido para repetir cada giro.
export async function GET() {
  const raffle = await getActiveRaffle().catch(() => null);
  if (!raffle) return NextResponse.json({ draws: [] }, { headers: { "Cache-Control": "no-store" } });
  const { data, error } = await supabaseAdmin().from("draws").select("participant_id")
    .eq("raffle_id", raffle.id).order("created_at", { ascending: true }).limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draws: data.map((d) => ({ participantId: d.participant_id })) }, { headers: { "Cache-Control": "no-store" } });
}

// El ganador se elige en el servidor (aleatorio criptográfico) y queda registrado.
// La ruleta del navegador solo anima hasta el resultado.
export async function POST(req: Request) {
  // La pantalla manda quiénes tiene en su ruleta: así nunca sale alguien inscrito después de abrirla
  // (no estaría dibujado y el sorteo quedaría guardado sin verse).
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const onScreen = Array.isArray(body?.ids) ? new Set(body.ids.map(String)) : null;
  const raffle = await getActiveRaffle();
  if (!raffle) return NextResponse.json({ error: "No hay rifa activa" }, { status: 409 });
  const sb = supabaseAdmin();

  let participants: { id: string }[], prev: { participant_id: string }[];
  try {
    [participants, prev] = await Promise.all([
      fetchAll<{ id: string }>((from, to) => sb.from("participants").select("id").eq("raffle_id", raffle.id).order("id").range(from, to)),
      fetchAll<{ participant_id: string }>((from, to) => sb.from("draws").select("participant_id").eq("raffle_id", raffle.id).order("id").range(from, to)),
    ]);
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string }).message ?? "Error al leer participantes" }, { status: 500 });
  }

  const won = new Set(prev.map((d) => d.participant_id));
  const pool = participants.filter((p) => !won.has(p.id) && (!onScreen || onScreen.has(p.id)));
  if (!pool.length) return NextResponse.json({ error: onScreen?.size ? "Las personas de esta ruleta ya no están disponibles. Recarga la página." : "No quedan participantes sin premio" }, { status: 409 });

  // Si dos pantallas sortean a la vez y sale la misma persona, la base lo rechaza (índice único) y se elige otra.
  let winner = pool[randomInt(pool.length)], draw = null;
  for (let attempt = 0; attempt < 5 && pool.length; attempt++) {
    const { data, error: e2 } = await sb.from("draws")
      .insert({ raffle_id: raffle.id, participant_id: winner.id })
      .select("id, created_at").single();
    if (!e2) { draw = data; break; }
    if (e2.code !== "23505") return NextResponse.json({ error: e2.message }, { status: 500 });
    pool.splice(pool.indexOf(winner), 1);
    if (!pool.length) break;
    winner = pool[randomInt(pool.length)];
  }
  if (!draw) return NextResponse.json({ error: "No quedan participantes sin premio" }, { status: 409 });

  return NextResponse.json({ participantId: winner.id, drawId: draw.id, at: draw.created_at });
}
