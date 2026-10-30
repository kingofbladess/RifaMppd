"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type WheelParticipant = { id: string; name: string; number: number; rank: string | null; photoUrl: string | null };

const COLORS = ["#ff2e88", "#ffb703", "#00a896", "#7b2ff7", "#ff6b35", "#2f80ff", "#06d6a0", "#c026d3"];
// Texto oscuro sobre los colores claros (amarillo y verde menta) para que se lea bien.
const LIGHT = new Set(["#ffb703", "#06d6a0"]);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const SIZE = 1000;
const TAU = Math.PI * 2;
const SPIN_MS = 8000;

const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

export default function Wheel({ participants, digits }: { participants: WheelParticipant[]; digits: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(0);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [spinning, setSpinning] = useState(false);
  const [current, setCurrent] = useState<WheelParticipant | null>(null);
  const [winner, setWinner] = useState<WheelParticipant | null>(null);
  const [history, setHistory] = useState<WheelParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const n = participants.length;
  const seg = n ? TAU / n : TAU;
  const showPhotos = n <= 40;
  const showNames = n <= 80;
  const showNumbers = n <= 400; // con más, la ruleta queda como disco de colores y el recuadro muestra a quién señala

  const pad = (num: number) => String(num).padStart(digits, "0");

  const indexAtPointer = useCallback((r: number) => {
    const a = (((-Math.PI / 2 - r) % TAU) + TAU) % TAU;
    return Math.floor(a / seg) % n;
  }, [seg, n]);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !n) return;
    const c = SIZE / 2, R = c - 10, r = rotation.current;
    ctx.clearRect(0, 0, SIZE, SIZE);

    if (!showNumbers) {
      // Muchos participantes: 24 franjas de color (cada una agrupa varias porciones) para que gire fluido.
      const BANDS = 24, band = TAU / BANDS;
      for (let b = 0; b < BANDS; b++) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, R, r + b * band, r + (b + 1) * band);
        ctx.closePath();
        ctx.fillStyle = COLORS[b % COLORS.length];
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (showNumbers) participants.forEach((p, i) => {
      const a0 = r + i * seg, a1 = a0 + seg, mid = a0 + seg / 2;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.6)";
      ctx.lineWidth = n <= 150 ? 2 : 0.5;
      ctx.stroke();

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(mid);
      // Foto circular cerca del borde
      const img = p.photoUrl ? images.current.get(p.photoUrl) : undefined;
      let textEnd = R - 20;
      if (showPhotos) {
        const pr = Math.min(48, Math.max(14, Math.sin(seg / 2) * (R - 70) * 0.85));
        const px = R - pr - 14;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, 0, pr, 0, TAU);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.clip();
        if (img?.complete && img.naturalWidth) {
          const s = Math.max((pr * 2) / img.naturalWidth, (pr * 2) / img.naturalHeight);
          const w = img.naturalWidth * s, h = img.naturalHeight * s;
          ctx.translate(px, 0);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
          // Sin foto: iniciales sobre el color de la porción
          ctx.fillStyle = COLORS[i % COLORS.length];
          ctx.globalAlpha = .25;
          ctx.fillRect(px - pr, -pr, pr * 2, pr * 2);
          ctx.globalAlpha = 1;
          ctx.translate(px, 0);
          ctx.rotate(Math.PI / 2);
          ctx.fillStyle = "#1f1235";
          ctx.font = `800 ${Math.round(pr * .8)}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(initials(p.name), 0, 1);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(px, 0, pr, 0, TAU);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        ctx.stroke();
        textEnd = px - pr - 10;
      }
      // Nombre y número a lo largo del radio
      ctx.fillStyle = LIGHT.has(COLORS[i % COLORS.length]) ? "#1f1235" : "#fff";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const fs = Math.max(11, Math.min(30, Math.sin(seg / 2) * textEnd * 0.9));
      ctx.font = `700 ${fs}px system-ui, sans-serif`;
      const first = p.name.split(" ").slice(0, 2).join(" ");
      const label = showNames ? `${pad(p.number)} · ${first}` : pad(p.number);
      let t = label;
      while (ctx.measureText(t).width > textEnd - 90 && t.length > 4) t = t.slice(0, -2);
      ctx.fillText(t === label ? t : t + "…", textEnd, 0);
      ctx.restore();
    });

    // Centro
    ctx.beginPath();
    ctx.arc(c, c, 60, 0, TAU);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#1f1235";
    ctx.stroke();
    ctx.fillStyle = "#1f1235";
    ctx.font = "800 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎟️", c, c);
  }, [participants, n, seg, showPhotos, showNames, showNumbers, digits]); // eslint-disable-line react-hooks/exhaustive-deps

  // Precarga de fotos
  useEffect(() => {
    if (!showPhotos) return;
    participants.forEach((p) => {
      if (!p.photoUrl || images.current.has(p.photoUrl)) return;
      const img = new Image();
      img.onload = () => draw();
      img.src = p.photoUrl;
      images.current.set(p.photoUrl, img);
    });
  }, [participants, showPhotos, draw]);

  useEffect(() => {
    draw();
    if (n) setCurrent(participants[indexAtPointer(rotation.current)]);
  }, [draw, n, participants, indexAtPointer]);

  async function spin() {
    if (spinning || !n) return;
    setError(null);
    setWinner(null);
    setSpinning(true);
    try {
      const res = await fetch("/api/draw", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo sortear");
      const idx = participants.findIndex((p) => p.id === json.participantId);
      if (idx < 0) throw new Error("El ganador no está en la ruleta. Recarga la página.");

      const start = rotation.current;
      // Ángulo final: centro del segmento ganador bajo el puntero (arriba), con un pequeño desvío aleatorio
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      let target = -Math.PI / 2 - (idx + 0.5) * seg + jitter;
      const minEnd = start + TAU * 7;
      target += Math.ceil((minEnd - target) / TAU) * TAU;

      const t0 = performance.now();
      let lastIdx = -1;
      await new Promise<void>((done) => {
        const frame = (now: number) => {
          const t = Math.min(1, (now - t0) / SPIN_MS);
          rotation.current = start + (target - start) * easeOut(t);
          draw();
          const i = indexAtPointer(rotation.current);
          if (i !== lastIdx) { lastIdx = i; setCurrent(participants[i]); }
          if (t < 1) requestAnimationFrame(frame); else done();
        };
        requestAnimationFrame(frame);
      });
      const w = participants[idx];
      setWinner(w);
      setHistory((h) => [w, ...h]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSpinning(false);
    }
  }

  if (!n) return <div className="card">Aún no hay participantes inscritos.</div>;

  const shown = winner ?? current;
  return (
    <div className="stage">
      <div className="wheel-box">
        <div className="pointer" />
        <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-label="Ruleta de participantes" />
      </div>
      <aside className="card winner">
        <div className="small">{winner ? "🎉 ¡Ganador!" : spinning ? "Girando…" : "En el puntero"}</div>
        {shown?.photoUrl
          ? <img src={shown.photoUrl} alt={shown.name} />
          : <div className="avatar initials" style={{ width: 160, height: 160, margin: "0 auto", fontSize: "3.4rem" }}>{shown ? initials(shown.name) : ""}</div>}
        <div className="num">{shown ? pad(shown.number) : "—"}</div>
        <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{shown?.name}</div>
        {shown?.rank && <div className="small">{shown.rank}</div>}
        <p className="small">{n} participantes</p>
        <button className="btn" onClick={spin} disabled={spinning} style={{ width: "100%", fontSize: "1.1rem" }}>
          {spinning ? "Girando…" : "🎡 Girar ruleta"}
        </button>
        {error && <p className="error">{error}</p>}
        {history.length > 0 && (
          <div style={{ textAlign: "left", marginTop: 16 }}>
            <div className="small">Ganadores en esta sesión</div>
            <ul className="history" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {history.map((h, i) => (
                <li key={i}>
                  {h.photoUrl && <img className="avatar" src={h.photoUrl} alt="" style={{ border: 0, width: 40, height: 40 }} />}
                  <strong>{pad(h.number)}</strong> {h.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
