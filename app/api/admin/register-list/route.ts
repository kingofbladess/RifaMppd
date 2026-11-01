import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSession } from "@/lib/auth";
import { getActiveRaffle } from "@/lib/participants";
import { supabaseAdmin } from "@/lib/supabase";
import { readEligibilityList } from "@/lib/raffle-eligibility-store";
import { normalizeRaffleDocument } from "@/lib/raffle-eligibility";
import { lookupPerson } from "@/lib/person-api";
import { registerParticipant } from "@/lib/register-participant";

export const runtime = "nodejs";
export const maxDuration = 180;

// Una persona por petición: la importación puede mostrar avance y reintentarse sin duplicar.
export async function POST(req: Request) {
  if ((await getSession())?.role !== "admin") return NextResponse.json({ error: "Solo el administrador" }, { status: 403 });
  try {
    const body = await req.json();
    const doc = normalizeRaffleDocument(String(body.doc ?? ""));
    if (!doc) return NextResponse.json({ error: "Cédula inválida" }, { status: 400 });
    const raffle = await getActiveRaffle();
    if (!raffle || body.raffleId !== raffle.id) return NextResponse.json({ error: "La rifa activa cambió. Recarga antes de continuar.", stop: true }, { status: 409 });
    const list = await readEligibilityList(raffle.id);
    if (!list?.document_numbers.includes(doc)) return NextResponse.json({ error: "La cédula ya no está en la lista de la rifa" }, { status: 409 });
    const { data: existing, error } = await supabaseAdmin().from("participants").select("raffle_number")
      .eq("raffle_id", raffle.id).eq("document_number", doc).maybeSingle();
    if (error) throw new Error("No se pudo comprobar si la persona ya está registrada");
    if (existing) return NextResponse.json({ status: "existing", number: existing.raffle_number });
    if (!process.env.INFOPRESS_API_KEY && !process.env.PERSON_API_URL) return NextResponse.json({ error: "Configura Infopress o la API de personas para el registro automático.", stop: true }, { status: 503 });
    const result = await lookupPerson(doc, body.nat === "E" ? "E" : "V");
    if (result.source === "demo" || !result.found || !result.person) return NextResponse.json({ error: "La API no encontró a la persona" }, { status: 422 });
    if (result.photoPending) return NextResponse.json({ error: "La API aún está preparando la foto", retryPhoto: true }, { status: 422 });
    if (!result.photo) return NextResponse.json({ error: "La API no entregó foto. Completa el registro con cámara." }, { status: 422 });
    if (!result.person.full_name || !/^\d{4}-\d{2}-\d{2}$/.test(result.person.birth_date)) return NextResponse.json({ error: "La API no entregó nombre y fecha de nacimiento completos" }, { status: 422 });
    const photoMatch = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i.exec(result.photo);
    if (!photoMatch) return NextResponse.json({ error: "La API entregó una foto incompatible" }, { status: 422 });
    const raw = Buffer.from(photoMatch[1], "base64");
    if (raw.length > 10 * 1024 * 1024) return NextResponse.json({ error: "La foto de la API supera 10 MB" }, { status: 422 });
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(raw).rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    const form = new FormData();
    Object.entries(result.person).forEach(([key, value]) => form.set(key, value));
    form.set("document_number", doc);
    form.set("raffle_id", raffle.id);
    form.set("photo_source", "api");
    form.set("photo", new File([new Uint8Array(jpeg)], "foto.jpg", { type: "image/jpeg" }));
    const hex = createHash("sha256").update(`list:${raffle.id}:${doc}`).digest("hex");
    form.set("request_id", `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`);
    const response = await registerParticipant(new Request(req.url, { method: "POST", body: form }));
    const saved = await response.json();
    if (!response.ok) return NextResponse.json({ error: saved.error ?? "No se pudo registrar", stop: response.status === 401 || response.status === 403 || /rifa activa cambió|números disponibles|rifa activa en este momento/i.test(saved.error ?? "") }, { status: response.status });
    return NextResponse.json({ status: "registered", number: saved.number });
  } catch (e) {
    console.error("register-list", e);
    return NextResponse.json({ error: "No se pudo completar la consulta o el registro. Puedes reintentar la importación." }, { status: 503 });
  }
}
