"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  facing: "user" | "environment";
  guide: "face" | "card";
  onCapture: (jpeg: Blob) => void;
  maxSide: number;
};

// Cámara en vivo con guía de encuadre. Si no hay cámara o se niega el permiso, permite subir un archivo.
export default function Camera({ facing, guide, onCapture, maxSide }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState(facing);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async (m: "user" | "environment") => {
    stop();
    setReady(false);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: m }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch {
      setError("No se pudo abrir la cámara. Revisa los permisos o sube una foto.");
    }
  }, []);

  useEffect(() => {
    start(mode);
    return stop;
  }, [mode, start]);

  function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    const ctx = c.getContext("2d")!;
    if (mode === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); } // guardar como se ve en el espejo
    ctx.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((b) => b && onCapture(b), "image/jpeg", 0.88);
  }

  async function fromFile(f: File | undefined) {
    if (!f) return;
    const { toJpeg } = await import("@/lib/image");
    onCapture(await toJpeg(f, maxSide, 0.88));
  }

  return (
    <div className="camera">
      <div className={`viewport ${mode === "user" ? "mirror" : ""}`}>
        <video ref={videoRef} playsInline muted />
        <div className={`guide ${guide}`} />
        {!ready && !error && <div className="cam-msg">Abriendo cámara…</div>}
        {error && <div className="cam-msg">{error}</div>}
      </div>
      <div className="cam-actions">
        <button type="button" className="btn shutter" onClick={shoot} disabled={!ready}>📸 Tomar foto</button>
        <button type="button" className="btn secondary" onClick={() => setMode(mode === "user" ? "environment" : "user")}>
          🔄 Cambiar
        </button>
        <label className="btn secondary">
          📁 Archivo
          <input type="file" accept="image/*" hidden onChange={(e) => fromFile(e.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}
