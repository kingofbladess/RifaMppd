import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle } from "@/lib/participants";
import { writeWheelState } from "@/lib/wheel-state";

export const runtime = "nodejs";

// Solo admin (middleware protege /api/admin). Quitar un ganador lo devuelve a la ruleta;
// sin participantId se borran todos los ganadores de la rifa activa (para reiniciar pruebas).
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { participantId?: unknown; all?: unknown } | null;
  const raffle = await getActiveRaffle();
  if (!raffle) return NextResponse.json({ error: "No hay rifa activa" }, { status: 409 });
  const sb = supabaseAdmin();
  let query = sb.from("draws").delete().eq("raffle_id", raffle.id);
  if (typeof body?.participantId === "string" && body.participantId) query = query.eq("participant_id", body.participantId);
  else if (body?.all !== true) return NextResponse.json({ error: "Falta el ganador" }, { status: 400 });
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Un ganador quitado puede volver a salir: se olvida el último cierre para que la TV no cierre su cartel antes de tiempo.
  await writeWheelState({ closed: null, at: new Date().toISOString() }).catch(() => {});
  return NextResponse.json({ ok: true });
}
