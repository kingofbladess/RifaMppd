"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Camera from "./Camera";
import { dataUrlToJpeg } from "@/lib/image";
import { esMilitar } from "@/lib/grados";
import { colaDisponible, enviarRegistro, formularioRegistro, guardarEnCola, listarCola, quitarDeCola, type Pendiente } from "@/lib/cola-registro";

type Person = {
  full_name: string; document_type: string; document_number: string;
  birth_date: string; city: string; rank: string; phone: string; email: string;
};
type Lookup = {
  found: boolean; source: "api" | "demo"; person: Person | null; photo: string | null; photoDate: string | null;
  apiError?: string; photoPending?: boolean;
  invited?: boolean | null; // ¿en la lista de invitados? null = no hay lista cargada
  existing: { raffle_number: number; full_name: string; registered_by_name: string | null } | null;
};
type Saved = { number: number; name: string; photo: string | null };

const EMPTY: Person = { full_name: "", document_type: "V", document_number: "", birth_date: "", city: "", rank: "", phone: "", email: "" };

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

// 16239367 -> 16.239.367 (más fácil de comparar con la cédula física)
function groupDigits(n: string) {
  return n.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const QrScanner = dynamic(() => import("./QrScanner"), { ssr: false });
type QrRead = import("./QrScanner").QrRead;

// Código único por intento de registro (crypto.randomUUID existe en HTTPS; si no, se arma uno igual).
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default function RegistrationFlow({ digits }: { digits: number }) {
  const docRef = useRef<HTMLInputElement>(null);
  const [doc, setDoc] = useState("");
  const [natState, setNat] = useState<"V" | "E">("V");
  const nat = natState; // cédula venezolana: V o E
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
  const [scanning, setScanning] = useState(false);
  const searchId = useRef(0); // para ignorar respuestas de una consulta anterior
  const requestId = useRef(newId()); // código del intento de registro: repetir Guardar no duplica ni falla
  const [notice, setNotice] = useState<string | null>(null); // aviso (no error): p. ej. "quedó en la cola"
  const [cola, setCola] = useState<Pendiente[]>([]); // registros guardados en el teléfono mientras no hay internet
  const flushing = useRef(false);
  const newPhotoUrl = useObjectUrl(newPhoto);
  const idPhotoUrl = useObjectUrl(idPhoto);

  const pad = (n: number) => String(n).padStart(digits, "0");
  const set = (k: keyof Person, v: string) => setFields((f) => ({ ...f, [k]: v }));
  const shownPhoto = newPhotoUrl ?? lookup?.photo ?? null;
  const photoAge = yearsSince(lookup?.photoDate ?? null);
  const age = yearsSince(fields.birth_date || null);

  useEffect(() => { docRef.current?.focus(); }, []);

  // ---------- Cola sin internet ----------
  const refreshCola = useCallback(async () => {
    if (!colaDisponible()) return;
    try { setCola(await listarCola()); } catch { /* sin IndexedDB (modo privado): no hay cola */ }
  }, []);
  // Envía los pendientes en orden; se detiene al primer fallo de red (se reintenta en el siguiente ciclo).
  const flush = useCallback(async () => {
    if (flushing.current || !colaDisponible()) return;
    flushing.current = true;
    try {
      const now = Date.now();
      for (const p of await listarCola()) {
        // Los ya enviados se muestran 1 minuto con su número (para decírselo a la persona) y luego desaparecen solos.
        if (p.status === "enviado") { if (now - (p.sentAt ?? p.at) > 60_000) await quitarDeCola(p.id); continue; }
        if (p.status !== "pendiente") continue;
        const r = await enviarRegistro(formularioRegistro(p));
        if (r.ok) {
          await guardarEnCola({ ...p, status: "enviado", number: r.number, sentAt: Date.now(), photo: new Blob(), idPhoto: null, error: undefined });
          setCount((c) => c + 1);
        } else if (r.reintentar) break;
        else await guardarEnCola({ ...p, status: "error", error: r.error });
      }
    } catch { /* se reintenta en el siguiente ciclo */ } finally {
      flushing.current = false;
      await refreshCola();
    }
  }, [refreshCola]);
  useEffect(() => {
    void refreshCola().then(flush);
    const iv = setInterval(() => { void flush(); }, 15_000);
    const onOnline = () => { void flush(); };
    window.addEventListener("online", onOnline);
    return () => { clearInterval(iv); window.removeEventListener("online", onOnline); };
  }, [refreshCola, flush]);
  const pendientes = cola.filter((p) => p.status === "pendiente").length;
  const enCola = (docNum: string) => cola.find((p) => p.doc === docNum && p.status !== "enviado");
  async function quitar(p: Pendiente) {
    if (p.status !== "enviado" && !confirm(`¿Quitar a ${p.name} de la cola? Su registro NO quedará guardado.`)) return;
    try { await quitarDeCola(p.id); } finally { await refreshCola(); }
  }
  async function reintentar(p: Pendiente) {
    try { await guardarEnCola({ ...p, status: "pendiente", error: undefined }); } finally { await refreshCola(); void flush(); }
  }

  function clear() {
    setLookup(null); setFields(EMPTY); setNewPhoto(null); setIdPhoto(null);
    setCamera(null); setError(null); searchId.current++; requestId.current = newId();
  }

  // QR del documento: llena la cédula y consulta sola.
  // Carnet SIDEFENSA: el QR trae un código; Infopress devuelve la cédula y los datos de la persona.
  const onScan = useCallback((c: QrRead) => {
    setScanning(false);
    if ("code" in c) { setDoc(""); void search(undefined, undefined, undefined, c.code); return; }
    setNat(c.nat);
    setDoc(c.number);
    void search(undefined, c.number, c.nat);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(e?: React.FormEvent, docArg?: string, natArg?: "V" | "E", qrCode?: string) {
    e?.preventDefault();
    let nat = natArg ?? natState;
    let clean = (docArg ?? doc).replace(/\D/g, "");
    if (!qrCode && clean.length < 4) return setError("Escribe un número de cédula válido");
    clear(); setSaved(null); setNotice(null); setLoading(true);
    const id = ++searchId.current;
    try {
      const r = await fetch(qrCode ? `/api/lookup?qr=${encodeURIComponent(qrCode)}` : `/api/lookup?doc=${clean}&nat=${nat}`);
      const j = await r.json();
      if (searchId.current !== id) return;
      if (!r.ok) throw new Error(j.error ?? "Error al consultar");
      if (qrCode) { nat = j.nat; clean = j.doc; setNat(nat); setDoc(clean); }
      setLookup(j);
      setFields({ ...EMPTY, document_type: nat, ...(j.person ?? {}), document_number: clean });
      // Sin foto: abrir la cámara directamente, salvo que la API haya fallado (así se ve el aviso)
      // o que Infopress aún esté preparando la foto (se pide en segundo plano).
      if (!j.photo && !j.existing && !j.apiError && !j.photoPending) setCamera("photo");
      // Foto pendiente: con QR se repite la misma consulta QR (así lo pide Infopress); si no, la de cédula.
      if (j.photoPending && !j.existing) void waitPhoto(id, qrCode ? `qr=${encodeURIComponent(qrCode)}` : `doc=${clean}&nat=${nat}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  // Infopress a veces entrega la foto unos segundos después: se vuelve a pedir sin bloquear el formulario.
  async function waitPhoto(id: number, query: string) {
    for (const ms of [3000, 5000, 8000]) {
      await new Promise((r) => setTimeout(r, ms));
      if (searchId.current !== id) return;
      const j = await fetch(`/api/lookup?${query}`).then((r) => r.json()).catch(() => null);
      if (searchId.current !== id) return;
      if (j?.photo) return setLookup((l) => (l ? { ...l, photo: j.photo, photoPending: false } : l));
      if (!j?.photoPending) break;
    }
    if (searchId.current === id) setLookup((l) => (l ? { ...l, photoPending: false } : l));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null);
    if (!shownPhoto) return setError("Falta la foto de la persona. Tómala con la cámara.");
    const queued = enCola(fields.document_number);
    if (queued && queued.id !== requestId.current) return setError("Esta cédula ya está en la cola de pendientes (se enviará sola).");
    setSaving(true);
    try {
      const photoBlob = newPhoto ?? (await dataUrlToJpeg(lookup!.photo!, 640));
      const item = { id: requestId.current, fields: { ...fields }, photo: photoBlob, idPhoto, photoSource: (newPhoto ? "camera" : "api") as Pendiente["photoSource"] };
      // Si el servidor no responde en 60 s se avisa; volver a enviar es seguro (mismo código).
      const r = await enviarRegistro(formularioRegistro(item));
      if (r.ok) {
        setSaved({ number: r.number, name: r.name, photo: shownPhoto });
        setCount((c) => c + 1);
        clear(); setDoc("");
        setTimeout(() => docRef.current?.focus(), 50);
        void flush(); // si había pendientes y volvió el internet, salen ya
        return;
      }
      if (!r.reintentar) throw new Error(r.error);
      // Sin internet (o la laptop no responde): el registro queda en el teléfono y se envía solo después.
      let enColaOk = false;
      if (colaDisponible()) {
        try {
          await guardarEnCola({ ...item, name: fields.full_name, doc: fields.document_number, at: Date.now(), status: "pendiente" });
          enColaOk = true;
        } catch { /* el teléfono no deja guardar (modo privado o sin espacio) */ }
      }
      if (!enColaOk) throw new Error(`${r.error}. Presiona Guardar otra vez cuando vuelva la conexión (no se duplica).`);
      await refreshCola();
      setSaved(null);
      clear(); setDoc("");
      setNotice(`Sin conexión: ${fields.full_name} quedó en la cola del teléfono y se enviará sola cuando vuelva el internet. Puedes seguir registrando.`);
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

      {notice && <div className="card warn-card small">📥 {notice}</div>}

      {cola.length > 0 && (
        <div className="card cola">
          <div className="cola-head">
            <strong>{pendientes ? `📤 ${pendientes} sin enviar` : "📤 Cola del teléfono"}</strong>
            <span className="small">{pendientes ? "Se envían solos cuando vuelva el internet. No borres los datos del navegador." : "Todo enviado. Los enviados desaparecen solos en un minuto."}</span>
            {pendientes > 0 && <button type="button" className="link" onClick={() => void flush()}>Enviar ahora</button>}
          </div>
          <ul>
            {[...cola].reverse().map((p) => (
              <li key={p.id} className={`cola-item ${p.status}`}>
                <div className="cola-who"><span className="cola-name">{p.name}</span><span className="small">{groupDigits(p.doc)}</span></div>
                {p.status === "enviado" ? <strong className="cola-num">N.º {pad(p.number ?? 0)}</strong>
                  : p.status === "error" ? <span className="small cola-err">{p.error}</span>
                  : <span className="small">⏳ en espera</span>}
                <span className="cola-actions">
                  {p.status === "error" && <button type="button" className="link" onClick={() => void reintentar(p)}>Reintentar</button>}
                  {p.status !== "pendiente" && <button type="button" className="link" onClick={() => void quitar(p)}>{p.status === "enviado" ? "Listo" : "Quitar"}</button>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="card search" onSubmit={search}>
        <div className="search-title">
          <label htmlFor="doc">Consultar cédula</label>
          {count > 0 && <span className="chip">Registrados: {count}</span>}
        </div>
        <div className="search-row">
          <div className="doc-group">
            <button type="button" className="nat-btn" onClick={() => setNat((v) => (v === "V" ? "E" : "V"))}
              title="Cambiar entre V (venezolano) y E (extranjero)" aria-label={`Nacionalidad ${nat}, tocar para cambiar`}>{nat}</button>
            <input id="doc" ref={docRef} value={doc} inputMode="numeric" autoComplete="off" placeholder="Número de cédula"
              onChange={(e) => setDoc(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <button className="btn" disabled={loading}>{loading ? <span className="spinner" /> : "Consultar"}</button>
        </div>
        <button type="button" className="link qr-btn" onClick={() => { setScanning((v) => !v); setError(null); }} disabled={loading}>
          {scanning ? "✕ Cerrar escáner" : "▣ Escanear QR del carnet"}
        </button>
        {scanning && <QrScanner onResult={onScan} onClose={() => setScanning(false)} />}
        {loading && <div className="small search-hint">Consultando… si la persona no se ha consultado antes, puede tardar hasta 2 minutos.</div>}
        {!lookup && error && <p className="error">{error}</p>}
      </form>

      {lookup?.existing && (
        <div className="card error-card">
          ⚠️ Esta cédula ya está inscrita con el número <strong>{pad(lookup.existing.raffle_number)}</strong> ({lookup.existing.full_name}
          {lookup.existing.registered_by_name ? `, registrado por ${lookup.existing.registered_by_name}` : ""}).
        </div>
      )}

      {lookup && !lookup.existing && enCola(fields.document_number) && enCola(fields.document_number)!.id !== requestId.current && (
        <div className="card error-card">⚠️ Esta cédula ya está en la cola de pendientes de este teléfono (se enviará sola).</div>
      )}

      {lookup && !lookup.existing && lookup.invited === false && (
        <div className="card warn-card">
          ⚠️ <strong>No está en la lista de invitados.</strong> Puedes registrarlo, pero no saldrá en la ruleta.
        </div>
      )}

      {lookup && !lookup.existing && (
        <form className="card preview" onSubmit={save}>
          <div className="person-head">
            <button type="button" className="photo-frame" onClick={() => setCamera(camera === "photo" ? null : "photo")}
              aria-label={shownPhoto ? "Actualizar foto" : "Tomar foto"}>
              {shownPhoto ? <img src={shownPhoto} alt="Foto de la persona"
                  // Si este teléfono no puede mostrar la foto de la API (p. ej. AVIF en un modelo viejo), se descarta
                  // y se abre la cámara, en vez de quedar una foto rota o fallar al guardar.
                  onError={() => { if (!newPhoto) { setLookup((l) => (l ? { ...l, photo: null } : l)); setCamera("photo"); } }} />
                : lookup.photoPending ? <span className="no-photo"><span className="spinner" /><br />Cargando foto…</span>
                : <span className="no-photo">📸<br />Sin foto</span>}
              {shownPhoto && <span className="photo-src">{newPhoto ? "Nueva" : "API"}</span>}
            </button>
            <div className="person-info">
              <div className="preview-head">
                {lookup.found
                  ? <span className="badge on">✓ Encontrado</span>
                  : <span className="badge warn">{lookup.apiError ? "API no disponible" : "No encontrado"}</span>}
                {lookup.found && (esMilitar(fields.rank) ? <span className="badge">Militar</span>
                  : fields.rank.trim() ? <span className="badge warn" title="Este grado no está en la lista de la ruleta: sorteará como civil">Grado no reconocido</span>
                  : <span className="badge">Civil</span>)}
                {lookup.invited === true && <span className="badge on">✓ Invitado</span>}
                {lookup.invited === false && <span className="badge warn">No invitado</span>}
                {lookup.source === "demo" && <span className="badge">Demo</span>}
              </div>
              <input className="name-input" aria-label="Nombre completo" placeholder="Nombre completo" value={fields.full_name}
                onChange={(e) => set("full_name", e.target.value)} required minLength={3} />
              <div className="doc-line">
                <select aria-label="Tipo de documento" value={fields.document_type} onChange={(e) => set("document_type", e.target.value)}>
                  <option value="V">V</option><option value="E">E</option><option value="CC">CC</option><option value="CE">CE</option><option value="TI">TI</option>
                  <option value="PAS">PAS</option><option value="DNI">DNI</option><option value="OTRO">Otro</option>
                </select>
                <strong>{groupDigits(fields.document_number)}</strong>
              </div>
              <div className="photo-actions">
                <button type="button" className="link" onClick={() => setCamera(camera === "photo" ? null : "photo")}>
                  📷 {camera === "photo" ? "Cancelar cámara" : shownPhoto ? "Cambiar foto" : "Tomar foto"}
                </button>
                {newPhoto && lookup.photo && camera !== "photo" && (
                  <button type="button" className="link" onClick={() => setNewPhoto(null)}>↩ Usar foto API</button>
                )}
              </div>
              {!newPhoto && photoAge !== null && photoAge >= 5 && camera !== "photo" && (
                <div className="small warn-text">Foto de hace ~{photoAge} años</div>
              )}
            </div>
          </div>

          {camera === "photo" && (
            <Camera facing="environment" guide="face" maxSide={640} onCapture={(b) => { setNewPhoto(b); setCamera(null); }} />
          )}

          {!lookup.found && lookup.apiError && <p className="small warn-text" style={{ textAlign: "left" }}>{lookup.apiError}</p>}

          {camera !== "photo" && <>

          <div className="data-grid">
            <div className="field full">
              <label htmlFor="rank">Grado</label>
              <input id="rank" value={fields.rank} onChange={(e) => set("rank", e.target.value)} maxLength={80} placeholder="Vacío si es civil" />
            </div>
            <div className="field">
              <label htmlFor="birth_date">Fecha de nacimiento</label>
              <input id="birth_date" type="date" value={fields.birth_date} onChange={(e) => set("birth_date", e.target.value)} required />
            </div>
            <div className="field">
              <span className="field-label">Edad</span>
              <div className="field-value">{age !== null && age >= 0 ? `${age} años` : "—"}</div>
            </div>
          </div>

          {camera === "id" ? (
            <Camera facing="environment" guide="card" maxSide={1600} onCapture={(b) => { setIdPhoto(b); setCamera(null); }} />
          ) : idPhotoUrl ? (
            <div className="id-thumb"><img src={idPhotoUrl} alt="Cédula" />
              <button type="button" className="link" onClick={() => setIdPhoto(null)}>Quitar foto de la cédula</button></div>
          ) : (
            <button type="button" className="id-add" onClick={() => setCamera("id")}>＋ Foto de la cédula <span>(opcional)</span></button>
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
