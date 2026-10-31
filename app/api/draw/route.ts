import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle, fetchAll } from "@/lib/participants";
import { readWheelState } from "@/lib/wheel-state";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// Lista de sorteos en orden: la pantalla espejo (TV) la consulta seguido para repetir cada giro.
export async function GET() {
  const raffle = await getActiveRaffle().catch(() => null);
  if (!raffle) return NextResponse.json({ draws: [] }, { headers: { "Cache-Control": "no-store" } });
  // En tandas: Supabase entrega como máximo 1000 filas por consulta y la TV debe ver la lista completa.
  const sb = supabaseAdmin();
  try {
    const [data, state] = await Promise.all([
      fetchAll<{ participant_id: string }>((from, to) => sb.from("draws").select("participant_id")
        .eq("raffle_id", raffle.id).order("created_at", { ascending: true }).order("id").range(from, to)),
      readWheelState(),
    ]);
    // closed: el último ganador al que el admin le cerró el cartel (la TV cierra el suyo igual).
    return NextResponse.json({ draws: data.map((d) => ({ participantId: d.participant_id })), closed: state?.closed ?? null },
      { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string }).message ?? "Error" }, { status: 500 });
  }
}

// El ganador se elige en el servidor (aleatorio criptográfico) y queda registrado.
// La ruleta del navegador solo anima hasta el resultado.
export async function POST(req: Request) {
  // Solo el admin sortea: la TV es un espejo y nunca gira por su cuenta.
  if ((await getSession())?.role !== "admin") return NextResponse.json({ error: "Solo el admin puede girar la ruleta" }, { status: 403 });
  // Siempre responde JSON (nunca una página de error), para que la ruleta sepa qué pasó y no se quede pegada.
  try {
    return await drawWinner(req);
  } catch (e) {
    console.error("draw", e);
    return NextResponse.json({ error: (e as { message?: string })?.message ?? "Error al sortear" }, { status: 500 });
  }
}

async function drawWinner(req: Request) {
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
    if (e2.code !== "23505") {
      // Error de red al guardar: puede que la base sí lo haya guardado y solo se perdió la respuesta.
      // Se revisa antes de rendirse, para no dejar un ganador guardado que nadie vio.
      const { data: saved } = await sb.from("draws").select("id, created_at")
        .eq("raffle_id", raffle.id).eq("participant_id", winner.id).maybeSingle();
      if (saved) { draw = saved; break; }
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
    pool.splice(pool.indexOf(winner), 1);
    if (!pool.length) break;
    winner = pool[randomInt(pool.length)];
  }
  if (!draw) return NextResponse.json({ error: "No quedan participantes sin premio" }, { status: 409 });

  return NextResponse.json({ participantId: winner.id, drawId: draw.id, at: draw.created_at });
}
