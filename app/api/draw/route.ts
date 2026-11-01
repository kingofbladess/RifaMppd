import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle, fetchAll } from "@/lib/participants";
import { readWheelState } from "@/lib/wheel-state";
import { getSession } from "@/lib/auth";
import { readEligibilityList } from "@/lib/raffle-eligibility-store";
import { eligibleRafflePool, normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { elegirGanador } from "@/lib/grados";
import { readModo, cadetesRegistrados, readCadetDraws, addCadetDraw, cedulasCadetes } from "@/lib/cadetes-store";
import { cadeteId, elegirCadete } from "@/lib/cadetes";

export const runtime = "nodejs";

// Lista de sorteos en orden: la pantalla espejo (TV) la consulta seguido para repetir cada giro.
export async function GET() {
  // Si Supabase falla un instante se responde error (no una lista vacía): la TV lo tomaba como "quitaron todos
  // los ganadores" y se recargaba en pleno evento. Con error, la TV solo reintenta en el siguiente ciclo.
  let raffle, modo;
  try {
    // modo: "normal" o "cadetes". Si el admin lo cambia, la TV se recarga para mostrar la otra ruleta.
    [raffle, modo] = await Promise.all([getActiveRaffle(), readModo()]);
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string })?.message ?? "Error" }, { status: 503 });
  }
  if (modo === "cadetes") {
    try {
      const [cedulas, state] = await Promise.all([readCadetDraws(), readWheelState()]);
      return NextResponse.json({ modo, draws: cedulas.map((c) => ({ participantId: cadeteId(c) })), closed: state?.closed ?? null },
        { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return NextResponse.json({ error: (e as { message?: string }).message ?? "Error" }, { status: 503 });
    }
  }
  if (!raffle) return NextResponse.json({ modo, draws: [] }, { headers: { "Cache-Control": "no-store" } });
  // En tandas: Supabase entrega como máximo 1000 filas por consulta y la TV debe ver la lista completa.
  const sb = supabaseAdmin();
  try {
    const [data, state] = await Promise.all([
      fetchAll<{ participant_id: string }>((from, to) => sb.from("draws").select("participant_id")
        .eq("raffle_id", raffle.id).order("created_at", { ascending: true }).order("id").range(from, to)),
      readWheelState(),
    ]);
    // closed: el último ganador al que el admin le cerró el cartel (la TV cierra el suyo igual).
    return NextResponse.json({ modo, draws: data.map((d) => ({ participantId: d.participant_id })), closed: state?.closed ?? null },
      { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string }).message ?? "Error" }, { status: 500 });
  }
}

// El ganador se elige en el servidor (aleatorio criptográfico) y queda registrado.
// Regla por grado (lib/grados.ts): civiles igual que antes; militares con menos probabilidad a más antigüedad.
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
  const body = (await req.json().catch(() => null)) as { ids?: unknown; modo?: unknown } | null;
  const onScreen = Array.isArray(body?.ids) ? new Set(body.ids.map(String)) : null;
  const modo = await readModo();
  // La pantalla se abrió con la otra ruleta (cambiaron el modo en el panel): debe recargarse antes de girar.
  if (typeof body?.modo === "string" && body.modo !== modo)
    return NextResponse.json({ error: modo === "cadetes" ? "Se activó la ruleta de cadetes. Recarga la página." : "Se volvió a la ruleta normal. Recarga la página." }, { status: 409 });
  if (modo === "cadetes") return drawCadet(onScreen);
  const raffle = await getActiveRaffle();
  if (!raffle) return NextResponse.json({ error: "No hay rifa activa" }, { status: 409 });
  const sb = supabaseAdmin();

  const eligibility = await readEligibilityList(raffle.id);
  if (!eligibility?.document_numbers.length) return NextResponse.json({ error: "Carga primero la lista de participantes de la rifa en el panel del administrador." }, { status: 409 });

  let participants: { id: string; rank: string | null; document_number: string }[], prev: { participant_id: string }[];
  try {
    [participants, prev] = await Promise.all([
      fetchAll<{ id: string; rank: string | null; document_number: string }>((from, to) => sb.from("participants").select("id, rank, document_number").eq("raffle_id", raffle.id).order("id").range(from, to)),
      fetchAll<{ participant_id: string }>((from, to) => sb.from("draws").select("participant_id").eq("raffle_id", raffle.id).order("id").range(from, to)),
    ]);
  } catch (e) {
    return NextResponse.json({ error: (e as { message?: string }).message ?? "Error al leer participantes" }, { status: 500 });
  }

  const won = new Set(prev.map((d) => d.participant_id));
  // Cada ruleta tiene sus propios participantes: los de la lista de cadetes no participan en la normal.
  const cadetes = await cedulasCadetes();
  const available = eligibleRafflePool(participants, eligibility.document_numbers, won)
    .filter((p) => !cadetes.has(normalizeRaffleDocument(p.document_number) ?? ""));
  if (!available.length) return NextResponse.json({ error: "No quedan participantes de la lista registrados y sin premio." }, { status: 409 });
  const pool = available.filter((p) => !onScreen || onScreen.has(p.id));
  if (!pool.length) return NextResponse.json({ error: "Los participantes elegibles no están en esta pantalla. Recarga la ruleta." }, { status: 409 });

  // Si dos pantallas sortean a la vez y sale la misma persona, la base lo rechaza (índice único) y se elige otra.
  const pick = () => elegirGanador(pool, randomInt);
  let winner = pick(), draw = null;
  // Solo quedan personas que no pueden ganar (grados 1, 2 y 3, peso 0): siguen en la ruleta pero no salen.
  if (!winner) return NextResponse.json({ error: "No quedan participantes que puedan ganar" }, { status: 409 });
  for (let attempt = 0; attempt < 5 && winner; attempt++) {
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
    winner = pick();
  }
  if (!draw) return NextResponse.json({ error: "No quedan participantes sin premio" }, { status: 409 });

  return NextResponse.json({ participantId: winner!.id, drawId: draw.id, at: draw.created_at });
}

// Ruleta de cadetes: misma probabilidad para todos los cadetes registrados que no han ganado (sin regla por grado).
async function drawCadet(onScreen: Set<string> | null) {
  const raffle = await getActiveRaffle();
  const [{ lista, registrados }, ganados] = await Promise.all([cadetesRegistrados(raffle?.id ?? null), readCadetDraws()]);
  if (!lista.length) return NextResponse.json({ error: "Carga primero la lista de cadetes en el panel del administrador." }, { status: 409 });
  if (!registrados.length) return NextResponse.json({ error: "Ningún cadete de la lista se ha registrado todavía." }, { status: 409 });
  const won = new Set(ganados);
  const available = registrados.filter((c) => !won.has(c.cedula));
  if (!available.length) return NextResponse.json({ error: "No quedan cadetes sin premio." }, { status: 409 });
  const pool = available.filter((c) => !onScreen || onScreen.has(cadeteId(c.cedula)));
  if (!pool.length) return NextResponse.json({ error: "Los cadetes disponibles no están en esta pantalla. Recarga la ruleta." }, { status: 409 });
  const winner = elegirCadete(pool, randomInt)!;
  await addCadetDraw(winner.cedula);
  return NextResponse.json({ participantId: cadeteId(winner.cedula), at: new Date().toISOString() });
}
