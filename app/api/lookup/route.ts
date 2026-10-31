import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveRaffle } from "@/lib/participants";
import { lookupPerson } from "@/lib/person-api";

export const runtime = "nodejs";
export const maxDuration = 130; // Infopress puede tardar hasta ~2 minutos

// Consulta la API de personas y, a la vez, si la cédula ya está inscrita en la rifa activa.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const doc = (params.get("doc") ?? "").replace(/\D/g, "");
  const nat = params.get("nat") === "E" ? "E" : "V"; // cédula venezolana: V (venezolano) o E (extranjero)
  if (doc.length < 4 || doc.length > 15) return NextResponse.json({ error: "Número de cédula inválido" }, { status: 400 });

  // La consulta a la API arranca de inmediato; la rifa activa y la inscripción previa se buscan en paralelo.
  const t0 = Date.now();
  let apiMs = 0;
  const lookupP = lookupPerson(doc, nat)
    .catch((e: Error) => ({ error: e.message }))
    .finally(() => { apiMs = Date.now() - t0; });
  const existingP = getActiveRaffle().then((raffle) => raffle
    ? supabaseAdmin().from("participants").select("raffle_number, full_name, registered_by_name")
        .eq("raffle_id", raffle.id).eq("document_number", doc).maybeSingle().then((r) => r.data)
    : null).catch(() => null);
  const [existing, lookup] = await Promise.all([existingP, lookupP]);
  // Tiempos en la terminal: muestra cuánto tardó la API externa y cuánto la app.
  console.log(`lookup ${nat}${doc.slice(0, 2)}***: API ${(apiMs / 1000).toFixed(1)} s, total ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  if ("error" in lookup) {
    console.error("lookup", lookup.error);
    return NextResponse.json({
      found: false, source: "api", person: null, photo: null, photoDate: null,
      apiError: `No se pudo consultar la API (${lookup.error}). Puedes registrar los datos manualmente.`,
      existing,
    });
  }
  return NextResponse.json({ ...lookup, existing });
}
