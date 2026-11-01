import { NextResponse } from "next/server";
import { supabaseAdmin, BUCKET_DOCS, BUCKET_PHOTOS } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getActiveRaffle } from "@/lib/participants";
import { optimizeJpeg, FOTO, CEDULA } from "@/lib/optimize-photo";

export const runtime = "nodejs";

const DOC_TYPES = ["CC", "TI", "CE", "PAS", "DNI", "OTRO"];
// La base solo acepta los tipos de arriba: la cédula venezolana V se guarda como CC y la E como CE
// (el panel las vuelve a mostrar como V y E).
const NAT_TO_DOC: Record<string, string> = { V: "CC", E: "CE" };
const NO_PHONE = "0000000"; // la base exige teléfono hasta que se aplique supabase/schema.sql actualizado
const MAX_FILE = 3 * 1024 * 1024;

function isJpeg(buf: Uint8Array) {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.uid !== "env-admin") {
    const { data: u } = await supabaseAdmin().from("app_users").select("is_active").eq("id", session.uid).maybeSingle();
    if (!u?.is_active) return NextResponse.json({ error: "Tu usuario está desactivado" }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const s = (k: string) => String(form.get(k) ?? "").trim();
  const data = {
    full_name: s("full_name"),
    document_type: NAT_TO_DOC[s("document_type")] ?? s("document_type"),
    document_number: s("document_number").replace(/[^0-9A-Za-z]/g, ""),
    email: s("email"),
    phone: s("phone"),
    birth_date: s("birth_date"),
    city: s("city"),
    rank: s("rank").slice(0, 80),
  };
  const idDoc = form.get("id_document");
  const photo = form.get("photo");

  const errors: string[] = [];
  if (data.full_name.length < 3) errors.push("Nombre completo requerido");
  if (!DOC_TYPES.includes(data.document_type)) errors.push("Tipo de documento inválido");
  if (data.document_number.length < 4) errors.push("Número de documento inválido");
  if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) errors.push("Correo inválido");
  if (data.phone && data.phone.replace(/\D/g, "").length < 7) errors.push("Teléfono inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.birth_date)) errors.push("Fecha de nacimiento inválida");
  if (!(photo instanceof File)) errors.push("Falta la foto de la persona");
  const photoSource = form.get("photo_source") === "api" ? "api" : "camera";
  if (errors.length) return NextResponse.json({ error: errors.join(". ") }, { status: 400 });

  // La foto de la cédula es opcional (los datos vienen de la API).
  let idBuf = idDoc instanceof File && idDoc.size > 0 ? new Uint8Array(await idDoc.arrayBuffer()) : null;
  let photoBuf = new Uint8Array(await (photo as File).arrayBuffer());
  const images: [Uint8Array, string][] = [[photoBuf, "foto"]];
  if (idBuf) images.push([idBuf, "cédula"]);
  for (const [buf, label] of images) {
    if (buf.length > MAX_FILE) return NextResponse.json({ error: `La imagen de ${label} supera 3 MB` }, { status: 400 });
    if (!isJpeg(buf)) return NextResponse.json({ error: `La imagen de ${label} debe ser JPG` }, { status: 400 });
  }
  // Más livianas antes de guardarlas: menos espacio en Supabase y menos datos al mostrarlas en ruleta y panel.
  [photoBuf, idBuf] = await Promise.all([optimizeJpeg(photoBuf, FOTO), idBuf ? optimizeJpeg(idBuf, CEDULA) : null]);

  const sb = supabaseAdmin();
  // El navegador manda un código por cada persona que se intenta guardar. Si se vuelve a presionar Guardar
  // (o la red se cortó después de guardar y la conexión se reintenta), se reconoce el mismo registro en vez
  // de responder "ya está inscrita" y borrar la foto de una inscripción que sí quedó guardada.
  const reqId = s("request_id").toLowerCase();
  const key = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(reqId) ? reqId : crypto.randomUUID();
  const idPath = idBuf ? `${key}.jpg` : null;
  const photoPath = `${key}.jpg`;

  const up1 = await sb.storage.from(BUCKET_PHOTOS).upload(photoPath, photoBuf, { contentType: "image/jpeg", upsert: true });
  const up2 = up1.error || !idBuf || !idPath ? up1
    : await sb.storage.from(BUCKET_DOCS).upload(idPath, idBuf, { contentType: "image/jpeg", upsert: true });
  const cleanup = () => Promise.all([
    sb.storage.from(BUCKET_PHOTOS).remove([photoPath]),
    idPath ? sb.storage.from(BUCKET_DOCS).remove([idPath]) : null,
  ]);
  if (up1.error || up2.error) {
    await cleanup();
    console.error("upload", up1.error ?? up2.error);
    return NextResponse.json({ error: "No se pudieron guardar las imágenes" }, { status: 500 });
  }

  const register = (phone: string | null) => sb.rpc("register_participant", {
    p_full_name: data.full_name, p_document_type: data.document_type, p_document_number: data.document_number,
    p_email: data.email, p_phone: phone, p_birth_date: data.birth_date, p_city: data.city,
    p_id_document_path: idPath, p_photo_path: photoPath,
    p_registered_by: session.uid === "env-admin" ? null : session.uid, p_registered_by_name: session.name, p_photo_source: photoSource, p_rank: data.rank,
  });
  // El teléfono ya no se pide. Si la base todavía lo exige (esquema anterior), se guarda un marcador.
  let { data: rows, error } = await register(data.phone || null);
  if (error && !data.phone && (error.code === "23502" || error.code === "23514") && /phone/.test(error.message)) {
    ({ data: rows, error } = await register(NO_PHONE));
  }

  if (error) {
    // Antes de borrar nada: ¿quedó guardada esta misma inscripción (misma foto)? Pasa cuando la red corta la
    // respuesta y la consulta se repite: la segunda vez la base dice "duplicada" aunque la primera funcionó.
    // Solo en la rifa activa: si la cédula participó en una rifa anterior, no se debe citar ese número viejo.
    const raffle = await getActiveRaffle().catch(() => null);
    let prevQuery = sb.from("participants").select("raffle_number, full_name, registered_by_name, photo_path")
      .eq("document_number", data.document_number);
    if (raffle) prevQuery = prevQuery.eq("raffle_id", raffle.id);
    const { data: prev } = await prevQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (prev?.photo_path === photoPath) return NextResponse.json({ number: prev.raffle_number, name: prev.full_name });
    await cleanup();
    if (error.code === "23505") {
      const who = prev ? ` con el número ${prev.raffle_number}${prev.registered_by_name ? ` (la registró ${prev.registered_by_name})` : ""}` : "";
      return NextResponse.json({ error: `Esta cédula ya está inscrita en la rifa${who}` }, { status: 409 });
    }
    if (error.message.includes("RAFFLE_FULL")) {
      return NextResponse.json({ error: "Ya no hay números disponibles" }, { status: 409 });
    }
    if (error.message.includes("NO_ACTIVE_RAFFLE")) {
      return NextResponse.json({ error: "No hay una rifa activa en este momento" }, { status: 409 });
    }
    console.error("register_participant", error);
    return NextResponse.json({ error: "No se pudo completar el registro" }, { status: 500 });
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  return NextResponse.json({ number: row.raffle_number, name: data.full_name });
}
