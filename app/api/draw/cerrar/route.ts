import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { writeWheelState } from "@/lib/wheel-state";

export const runtime = "nodejs";

// El admin cerró el cartel del ganador: la TV espejo lo cierra también.
export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Solo el admin" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { participantId?: unknown } | null;
  const id = typeof body?.participantId === "string" ? body.participantId : "";
  if (!id) return NextResponse.json({ error: "Falta el ganador" }, { status: 400 });
  try {
    await writeWheelState({ closed: id, at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("cerrar", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
