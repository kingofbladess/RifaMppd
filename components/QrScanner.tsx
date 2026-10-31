"use client";

import { useEffect, useRef, useState } from "react";
import { parseCedula, type QrCedula } from "@/lib/qr-cedula";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

// Lector de QR / código de barras del documento. Todo ocurre en el teléfono (sin internet):
// usa el lector del navegador si existe (Chrome en Android) y si no, jsQR.
export default function QrScanner({ onResult, onClose }: { onResult: (c: QrCedula) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [msg, setMsg] = useState("Abriendo cámara…");
  const [lastText, setLastText] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null, raf = 0, stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    let detector: Detector | null = null;
    let jsQR: typeof import("jsqr").default | null = null;
    let busy = false, lastTry = 0;

    const found = (text: string) => {
      const c = parseCedula(text);
      if (c && !done.current) {
        done.current = true;
        navigator.vibrate?.(80);
        onResult(c);
      } else if (!c) {
        setLastText(text.slice(0, 160));
        setMsg("Leí un código pero no encontré la cédula. Prueba con otro código del documento o escríbela.");
      }
    };

    const tick = async (now: number) => {
      if (stopped || done.current) return;
      raf = requestAnimationFrame(tick);
      const v = videoRef.current;
      if (busy || !v || v.readyState < 2 || now - lastTry < 120) return; // ~8 lecturas por segundo
      lastTry = now; busy = true;
      try {
        if (detector) {
          const codes = await detector.detect(v);
          if (codes[0]?.rawValue) found(codes[0].rawValue);
        } else if (jsQR) {
          const scale = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight));
          canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
          if (code?.data) found(code.data);
        }
      } catch { /* cuadro ilegible: se intenta con el siguiente */ } finally { busy = false; }
    };

    (async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: { new (o: object): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
        if (BD) {
          const supported = (await BD.getSupportedFormats?.().catch(() => [])) ?? [];
          const formats = ["qr_code", "pdf417", "data_matrix", "aztec", "code_128"].filter((f) => supported.includes(f));
          if (formats.includes("qr_code")) detector = new BD({ formats });
        }
        if (!detector) jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setMsg("Apunta al código QR del documento");
        raf = requestAnimationFrame(tick);
      } catch {
        setMsg("No se pudo abrir la cámara. Revisa los permisos o escribe la cédula.");
      }
    })();

    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [onResult]);

  return (
    <div className="qr-scan">
      <div className="viewport">
        <video ref={videoRef} playsInline muted />
        <div className="qr-guide" />
      </div>
      <p className="small qr-msg">{msg}</p>
      {lastText && <p className="small qr-raw">Texto leído: {lastText}</p>}
      <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
    </div>
  );
}
