import { NextResponse } from "next/server";
import { supabaseAdmin, BUCKET_DOCS } from "@/lib/supabase";

export const runtime = "nodejs";

// Foto del documento de identidad. Protegido por middleware (solo admin).
// Se entrega a través de la app (igual que /api/foto): en la red de Infopress el navegador no puede bajar
// archivos directo de Supabase, así que redirigir a la URL firmada dejaba "Ver cédula" en blanco.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("id_document_path").eq("id", id).maybeSingle();
  if (!p?.id_document_path) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const { data, error } = await sb.storage.from(BUCKET_DOCS).download(p.id_document_path);
  if (error || !data) return NextResponse.json({ error: "No disponible" }, { status: 502 });
  return new Response(data, {
    headers: { "Content-Type": data.type || "image/jpeg", "Cache-Control": "private, no-store" },
  });
}
