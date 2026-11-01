import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle } from "@/lib/participants";
import { writeWheelState } from "@/lib/wheel-state";
import { readModo, removeCadetDraws } from "@/lib/cadetes-store";
import { cedulaDeId } from "@/lib/cadetes";

export const runtime = "nodejs";

// Solo admin (middleware protege /api/admin). Quitar un ganador lo devuelve a la ruleta;
// sin participantId se borran todos los ganadores de la rifa activa (para reiniciar pruebas).
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { participantId?: unknown; all?: unknown; modo?: unknown } | null;
  // Ganadores de la ruleta de cadetes (id "cad-<cédula>", o "todos" con el modo cadetes activo).
  const cedula = typeof body?.participantId === "string" ? cedulaDeId(body.participantId) : null;
  let modo;
  try {
    modo = await readModo();
  } catch (e) {
    // Sin saber el modo no se borra nada: "quitar todos" podría borrar los ganadores de la otra ruleta.
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
  if (typeof body?.modo === "string" && body.modo !== modo)
    return NextResponse.json({ error: "La lista de la ruleta cambió. Recarga la página." }, { status: 409 });
  if (cedula || (body?.all === true && modo === "cadetes")) {
    try {
      await removeCadetDraws(cedula);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
    await writeWheelState({ closed: null, at: new Date().toISOString() }).catch(() => {});
    return NextResponse.json({ ok: true });
  }
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
