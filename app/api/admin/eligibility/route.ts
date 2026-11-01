import { getSession } from "@/lib/auth";
import { seeOther } from "@/lib/redirect";
import { getActiveRaffle } from "@/lib/participants";
import { supabaseAdmin } from "@/lib/supabase";
import { parseRaffleDocuments } from "@/lib/raffle-eligibility";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Solo el administrador", { status: 403 });
  const back = (error: string) => seeOther(`/admin/rifa?error=${encodeURIComponent(error)}`);
  try {
    const form = await req.formData();
    const raffle = await getActiveRaffle();
    // No permitir que una pestaña vieja reemplace la lista de otra rifa.
    if (!raffle || form.get("raffle_id") !== raffle.id) return back("La rifa activa cambió. Recarga la página.");
    const documents = parseRaffleDocuments(String(form.get("documents") ?? ""));
    const { error } = await supabaseAdmin().from("raffle_eligibility_lists").upsert({
      raffle_id: raffle.id, document_numbers: documents,
      updated_by: session.name, updated_at: new Date().toISOString(),
    }, { onConflict: "raffle_id" });
    if (error) return back("No se pudo guardar la lista. Comprueba la conexión y aplica supabase/eligibility.sql si aún no lo has hecho.");
    return seeOther("/admin/rifa?ok=1");
  } catch (e) {
    return back(e instanceof Error ? e.message : "No se pudo guardar la lista");
  }
}
