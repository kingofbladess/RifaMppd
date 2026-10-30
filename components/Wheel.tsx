"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Fireworks from "./Fireworks";
import WavingFlag from "./WavingFlag";

export type WheelParticipant = { id: string; name: string; number: number; rank: string | null; photoUrl: string | null };

// Paleta navideña: rojo, verde, dorado y crema.
const COLORS = ["#c8102e", "#0f7b3f", "#d4a017", "#f4efe1"];
// Texto rojo oscuro sobre las porciones claras (dorado y crema).
const LIGHT = new Set(["#d4a017", "#f4efe1"]);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const SIZE = 1000;
const TAU = Math.PI * 2;
const SPIN_MS = 26000;     // duración total del giro
const TURNS = 5;          // vueltas mínimas
const FACE_MS = 90;       // límite para que la foto no parpadee más rápido de lo que se alcanza a ver
const BULBS = 28;

// Perfil de una ruleta real: un empujón inicial (0,7 s) y luego la fricción la frena sin parar,
// con velocidad que cae como (1-u)³: cada vuelta es más lenta que la anterior hasta detenerse.
// Se integra numéricamente y se normaliza a 0..1 para caer exacto en el ganador.
const PROFILE = (() => {
  const N = 2000, T = SPIN_MS / 1000, out = new Float64Array(N + 1);
  let acc = 0;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * T, u = i / N;
    const push = Math.min(1, t / .7), ramp = push * push * (3 - 2 * push);
    acc += ramp * Math.pow(1 - u, 3);
    out[i] = acc;
  }
  for (let i = 0; i <= N; i++) out[i] /= acc;
  return out;
})();
function spinProgress(u: number) {
  const x = Math.min(1, Math.max(0, u)) * (PROFILE.length - 1), i = Math.floor(x), f = x - i;
  return i >= PROFILE.length - 1 ? 1 : PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * f;
}

// Sonidos generados con Web Audio (sin archivos): "tic" al pasar cada porción y campanitas al ganar.
function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  useEffect(() => { try { setMuted(localStorage.getItem("ruleta-mute") === "1"); } catch {} }, []);
  const audio = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };
  const tone = (freq: number, at: number, dur: number, type: OscillatorType, vol: number) => {
    const ac = audio(), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime + at);
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + at + dur);
    o.connect(g).connect(ac.destination);
    o.start(ac.currentTime + at); o.stop(ac.currentTime + at + dur + .02);
  };
  return {
    muted,
    toggle: () => setMuted((m) => { try { localStorage.setItem("ruleta-mute", m ? "0" : "1"); } catch {} return !m; }),
    unlock: () => { if (!muted) audio(); },
    tick: () => { if (!muted) tone(1400, 0, .04, "square", .05); },
    win: () => {
      if (muted) return;
      [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => tone(f, i * .12, .5, "triangle", .18));
      [2093, 2637, 3136].forEach((f, i) => tone(f, .8 + i * .09, .7, "sine", .08));
    },
  };
}

