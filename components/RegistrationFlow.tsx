"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Camera from "./Camera";
import { dataUrlToJpeg } from "@/lib/image";

type Person = {
  full_name: string; document_type: string; document_number: string;
  birth_date: string; city: string; rank: string; phone: string; email: string;
};
type Lookup = {
  found: boolean; source: "api" | "demo"; person: Person | null; photo: string | null; photoDate: string | null;
  apiError?: string; photoPending?: boolean; existing: { raffle_number: number; full_name: string; registered_by_name: string | null } | null;
};
type Saved = { number: number; name: string; photo: string | null };

const EMPTY: Person = { full_name: "", document_type: "CC", document_number: "", birth_date: "", city: "", rank: "", phone: "", email: "" };

function useObjectUrl(blob: Blob | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function yearsSince(date: string | null) {
  if (!date) return null;
  const y = (Date.now() - Date.parse(date)) / (365.25 * 24 * 3600 * 1000);
  return Number.isFinite(y) ? Math.floor(y) : null;
}

export default function RegistrationFlow({ digits }: { digits: number }) {
  const docRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState("");
  const [nat, setNat] = useState<"V" | "E">("V"); // cédula venezolana: V o E
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [fields, setFields] = useState<Person>(EMPTY);
  const [newPhoto, setNewPhoto] = useState<Blob | null>(null); // foto tomada con la cámara
  const [camera, setCamera] = useState<"photo" | "id" | null>(null);
  const [idPhoto, setIdPhoto] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [count, setCount] = useState(0);
  const searchId = useRef(0); // para ignorar respuestas de una consulta anterior
  const newPhotoUrl = useObjectUrl(newPhoto);
  const idPhotoUrl = useObjectUrl(idPhoto);

  const pad = (n: number) => String(n).padStart(digits, "0");
  const set = (k: keyof Person, v: string) => setFields((f) => ({ ...f, [k]: v }));
  const shownPhoto = newPhotoUrl ?? lookup?.photo ?? null;
  const photoAge = yearsSince(lookup?.photoDate ?? null);

  useEffect(() => { docRef.current?.focus(); }, []);

  function clear() {
    setLookup(null); setFields(EMPTY); setNewPhoto(null); setIdPhoto(null);
    setCamera(null); setError(null); searchId.current++;
  }

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = doc.replace(/\D/g, "");
    if (clean.length < 4) return setError("Escribe un número de cédula válido");
    clear(); setSaved(null); setLoading(true);
    const id = ++searchId.current;
    try {
      const r = await fetch(`/api/lookup?doc=${clean}&nat=${nat}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Error al consultar");
      setLookup(j);
      setFields({ ...EMPTY, document_type: nat, ...(j.person ?? {}), document_number: clean });
      // Sin foto: abrir la cámara directamente, salvo que la API haya fallado (así se ve el aviso)
      // o que Infopress aún esté preparando la foto (se pide en segundo plano).
      if (!j.photo && !j.existing && !j.apiError && !j.photoPending) setCamera("photo");
      if (j.photoPending && !j.existing) void waitPhoto(id, clean);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  // Infopress a veces entrega la foto unos segundos después: se vuelve a pedir sin bloquear el formulario.
  async function waitPhoto(id: number, clean: string) {
    for (const ms of [3000, 5000, 8000]) {
      await new Promise((r) => setTimeout(r, ms));
      if (searchId.current !== id) return;
      const j = await fetch(`/api/lookup?doc=${clean}&nat=${nat}`).then((r) => r.json()).catch(() => null);
      if (searchId.current !== id) return;
      if (j?.photo) return setLookup((l) => (l ? { ...l, photo: j.photo, photoPending: false } : l));
      if (!j?.photoPending) break;
    }
    if (searchId.current === id) setLookup((l) => (l ? { ...l, photoPending: false } : l));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!shownPhoto) return setError("Falta la foto de la persona. Tómala con la cámara.");
    setSaving(true);
    try {
      const photoBlob = newPhoto ?? (await dataUrlToJpeg(lookup!.photo!, 900));
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.set(k, v));
      fd.set("photo", photoBlob, "foto.jpg");
      fd.set("photo_source", newPhoto ? "camera" : "api");
      if (idPhoto) fd.set("id_document", idPhoto, "documento.jpg");
      const r = await fetch("/api/register", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo guardar");
      setSaved({ number: j.number, name: j.name, photo: shownPhoto });
      setCount((c) => c + 1);
      clear(); setDoc("");
      setTimeout(() => docRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flow">
      {saved && (
        <div className="card saved">
          {saved.photo && <img src={saved.photo} alt="" />}
          <div>
            <div className="small">✓ Registrado: {saved.name}</div>
            <div className="num">{pad(saved.number)}</div>
          </div>
        </div>
      )}

      <form className="card search" onSubmit={search}>
        <label htmlFor="doc" className="search-label">Número de cédula</label>
        <div className="search-row">
          <button type="button" className="btn secondary nat-btn" onClick={() => setNat((v) => (v === "V" ? "E" : "V"))}
            title="Cambiar entre V (venezolano) y E (extranjero)" aria-label={`Nacionalidad ${nat}, tocar para cambiar`}>{nat}</button>
          <input id="doc" ref={docRef} value={doc} inputMode="numeric" autoComplete="off" placeholder="Ej. 12345678"
            onChange={(e) => setDoc(e.target.value.replace(/[^\d.]/g, ""))} />
          <button className="btn" disabled={loading}>{loading ? <span className="spinner" /> : "Consultar"}</button>
        </div>
        {loading && <div className="small" style={{ marginTop: 6 }}>Consultando… si la persona no se ha consultado antes, puede tardar hasta 2 minutos.</div>}
        {count > 0 && <div className="small" style={{ marginTop: 6 }}>Registrados en esta sesión: {count}</div>}
        {!lookup && error && <p className="error">{error}</p>}
      </form>

      {lookup?.existing && (
        <div className="card error-card">
          ⚠️ Esta cédula ya está inscrita con el número <strong>{pad(lookup.existing.raffle_number)}</strong> ({lookup.existing.full_name}
          {lookup.existing.registered_by_name ? `, registrado por ${lookup.existing.registered_by_name}` : ""}).
        </div>
      )}

      {lookup && !lookup.existing && (
        <form className="card preview" onSubmit={save}>
          <div className="person-head">
            <button type="button" className="photo-frame" onClick={() => setCamera(camera === "photo" ? null : "photo")}
              aria-label={shownPhoto ? "Actualizar foto" : "Tomar foto"}>
              {shownPhoto ? <img src={shownPhoto} alt="Foto de la persona" />
                : lookup.photoPending ? <span className="no-photo"><span className="spinner" /><br />Cargando foto…</span>
                : <span className="no-photo">📸<br />Sin foto</span>}
              {shownPhoto && <span className="photo-src">{newPhoto ? "Nueva" : "API"}</span>}
            </button>
            <div className="person-info">
              <div className="preview-head">
                {lookup.source === "demo" && <span className="badge">Demo</span>}
                {lookup.found
                  ? <span className="badge on">Encontrado</span>
                  : <span className="badge warn">{lookup.apiError ? "API no disponible" : "No encontrado"}</span>}
              </div>
              <input className="name-input" aria-label="Nombre completo" placeholder="Nombre completo" value={fields.full_name}
                onChange={(e) => set("full_name", e.target.value)} required minLength={3} />
              <div className="doc-line">
                <select aria-label="Tipo de documento" value={fields.document_type} onChange={(e) => set("document_type", e.target.value)}>
                  <option value="V">V</option><option value="E">E</option><option value="CC">CC</option><option value="CE">CE</option><option value="TI">TI</option>
                  <option value="PAS">PAS</option><option value="DNI">DNI</option><option value="OTRO">Otro</option>
                </select>
                <strong>{fields.document_number}</strong>
              </div>
              <div className="photo-actions">
                <button type="button" className="link" onClick={() => setCamera(camera === "photo" ? null : "photo")}>
                  📸 {camera === "photo" ? "Cancelar cámara" : shownPhoto ? "Actualizar foto" : "Tomar foto"}
                </button>
                {newPhoto && lookup.photo && camera !== "photo" && (
                  <button type="button" className="link" onClick={() => setNewPhoto(null)}>↩ Foto API</button>
                )}
              </div>
              {!newPhoto && photoAge !== null && photoAge >= 5 && camera !== "photo" && (
                <div className="small warn-text">Foto de hace ~{photoAge} años</div>
              )}
            </div>
          </div>

          {camera === "photo" && (
            <Camera facing="environment" guide="face" maxSide={900} onCapture={(b) => { setNewPhoto(b); setCamera(null); }} />
          )}

          {!lookup.found && lookup.apiError && <p className="small warn-text" style={{ textAlign: "left" }}>{lookup.apiError}</p>}

          {camera !== "photo" && <>

          <div className="grid two">
            <div className="full">
              <label htmlFor="rank">Grado</label>
              <input id="rank" value={fields.rank} onChange={(e) => set("rank", e.target.value)} maxLength={80} placeholder="Ej. Capitán" />
            </div>
            <div>
              <label htmlFor="birth_date">Nacimiento</label>
              <input id="birth_date" type="date" value={fields.birth_date} onChange={(e) => set("birth_date", e.target.value)} required />
            </div>
            <div>
              <label htmlFor="phone">Teléfono</label>
              <input id="phone" type="tel" inputMode="tel" value={fields.phone} onChange={(e) => set("phone", e.target.value)} required minLength={7} />
            </div>
            <div>
              <label htmlFor="email">Correo <span className="small">(opc.)</span></label>
              <input id="email" type="email" value={fields.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>

          {camera === "id" ? (
            <Camera facing="environment" guide="card" maxSide={1800} onCapture={(b) => { setIdPhoto(b); setCamera(null); }} />
          ) : idPhotoUrl ? (
            <div className="id-thumb"><img src={idPhotoUrl} alt="Cédula" />
              <button type="button" className="link" onClick={() => setIdPhoto(null)}>Quitar foto de la cédula</button></div>
          ) : (
            <button type="button" className="link" onClick={() => setCamera("id")}>＋ Foto de la cédula (opcional)</button>
          )}

          {error && <div className="error">{error}</div>}
          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving || camera !== null}>
              {saving ? "Guardando…" : "✓ Guardar"}
            </button>
            <button type="button" className="btn secondary" onClick={() => { clear(); setDoc(""); docRef.current?.focus(); }}>Cancelar</button>
          </div>
          </>}
        </form>
      )}
    </div>
  );
}
