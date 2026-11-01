import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getActiveRaffle } from "@/lib/participants";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !["admin", "operator"].includes(session.role)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  try {
    const sb = supabaseAdmin();
    if (session.uid !== "env-admin") {
      const { data: user, error } = await sb.from("app_users").select("is_active, role").eq("id", session.uid).maybeSingle();
      if (error) throw error;
      if (!user?.is_active || !["admin", "operator"].includes(user.role)) return NextResponse.json({ error: "Tu usuario no puede confirmar registros" }, { status: 403 });
    }
    const body = await req.json();
    if (typeof body.participantId !== "string") return NextResponse.json({ error: "Falta la persona" }, { status: 400 });
    const raffle = await getActiveRaffle();
    if (!raffle) return NextResponse.json({ error: "No hay rifa activa" }, { status: 409 });
    const { data: participant, error } = await sb.from("participants").select("id")
      .eq("id", body.participantId).eq("raffle_id", raffle.id).maybeSingle();
    if (error) throw error;
    if (!participant) return NextResponse.json({ error: "La persona no está registrada en la rifa activa" }, { status: 404 });
    // Conserva la primera confirmación incluso con dos operadores o reintentos simultáneos.
    const { error: savedError } = await sb.from("participant_operator_confirmations").upsert({
      participant_id: participant.id, confirmed_by: session.uid === "env-admin" ? null : session.uid,
      confirmed_by_name: session.name,
    }, { onConflict: "participant_id", ignoreDuplicates: true });
    if (savedError) throw savedError;
    const { data: confirmation, error: readError } = await sb.from("participant_operator_confirmations")
      .select("confirmed_at, confirmed_by_name").eq("participant_id", participant.id).single();
    if (readError) throw readError;
    return NextResponse.json({ ok: true, ...confirmation });
  } catch (e) {
    console.error("confirm-registration", e);
    return NextResponse.json({ error: "No se pudo confirmar. Reintenta o pide al administrador revisar la conexión y aplicar supabase/operator-confirmations.sql." }, { status: 503 });
  }
}
