import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { seeOther } from "@/lib/redirect";
import { getActiveRaffle } from "@/lib/participants";
import { supabaseAdmin } from "@/lib/supabase";
import { readEligibilityList } from "@/lib/raffle-eligibility-store";
import { saveRaffleList } from "@/lib/raffle-list-update";
import { parseRaffleDocuments } from "@/lib/raffle-eligibility";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return new Response("Solo el administrador", { status: 403 });
  const json = req.headers.get("accept")?.includes("application/json");
  const back = (error: string) => json ? NextResponse.json({ error }, { status: 409 }) : seeOther(`/admin/rifa?error=${encodeURIComponent(error)}`);
  try {
    const form = await req.formData();
    const raffle = await getActiveRaffle();
    // No permitir que una pestaña vieja reemplace la lista de otra rifa.
    if (!raffle || form.get("raffle_id") !== raffle.id) return back("La rifa activa cambió. Recarga la página.");
    const documents = parseRaffleDocuments(String(form.get("documents") ?? ""));
    const sb = supabaseAdmin();
    const mode = form.get("mode") === "edit" ? "edit" : "append";
    await saveRaffleList({
      read: () => readEligibilityList(raffle.id),
      create: async (next, version) => {
        const { error } = await sb.from("raffle_eligibility_lists").insert({
          raffle_id: raffle.id, document_numbers: next, updated_by: session.name, updated_at: version,
        });
        if (error?.code === "23505") return false;
        if (error) throw new Error("No se pudo guardar la lista. Intenta nuevamente.");
        return true;
      },
      update: async (next, version, previousVersion) => {
        const { data, error } = await sb.from("raffle_eligibility_lists").update({
          document_numbers: next, updated_by: session.name, updated_at: version,
        }).eq("raffle_id", raffle.id).eq("updated_at", previousVersion).select("raffle_id").maybeSingle();
        if (error) throw new Error("No se pudo guardar la lista. Intenta nuevamente.");
        return !!data;
      },
    }, documents, mode, String(form.get("expected_version") ?? ""));
    return json ? NextResponse.json({ ok: true }) : seeOther("/admin/rifa?ok=1");
  } catch (e) {
    return back(e instanceof Error ? e.message : "No se pudo guardar la lista");
  }
}
