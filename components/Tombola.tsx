"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Fireworks from "./Fireworks";
import { useSounds } from "./useSounds";

export type DrawParticipant = { id: string; name: string; number: number; rank: string | null; photoUrl: string | null };

type Ball = { x: number; y: number; vx: number; vy: number; color: string; label: number };
type Phase = "idle" | "mixing" | "extract" | "reveal" | "done";

const SIZE = 1000;
const C = { x: 500, y: 390 };        // centro del bombo
const R = 290;                         // radio interior del bombo
const BR = 36;                         // radio de cada bolita
const MAX_BALLS = 40;
const COLORS = ["#c8102e", "#0f7b3f", "#d4a017", "#1f6fd1", "#8e9aab"];
// Salida del bombo (abajo a la derecha) → tubo → bandeja
const OUT = { x: C.x + Math.cos(Math.PI / 4) * R, y: C.y + Math.sin(Math.PI / 4) * R };
const CHUTE = [OUT, { x: 790, y: 690 }, { x: 830, y: 780 }, { x: 860, y: 880 }];
const MIX_MS = 4800;

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const ease = (t: number) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function pointOn(path: { x: number; y: number }[], f: number) {
  const segs = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
  let d = f * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const t = segs[i] ? Math.min(1, d / segs[i]) : 1;
      return { x: path[i].x + (path[i + 1].x - path[i].x) * t, y: path[i].y + (path[i + 1].y - path[i].y) * t };
    }
    d -= segs[i];
  }
  return path[path.length - 1];
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, label: string) {
  const g = ctx.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
  g.addColorStop(0, "#ffffff"); g.addColorStop(.25, color); g.addColorStop(1, shade(color, -.45));
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r * .58, 0, Math.PI * 2); ctx.fillStyle = "#fffdf6"; ctx.fill();
  ctx.fillStyle = "#2a0a10";
  const fs = r * (label.length <= 2 ? .6 : label.length === 3 ? .48 : .38);
  ctx.font = `800 ${fs}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + fs * .05);
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (k < 0 ? v * k : (255 - v) * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export default function Tombola({ participants, digits }: { participants: DrawParticipant[]; digits: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>([]);
  const phaseRef = useRef<Phase>("idle");
  const cage = useRef(0);
  const flying = useRef<{ ball: Ball; t0: number } | null>(null);
  const lastClack = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [winner, setWinner] = useState<DrawParticipant | null>(null);
  const [revealed, setRevealed] = useState<string>("");
  const [showWin, setShowWin] = useState(false);
  const [history, setHistory] = useState<DrawParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sounds = useSounds();
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;

  const n = participants.length;
  const pad = useCallback((num: number) => String(num).padStart(digits, "0"), [digits]);
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  const randomLabel = useCallback(() => participants[Math.floor(Math.random() * n)]?.number ?? 0, [participants, n]);
  const newBall = useCallback((i: number): Ball => {
    const a = Math.random() * Math.PI * 2, d = Math.random() * (R - BR * 2);
    return { x: C.x + Math.cos(a) * d, y: C.y + Math.sin(a) * d * .5 + R * .3, vx: 0, vy: 0, color: COLORS[i % COLORS.length], label: randomLabel() };
  }, [randomLabel]);

  // Bolitas visibles: hasta 40 con números reales de los participantes
  useEffect(() => {
    balls.current = Array.from({ length: Math.min(MAX_BALLS, n) }, (_, i) => newBall(i));
  }, [n, newBall]);

  // Física + dibujo en un solo ciclo de animación
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(2, (now - last) / 16.7); last = now;
      const mixing = phaseRef.current === "mixing";
      step(dt, mixing, now);
      cage.current += (mixing ? .09 : .004) * dt;
      render(ctx, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pad]); // eslint-disable-line react-hooks/exhaustive-deps

  function step(dt: number, mixing: boolean, now: number) {
    const bs = balls.current;
    for (const b of bs) {
      b.vy += .55 * dt;
      if (mixing) {
        // Soplador desde abajo + remolino
        const dx = b.x - C.x, dy = b.y - C.y, d = Math.hypot(dx, dy) || 1;
        b.vx += (-dy / d) * .45 * dt + (Math.random() - .5) * 3 * dt;
        b.vy += (dx / d) * .45 * dt - (b.y > C.y ? 2.1 : .6) * Math.random() * dt;
      }
      b.vx *= .992; b.vy *= .992;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const dx = b.x - C.x, dy = b.y - C.y, d = Math.hypot(dx, dy), lim = R - BR;
      if (d > lim) {
        const nx = dx / d, ny = dy / d;
        b.x = C.x + nx * lim; b.y = C.y + ny * lim;
        const vn = b.vx * nx + b.vy * ny;
        if (vn > 0) { const e = mixing ? 1.6 : 1.45; b.vx -= e * vn * nx; b.vy -= e * vn * ny; }
      }
    }
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= BR * 2 || d === 0) continue;
      const nx = dx / d, ny = dy / d, push = (BR * 2 - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const imp = -rel * .92;
        a.vx -= imp * nx; a.vy -= imp * ny; b.vx += imp * nx; b.vy += imp * ny;
        if (mixing && -rel > 3 && now - lastClack.current > 55) { lastClack.current = now; soundsRef.current.clack(); }
      }
    }
  }

  function render(ctx: CanvasRenderingContext2D, now: number) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    // Soportes dorados y base
    const gold = ctx.createLinearGradient(0, 0, SIZE, 0);
    gold.addColorStop(0, "#8a6100"); gold.addColorStop(.3, "#f6d365"); gold.addColorStop(.6, "#d4a017"); gold.addColorStop(1, "#8a6100");
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.moveTo(C.x - R - 30, C.y); ctx.lineTo(C.x - R + 10, C.y); ctx.lineTo(C.x - 150, 790); ctx.lineTo(C.x - 200, 790); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(C.x + R + 30, C.y); ctx.lineTo(C.x + R - 10, C.y); ctx.lineTo(C.x + 150, 790); ctx.lineTo(C.x + 200, 790); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(C.x - R - 10, C.y, 22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(C.x + R + 10, C.y, 22, 0, Math.PI * 2); ctx.fill();
    // Base roja con franja dorada
    const base = ctx.createLinearGradient(0, 780, 0, 900);
    base.addColorStop(0, "#d11a36"); base.addColorStop(1, "#6e0a17");
    roundRect(ctx, C.x - 260, 780, 520, 110, 22); ctx.fillStyle = base; ctx.fill();
    ctx.fillStyle = gold; ctx.fillRect(C.x - 260, 812, 520, 12);
    ctx.font = "56px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("🎁", C.x - 190, 855); ctx.fillText("🎄", C.x, 855); ctx.fillText("🎁", C.x + 190, 855);

    // Tubo de salida
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = BR * 2 + 16;
    ctx.beginPath(); CHUTE.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    ctx.strokeStyle = "rgba(246,211,101,.7)"; ctx.lineWidth = 4;
    ctx.beginPath(); CHUTE.forEach((p, i) => (i ? ctx.lineTo(p.x + 4, p.y - BR - 6) : ctx.moveTo(p.x, p.y - BR - 6))); ctx.stroke();
    // Bandeja
    ctx.fillStyle = gold;
    ctx.beginPath(); ctx.ellipse(CHUTE[3].x, CHUTE[3].y + BR + 4, 70, 18, 0, 0, Math.PI * 2); ctx.fill();

    // Fondo del vidrio
    const glass = ctx.createRadialGradient(C.x - 80, C.y - 100, 40, C.x, C.y, R + 20);
    glass.addColorStop(0, "rgba(255,255,255,.16)"); glass.addColorStop(.8, "rgba(255,255,255,.05)"); glass.addColorStop(1, "rgba(180,220,255,.18)");
    ctx.beginPath(); ctx.arc(C.x, C.y, R + 8, 0, Math.PI * 2); ctx.fillStyle = glass; ctx.fill();

    // Bolitas
    for (const b of balls.current) drawBall(ctx, b.x, b.y, BR, b.color, pad(b.label));

    // Meridianos dorados de la jaula (giran al mezclar)
    ctx.strokeStyle = "rgba(246,211,101,.45)"; ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      const rx = Math.abs(Math.cos(cage.current + (k * Math.PI) / 4)) * (R + 8);
      ctx.beginPath(); ctx.ellipse(C.x, C.y, Math.max(1, rx), R + 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(C.x, C.y, R + 8, (R + 8) * .18, 0, 0, Math.PI * 2); ctx.stroke();
    // Brillo del vidrio y aro
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(C.x, C.y, R - 30, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    ctx.lineWidth = 14; ctx.strokeStyle = gold;
    ctx.beginPath(); ctx.arc(C.x, C.y, R + 12, 0, Math.PI * 2); ctx.stroke();
    // Boca de salida
    ctx.fillStyle = "#5c0a14";
    ctx.beginPath(); ctx.arc(OUT.x, OUT.y, BR + 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = gold; ctx.lineWidth = 6; ctx.stroke();
    // Moño navideño arriba
    ctx.font = "92px system-ui"; ctx.fillText("🎀", C.x, C.y - R - 22);

    // Bolita ganadora saliendo por el tubo
    const fl = flying.current;
    if (fl) {
      const t = Math.min(1, (now - fl.t0) / 1300);
      let pos;
      if (t < .25) { const k = ease(t / .25); pos = { x: fl.ball.x + (OUT.x - fl.ball.x) * k, y: fl.ball.y + (OUT.y - fl.ball.y) * k }; }
      else pos = pointOn(CHUTE, ease((t - .25) / .75));
      drawBall(ctx, pos.x, pos.y, BR * 1.15, fl.ball.color, pad(fl.ball.label));
    }
  }

  async function draw() {
    if (phaseRef.current === "mixing" || phaseRef.current === "extract" || phaseRef.current === "reveal" || !n) return;
    sounds.unlock();
    setError(null); setShowWin(false); setWinner(null); setRevealed("");
    flying.current = null;
    // Devuelve una bolita nueva al bombo si la anterior salió
    while (balls.current.length < Math.min(MAX_BALLS, n)) balls.current.push(newBall(balls.current.length));
    go("mixing");
    // En el celular el botón queda debajo del bombo: lo subimos a la vista para ver salir la bolita
    if (window.innerWidth < 900) canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mixFor = new Promise((r) => setTimeout(r, reduce ? 1500 : MIX_MS));
    try {
      const res = await fetch("/api/draw", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo sortear");
      const w = participants.find((p) => p.id === json.participantId);
      if (!w) throw new Error("El ganador no está en la lista. Recarga la página.");
      await mixFor;

      // Sale la bolita más cercana a la boca, ya con el número ganador
      go("extract");
      const bs = balls.current;
      let k = 0;
      bs.forEach((b, i) => { if (Math.hypot(b.x - OUT.x, b.y - OUT.y) < Math.hypot(bs[k].x - OUT.x, bs[k].y - OUT.y)) k = i; });
      const [ball] = bs.splice(k, 1);
      ball.label = w.number;
      flying.current = { ball, t0: performance.now() };
      await new Promise((r) => setTimeout(r, 1350));
      sounds.pop();

      // Revelado: los dígitos giran y se van fijando uno a uno
      go("reveal");
      setWinner(w);
      const target = pad(w.number);
      const start = performance.now(), per = reduce ? 120 : 450;
      await new Promise<void>((done) => {
        const id = setInterval(() => {
          const fixed = Math.floor((performance.now() - start) / per);
          setRevealed(target.split("").map((d, i) => (i < fixed ? d : String(Math.floor(Math.random() * 10)))).join(""));
          if (fixed >= target.length) { clearInterval(id); setRevealed(target); done(); }
        }, 60);
      });
      sounds.tick();
      await new Promise((r) => setTimeout(r, 700));
      setHistory((h) => [w, ...h]);
      go("done");
      sounds.win();
      setShowWin(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      flying.current = null;
      go("idle");
    }
  }

  const closeWin = useCallback(() => setShowWin(false), []);
  useEffect(() => {
    if (!showWin) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeWin(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showWin, closeWin]);

  if (!n) return <div className="xmas-card">Aún no hay participantes inscritos.</div>;

  const busy = phase === "mixing" || phase === "extract" || phase === "reveal";
  const face = (p: DrawParticipant | null, size: number, font: string) => p?.photoUrl
    ? <img src={p.photoUrl} alt={p.name} style={{ width: size, height: size }} />
    : <div className="xmas-initials" style={{ width: size, height: size, fontSize: font }}>{p ? initials(p.name) : "🎁"}</div>;
  const label = { idle: "🎄 Bombo listo", mixing: "🎶 Mezclando bolitas…", extract: "✨ ¡Sale una bolita!", reveal: "🥁 Revelando número…", done: "🎉 ¡Ganador!" }[phase];
  const ballColor = (num: number) => COLORS[num % COLORS.length];

  return (
    <div className="stage">
      <div className={`tombola-box${phase === "mixing" ? " is-mixing" : ""}`}>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-label="Bombo de bingo con las bolitas de los participantes" />
        {(phase === "reveal" || phase === "done") && winner && (
          <div className="big-ball-wrap" aria-live="polite">
            <div className="big-ball" style={{ ["--ball" as string]: ballColor(winner.number) }}>
              <span>{revealed || pad(winner.number)}</span>
            </div>
          </div>
        )}
      </div>

      <aside className="xmas-card winner">
        <div className="xmas-label">{label}</div>
        {phase === "done" && winner ? (
          <>
            <div className="xmas-face">{face(winner, 140, "3rem")}</div>
            <div className="num">{pad(winner.number)}</div>
            <div className="xmas-name">{winner.name}</div>
            {winner.rank && <div className="xmas-rank">{winner.rank}</div>}
          </>
        ) : (
          <div className="xmas-wait">
            <div className="mini-balls">{[0, 1, 2].map((i) => <i key={i} style={{ ["--ball" as string]: COLORS[i] }} />)}</div>
            <p>{busy ? "Atentos al número…" : "Presiona el botón para sacar una bolita."}</p>
          </div>
        )}
        <p className="xmas-count">{n} participantes en el bombo</p>
        <button className="btn xmas-btn" onClick={draw} disabled={busy}>
          {busy ? "Sacando…" : "🎱 Sacar bolita"}
        </button>
        <button className="sound-btn" onClick={sounds.toggle} aria-label={sounds.muted ? "Activar sonido" : "Silenciar"}>
          {sounds.muted ? "🔇 Sonido apagado" : "🔊 Sonido activado"}
        </button>
        {error && <p className="error">{error}</p>}
        {history.length > 0 && (
          <div className="xmas-history">
            <div className="xmas-label">Bolitas que han salido</div>
            <ul>
              {history.map((h, i) => (
                <li key={i}><span className="chip-ball" style={{ ["--ball" as string]: ballColor(h.number) }}><b>{pad(h.number)}</b></span>{h.name}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {showWin && winner && (
        <div className="win-overlay" role="dialog" aria-modal="true" aria-label={`Ganador ${winner.name}`} onClick={closeWin}>
          <Fireworks active />
          <div className="win-content" onClick={(e) => e.stopPropagation()}>
            <div className="win-title">¡GANADOR!</div>
            <div className="win-face">{face(winner, 190, "4rem")}</div>
            <div className="win-num">{pad(winner.number)}</div>
            <div className="win-name">{winner.name}</div>
            {winner.rank && <div className="win-rank">{winner.rank}</div>}
            <div className="win-actions">
              <button className="btn xmas-btn" onClick={() => { closeWin(); setTimeout(draw, 250); }}>🎱 Sacar otra</button>
              <button className="btn secondary" onClick={closeWin}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
