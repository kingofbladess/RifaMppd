import { NextResponse } from "next/server";
import { supabaseAdmin, BUCKET_DOCS, BUCKET_PHOTOS } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

const DOC_TYPES = ["CC", "TI", "CE", "PAS", "DNI", "OTRO"];
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
    document_type: s("document_type"),
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
  if (data.phone.replace(/\D/g, "").length < 7) errors.push("Teléfono inválido");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.birth_date)) errors.push("Fecha de nacimiento inválida");
  if (!(photo instanceof File)) errors.push("Falta la foto de la persona");
  const photoSource = form.get("photo_source") === "api" ? "api" : "camera";
  if (errors.length) return NextResponse.json({ error: errors.join(". ") }, { status: 400 });

  // La foto de la cédula es opcional (los datos vienen de la API).
  const idBuf = idDoc instanceof File && idDoc.size > 0 ? new Uint8Array(await idDoc.arrayBuffer()) : null;
  const photoBuf = new Uint8Array(await (photo as File).arrayBuffer());
  const images: [Uint8Array, string][] = [[photoBuf, "foto"]];
  if (idBuf) images.push([idBuf, "cédula"]);
  for (const [buf, label] of images) {
    if (buf.length > MAX_FILE) return NextResponse.json({ error: `La imagen de ${label} supera 3 MB` }, { status: 400 });
    if (!isJpeg(buf)) return NextResponse.json({ error: `La imagen de ${label} debe ser JPG` }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const key = crypto.randomUUID();
  const idPath = idBuf ? `${key}.jpg` : null;
  const photoPath = `${key}.jpg`;

  const up1 = await sb.storage.from(BUCKET_PHOTOS).upload(photoPath, photoBuf, { contentType: "image/jpeg" });
  const up2 = up1.error || !idBuf || !idPath ? up1
    : await sb.storage.from(BUCKET_DOCS).upload(idPath, idBuf, { contentType: "image/jpeg" });
  const cleanup = () => Promise.all([
    sb.storage.from(BUCKET_PHOTOS).remove([photoPath]),
    idPath ? sb.storage.from(BUCKET_DOCS).remove([idPath]) : null,
  ]);
  if (up1.error || up2.error) {
    await cleanup();
    console.error("upload", up1.error ?? up2.error);
    return NextResponse.json({ error: "No se pudieron guardar las imágenes" }, { status: 500 });
  }

  const { data: rows, error } = await sb.rpc("register_participant", {
    p_full_name: data.full_name, p_document_type: data.document_type, p_document_number: data.document_number,
    p_email: data.email, p_phone: data.phone, p_birth_date: data.birth_date, p_city: data.city,
    p_id_document_path: idPath, p_photo_path: photoPath,
    p_registered_by: session.uid === "env-admin" ? null : session.uid, p_registered_by_name: session.name, p_photo_source: photoSource, p_rank: data.rank,
  });

  if (error) {
    await cleanup();
    if (error.code === "23505") {
      return NextResponse.json({ error: "Esta cédula ya está inscrita en la rifa" }, { status: 409 });
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