export default function Wheel({ participants: initial, pastWinners = [], digits }: { participants: WheelParticipant[]; pastWinners?: WheelParticipant[]; digits: number }) {
  // Quien gana sale de la ruleta para que no pueda volver a salir.
  const [participants, setParticipants] = useState(initial);
  useEffect(() => setParticipants(initial), [initial]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const rotation = useRef(0);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [spinning, setSpinning] = useState(false);
  const [current, setCurrent] = useState<WheelParticipant | null>(null);
  const [winner, setWinner] = useState<WheelParticipant | null>(null);
  const [showWin, setShowWin] = useState(false);
  const [history, setHistory] = useState<WheelParticipant[]>(pastWinners);
  const [error, setError] = useState<string | null>(null);
  const sounds = useSounds();
  const [queued, setQueued] = useState(false);

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
    const c = SIZE / 2, RIM = 34, R = c - RIM - 6, r = rotation.current;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Aro dorado exterior (las luces son elementos HTML encima)
    const rim = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    rim.addColorStop(0, "#fbe7a1"); rim.addColorStop(.35, "#d4a017"); rim.addColorStop(.65, "#8a6100"); rim.addColorStop(1, "#f6d365");
    ctx.beginPath(); ctx.arc(c, c, c - 4, 0, TAU); ctx.fillStyle = rim; ctx.fill();
    ctx.beginPath(); ctx.arc(c, c, R + 4, 0, TAU); ctx.fillStyle = "#5c0a14"; ctx.fill();

    if (!showNumbers) {
      // Muchos participantes: franjas de color (cada una agrupa varias porciones) para que gire fluido.
      const BANDS = 24, band = TAU / BANDS;
      for (let b = 0; b < BANDS; b++) {
        ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, r + b * band, r + (b + 1) * band); ctx.closePath();
        ctx.fillStyle = COLORS[b % COLORS.length]; ctx.fill();
        ctx.strokeStyle = "rgba(212,160,23,.8)"; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    if (showNumbers) participants.forEach((p, i) => {
      const color = COLORS[i % COLORS.length];
      const a0 = r + i * seg, a1 = a0 + seg, mid = a0 + seg / 2;
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, a0, a1); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = "rgba(212,160,23,.85)";
      ctx.lineWidth = n <= 150 ? 2.5 : 0.6;
      ctx.stroke();

      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(mid);
      const img = p.photoUrl ? images.current.get(p.photoUrl) : undefined;
      let textEnd = R - 20;
      if (showPhotos) {
        const pr = Math.min(46, Math.max(14, Math.sin(seg / 2) * (R - 70) * 0.85));
        const px = R - pr - 14;
        ctx.save();
        ctx.beginPath(); ctx.arc(px, 0, pr, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill(); ctx.clip();
        ctx.translate(px, 0);
        ctx.rotate(Math.PI / 2);
        if (img?.complete && img.naturalWidth) {
          const s = Math.max((pr * 2) / img.naturalWidth, (pr * 2) / img.naturalHeight);
          ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
        } else {
          ctx.fillStyle = "#7a0b1c";
          ctx.font = `800 ${Math.round(pr * .8)}px system-ui, sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(initials(p.name), 0, 1);
        }
        ctx.restore();
        ctx.beginPath(); ctx.arc(px, 0, pr, 0, TAU);
        ctx.strokeStyle = "#f6d365"; ctx.lineWidth = 4; ctx.stroke();
        textEnd = px - pr - 10;
      }
      ctx.fillStyle = LIGHT.has(color) ? "#7a0b1c" : "#fff";
      ctx.textAlign = "right"; ctx.textBaseline = "middle";
      const fs = Math.max(11, Math.min(30, Math.sin(seg / 2) * textEnd * 0.9));
      ctx.font = `800 ${fs}px system-ui, sans-serif`;
      const first = p.name.split(" ").slice(0, 2).join(" ");
      const label = showNames ? `${pad(p.number)} · ${first}` : pad(p.number);
      let t = label;
      while (ctx.measureText(t).width > textEnd - 110 && t.length > 4) t = t.slice(0, -2);
      ctx.fillText(t === label ? t : t + "…", textEnd, 0);
      ctx.restore();
    });

    // Centro: esfera roja con estrella dorada
    const hub = ctx.createRadialGradient(c - 20, c - 20, 10, c, c, 80);
    hub.addColorStop(0, "#ff5a6e"); hub.addColorStop(.6, "#c8102e"); hub.addColorStop(1, "#7a0b1c");
    ctx.beginPath(); ctx.arc(c, c, 78, 0, TAU); ctx.fillStyle = hub; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = "#f6d365"; ctx.stroke();
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(r * .25);
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rad = k % 2 ? 20 : 48, a = -Math.PI / 2 + k * Math.PI / 5;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = "#ffd166"; ctx.shadowColor = "#ffe9a8"; ctx.shadowBlur = 18; ctx.fill();
    ctx.restore();
  }, [participants, n, seg, showPhotos, showNames, showNumbers, digits]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Al cerrar la pantalla de ganador, esa persona desaparece de la ruleta.
  const closeWin = useCallback(() => {
    setShowWin(false);
    setParticipants((list) => (winner ? list.filter((p) => p.id !== winner.id) : list));
    // El recuadro vuelve a mostrar a quien señala el puntero; el ganador queda en la lista de abajo.
    setWinner(null);
  }, [winner]);
  useEffect(() => {
    if (!showWin) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeWin(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showWin, closeWin]);

  // La ruleta toma el tamaño más grande que cabe en la pantalla sin scroll:
  // en PC al lado del recuadro; en celular, el alto que deja libre el recuadro de abajo.
  useEffect(() => {
    const stage = stageRef.current, card = cardRef.current, box = boxRef.current;
    if (!stage || !card || !box) return;
    const fit = () => {
      const stacked = window.innerWidth <= 900;
      const POINTER = 0.06; // la estrella del puntero sobresale ~6 % por arriba
      const availH = stacked ? stage.clientHeight - card.offsetHeight - 8 : stage.clientHeight;
      const availW = stacked ? stage.clientWidth : stage.clientWidth - card.offsetWidth - 24;
      const size = Math.max(200, Math.floor(Math.min(availW, availH / (1 + POINTER))));
      box.style.width = `${size}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage); ro.observe(card);
    return () => ro.disconnect();
  }, [n]);

  // "Girar otra vez": espera a que el ganador salga de la ruleta y luego gira con la lista nueva.
  useEffect(() => {
    if (queued && !showWin) { setQueued(false); spin(); }
  }, [queued, showWin, participants]); // eslint-disable-line react-hooks/exhaustive-deps

  async function spin() {
    if (spinning || !n) return;
    sounds.unlock();
    setError(null);
    setWinner(null);
    setShowWin(false);
    setSpinning(true);
    // En el celular el botón queda debajo de la ruleta: la subimos a la vista para ver el giro
    if (window.innerWidth < 900) boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      const minEnd = start + TAU * TURNS;
      target += Math.ceil((minEnd - target) / TAU) * TAU;

      const t0 = performance.now();
      let lastIdx = -1, lastTick = 0, lastFace = 0, lastBlink = 0;
      await new Promise<void>((done) => {
        const frame = (now: number) => {
          const t = Math.min(1, (now - t0) / SPIN_MS);
          rotation.current = start + (target - start) * spinProgress(t);
          // Los foquitos parpadean al ritmo de la velocidad de la ruleta
          if (now - lastBlink > 200 && boxRef.current) {
            lastBlink = now;
            const speed = (spinProgress(t + .01) - spinProgress(t)) / .01; // 1 = velocidad media
            boxRef.current.style.setProperty("--blink", `${Math.min(1, Math.max(.12, .25 / Math.max(speed, .01)))}s`);
          }
          draw();
          const i = indexAtPointer(rotation.current);
          if (i !== lastIdx) {
            lastIdx = i;
            if (now - lastFace > FACE_MS || t > .9) { lastFace = now; setCurrent(participants[i]); }
            // "tic" y golpecito del puntero, limitados para que no suene como un zumbido
            if (now - lastTick > 45) {
              lastTick = now;
              sounds.tick();
              const el = pointerRef.current;
              if (el) { el.classList.remove("kick"); void el.offsetWidth; el.classList.add("kick"); }
            }
          }
          if (t < 1) requestAnimationFrame(frame); else done();
        };
        requestAnimationFrame(frame);
      });
      const w = participants[idx];
      setWinner(w);
      setHistory((h) => [w, ...h]);
      sounds.win();
      setTimeout(() => setShowWin(true), 350);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSpinning(false);
    }
  }

  if (!n) return <div className="xmas-card">{history.length ? "🎉 Todos los participantes ya ganaron un premio." : "Aún no hay participantes inscritos."}</div>;

  const shown = winner ?? current;
  const face = (p: WheelParticipant | null, size: number, font: string) => p?.photoUrl
    ? <img src={p.photoUrl} alt={p.name} style={{ width: size, height: size }} />
    : <div className="xmas-initials" style={{ width: size, height: size, fontSize: font }}>{p ? initials(p.name) : "🎁"}</div>;

  return (
    <div className="stage" ref={stageRef}>
      <div ref={boxRef} className={`wheel-box xmas-wheel${spinning ? " is-spinning" : ""}${winner && !spinning ? " has-winner" : ""}`}>
        <div className="xmas-pointer" ref={pointerRef}><span>⭐</span></div>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-label="Ruleta de participantes" />
        <div className="bulbs" aria-hidden="true">
          {Array.from({ length: BULBS }, (_, i) => (
            <i key={i} style={{ transform: `translate(-50%, -50%) rotate(${(i * 360) / BULBS}deg) translateY(-48cqw)`, animationDelay: `${(i % 4) * .18}s` }} className={`b${i % 4}`} />
          ))}
        </div>
      </div>

      <aside className="xmas-card winner" ref={cardRef}>
        <div className="xmas-label">{winner ? "🎉 ¡Ganador!" : spinning ? "🎶 Girando…" : "🎄 En el puntero"}</div>
        <div className="xmas-face">{face(shown, 150, "3.2rem")}</div>
        <div className="num">{shown ? pad(shown.number) : "—"}</div>
        <div className="xmas-name">{shown?.name}</div>
        {shown?.rank && <div className="xmas-rank">{shown.rank}</div>}
        <p className="xmas-count">{n} participantes</p>
        <button className="btn xmas-btn" onClick={spin} disabled={spinning}>
          {spinning ? "Girando…" : "🎁 Girar ruleta"}
        </button>
        <button className="sound-btn" onClick={sounds.toggle} aria-label={sounds.muted ? "Activar sonido" : "Silenciar"}>
          {sounds.muted ? "🔇" : "🔊"}<span className="sound-text">{sounds.muted ? " Sonido apagado" : " Sonido activado"}</span>
        </button>
        {error && <p className="error">{error}</p>}
        {history.length > 0 && (
          <div className="xmas-history">
            <div className="xmas-label">Ganadores</div>
            <ul>
              {history.map((h, i) => (
                <li key={i}>{face(h, 36, ".8rem")}<strong>{pad(h.number)}</strong> {h.name}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {showWin && winner && (
        <div className="win-overlay" role="dialog" aria-modal="true" aria-label={`Ganador ${winner.name}`} onClick={closeWin}>
          <WavingFlag />
          <Fireworks active />
          <div className="win-content" onClick={(e) => e.stopPropagation()}>
            <div className="win-title">¡GANADOR!</div>
            <div className="win-face">{face(winner, 190, "4rem")}</div>
            <div className="win-num">{pad(winner.number)}</div>
            <div className="win-name">{winner.name}</div>
            {winner.rank && <div className="win-rank">{winner.rank}</div>}
            <div className="win-actions">
              <button className="btn xmas-btn" onClick={() => { closeWin(); setQueued(true); }}>🎁 Girar otra vez</button>
              <button className="btn secondary" onClick={closeWin}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
