import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle } from "@/lib/participants";
import { lookupPerson } from "@/lib/person-api";

export const runtime = "nodejs";

// Consulta la API de personas y, a la vez, si la cédula ya está inscrita en la rifa activa.
export async function GET(req: Request) {
  const doc = (new URL(req.url).searchParams.get("doc") ?? "").replace(/\D/g, "");
  if (doc.length < 4 || doc.length > 15) return NextResponse.json({ error: "Número de cédula inválido" }, { status: 400 });

  const raffle = await getActiveRaffle();
  const [existing, lookup] = await Promise.all([
    raffle
      ? supabaseAdmin().from("participants").select("raffle_number, full_name, registered_by_name")
          .eq("raffle_id", raffle.id).eq("document_number", doc).maybeSingle().then((r) => r.data)
      : null,
    lookupPerson(doc).catch((e: Error) => ({ error: e.message })),
  ]);

  if ("error" in lookup) {
    console.error("lookup", lookup.error);
    return NextResponse.json({
      found: false, source: "api", person: null, photo: null, photoDate: null,
      apiError: "No se pudo consultar la API. Puedes registrar los datos manualmente.",
      existing,
    });
  }
  return NextResponse.json({ ...lookup, existing });
}
