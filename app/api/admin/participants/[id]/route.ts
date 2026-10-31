import { NextResponse } from "next/server";
import { supabaseAdmin, BUCKET_DOCS, BUCKET_PHOTOS } from "@/lib/supabase";

export const runtime = "nodejs";

// Solo admin (middleware protege /api/admin). Borra al inscrito; si había ganado, su premio se borra con él
// (draws tiene on delete cascade) y su número queda libre otra vez.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: p, error } = await sb.from("participants").delete().eq("id", id)
    .select("photo_path, id_document_path").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!p) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  // Las fotos se borran del almacenamiento; si falla no importa (el registro ya no existe).
  if (p.photo_path && !p.photo_path.startsWith("temp/")) await sb.storage.from(BUCKET_PHOTOS).remove([p.photo_path]).catch(() => {});
  if (p.id_document_path) await sb.storage.from(BUCKET_DOCS).remove([p.id_document_path]).catch(() => {});
  return NextResponse.json({ ok: true });
}
