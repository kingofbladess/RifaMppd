import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle, fetchAll } from "@/lib/participants";

export const runtime = "nodejs";

// El ganador se elige en el servidor (aleatorio criptográfico) y queda registrado.
// La ruleta del navegador solo anima hasta el resultado.
export async function POST() {
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
  const pool = participants.filter((p) => !won.has(p.id));
  if (!pool.length) return NextResponse.json({ error: "No quedan participantes sin premio" }, { status: 409 });

  const winner = pool[randomInt(pool.length)];
  const { data: draw, error: e2 } = await sb.from("draws")
    .insert({ raffle_id: raffle.id, participant_id: winner.id })
    .select("id, created_at").single();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  return NextResponse.json({ participantId: winner.id, drawId: draw.id, at: draw.created_at });
}
