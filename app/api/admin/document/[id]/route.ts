import { NextResponse } from "next/server";
import { supabaseAdmin, BUCKET_DOCS } from "@/lib/supabase";

export const runtime = "nodejs";

// Redirige a una URL firmada de 2 minutos del documento de identidad. Protegido por middleware.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p } = await sb.from("participants").select("id_document_path").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const { data, error } = await sb.storage.from(BUCKET_DOCS).createSignedUrl(p.id_document_path, 120);
  if (error || !data) return NextResponse.json({ error: "No disponible" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
