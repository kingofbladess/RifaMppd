"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
const SPIN_MS = 10000;     // duración total del giro
const TURNS = 5;          // vueltas mínimas
const BULBS = 28;
const WIND_UP = 0.07;      // fracción del giro con el pequeño impulso hacia atrás antes de arrancar
// Debe coincidir con la regla CSS que apila la ruleta y el recuadro (celular vertical)
const STACKED_MQ = "(max-width: 900px) and (max-aspect-ratio: 4/3)";

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

// Sonidos generados con Web Audio (sin archivos): "tic" al pasar cada porción y fuegos artificiales al ganar.
// Los fuegos se hacen con ruido filtrado (como una explosión real): silbido de subida, estallido grave y chisporroteo.
function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const outRef = useRef<AudioNode | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const audio = () => {
    if (!ctxRef.current) {
      const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // Un compresor evita que varias explosiones juntas saturen los parlantes.
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      comp.connect(ac.destination);
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      ctxRef.current = ac; outRef.current = comp; noiseRef.current = buf;
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };
  const tone = (freq: number, at: number, dur: number, type: OscillatorType, vol: number) => {
    const ac = audio(), o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime + at);
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + at + dur);
    o.connect(g).connect(outRef.current!);
    o.start(ac.currentTime + at); o.stop(ac.currentTime + at + dur + .02);
  };
  // Ruido que pasa por un filtro y un volumen con forma; pan -1 (izquierda) a 1 (derecha).
  const noise = (at: number, dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, pan: number, attack = .004) => {
    const ac = audio(), t = ac.currentTime + at;
    const src = ac.createBufferSource(), bq = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseRef.current; src.playbackRate.value = .8 + Math.random() * .4;
    bq.type = filter; bq.frequency.setValueAtTime(f0, t); bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let node: AudioNode = g;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(outRef.current!);
    src.connect(bq).connect(g);
    src.start(t, Math.random() * 1.2); src.stop(t + dur + .05);
  };
  return {
    unlock: () => { audio(); },
    tick: () => { tone(1400, 0, .04, "square", .05); },
    // Cohete subiendo: soplido suave que sube de tono.
    launch: (pan: number) => { noise(0, .9, .035, "bandpass", 500, 2200, pan, .25); },
    // Estallido: golpe grave + ruido que se apaga y a veces chisporroteo.
    boom: (pan: number, big = Math.random()) => {
      const ac = audio(), vol = .45 + big * .4, delay = Math.random() * .08;
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + delay;
      o.type = "sine"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + .5);
      g.gain.setValueAtTime(vol * .9, t); g.gain.exponentialRampToValueAtTime(.0001, t + .55);
      o.connect(g).connect(outRef.current!); o.start(t); o.stop(t + .6);
      noise(delay, 1.4 + big, vol, "lowpass", 2600, 180, pan);
      noise(delay + .03, 2.2, vol * .18, "lowpass", 600, 120, -pan * .5, .05); // eco lejano
      if (Math.random() < .55) {
        const n = 14 + Math.floor(Math.random() * 22);
        for (let i = 0; i < n; i++) noise(delay + .35 + Math.random() * 1.3, .03 + Math.random() * .04, .05 + Math.random() * .08, "highpass", 2500 + Math.random() * 3000, 1800, pan + (Math.random() - .5) * .6, .002);
      }
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
  const railRef = useRef<HTMLElement>(null);
  const railWindowRef = useRef<HTMLDivElement>(null);
  const railListRef = useRef<HTMLUListElement>(null);
  const [rolls, setRolls] = useState(false);
  const rotation = useRef(0);
  const highlight = useRef(-1); // porción ganadora que brilla al detenerse
  const images = useRef(new Map<string, HTMLImageElement>());
  const faceRef = useRef<HTMLCanvasElement | null>(null);
  const faceDirty = useRef(true);
  const faceFor = useRef<WheelParticipant[] | null>(null);
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
  // Con muchas personas el puntero pasa por cientos por segundo: mientras gira, el recuadro no descarga fotos
  // (se trabaría la TV y la red); solo pasan números e iniciales y la foto del ganador aparece al detenerse.
  const lightSpin = n > 400;

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

    // Las porciones (colores, fotos y textos) se dibujan una sola vez en un lienzo aparte y en cada cuadro
    // solo se gira esa imagen: así el giro va fluido aunque el equipo de la TV sea modesto.
    let face = faceRef.current;
    if (!face) { face = document.createElement("canvas"); face.width = face.height = SIZE; faceRef.current = face; }
    if (faceFor.current !== participants) { faceFor.current = participants; faceDirty.current = true; }
    if (faceDirty.current) {
      faceDirty.current = false;
      const ctx = face.getContext("2d")!, r = 0;
      ctx.clearRect(0, 0, SIZE, SIZE);
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
        // Si la cantidad deja la última porción con el mismo color que la primera, se usa otro.
        const ci = i === n - 1 && n > 1 && i % COLORS.length === 0 ? 2 : i % COLORS.length;
        const color = COLORS[ci];
        const a0 = r + i * seg, a1 = a0 + seg, mid = a0 + seg / 2;
        ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, a0, a1); ctx.closePath();
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = "rgba(212,160,23,.85)";
        ctx.lineWidth = n <= 150 ? 2.5 : 0.6;
        if (n > 1) ctx.stroke(); // con una sola persona no hay bordes entre porciones

        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(mid);
        const img = p.photoUrl ? images.current.get(p.photoUrl) : undefined;
        let textEnd = R - 20;
        if (showPhotos) {
          const pr = Math.min(46, Math.max(14, Math.sin(Math.min(seg / 2, Math.PI / 2.4)) * (R - 70) * 0.85));
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
        const fs = Math.max(11, Math.min(30, Math.sin(Math.min(seg / 2, Math.PI / 2.4)) * textEnd * 0.9));
        ctx.font = `800 ${fs}px system-ui, sans-serif`;
        // Se prueba de más largo a más corto (dos palabras, primer nombre) y solo se corta con "…" si ni el primer nombre cabe.
        const room = textEnd - 96, words = p.name.split(" ").filter(Boolean);
        const options = showNames ? [words.slice(0, 2).join(" "), words[0]].map((w) => `${pad(p.number)} · ${w}`) : [pad(p.number)];
        let t = options.find((o) => ctx.measureText(o).width <= room);
        if (!t) {
          t = options.at(-1)!;
          while (ctx.measureText(t + "…").width > room && t.length > digits + 4) t = t.slice(0, -1);
          t = t.length > digits + 4 ? t + "…" : pad(p.number);
        }
        ctx.fillText(t, textEnd, 0);
        ctx.restore();
      });
    }
    ctx.save();
    ctx.translate(c, c); ctx.rotate(r); ctx.drawImage(face, -c, -c);
    ctx.restore();

    // Porción ganadora: se ilumina en dorado (al menos unos grados de ancho para que se vea con miles)
    if (highlight.current >= 0) {
      const w = Math.max(seg, .07), mid = r + (highlight.current + .5) * seg;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, mid - w / 2, mid + w / 2); ctx.closePath();
      ctx.fillStyle = "rgba(255,240,180,.35)"; ctx.fill();
      ctx.shadowColor = "#ffd166"; ctx.shadowBlur = 30; ctx.lineWidth = 8; ctx.strokeStyle = "#ffe08a"; ctx.stroke();
      ctx.restore();
    }

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
      img.onload = () => { faceDirty.current = true; draw(); };
      img.src = p.photoUrl;
      images.current.set(p.photoUrl, img);
    });
  }, [participants, showPhotos, draw]);

  // En reposo el puntero queda en el centro de una porción (nunca sobre una línea),
  // así el número del recuadro coincide sin dudas con el de la ruleta.
  useEffect(() => {
    if (n) {
      const i = indexAtPointer(rotation.current);
      rotation.current = -Math.PI / 2 - (i + 0.5) * seg;
      setCurrent(participants[i]);
    }
    draw();
  }, [draw, n, seg, participants, indexAtPointer]);

  // Al cerrar la pantalla de ganador, esa persona desaparece de la ruleta.
  const closeWin = useCallback(() => {
    setShowWin(false);
    highlight.current = -1;
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

  // Espacio o Enter: gira (o, con el cartel de ganador abierto, lo cierra y gira otra vez).
  // Si hay un botón enfocado, el navegador ya lo activa con esas teclas.
  const keySpin = useRef<() => void>(() => {});
  keySpin.current = () => {
    if (spinning) return;
    if (showWin) { closeWin(); setQueued(true); } else spin();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (e.repeat || e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLAnchorElement) return;
      e.preventDefault();
      keySpin.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // La ruleta toma el tamaño más grande que cabe en la pantalla sin scroll:
  // en PC al lado del recuadro; en celular, el alto que deja libre el recuadro de abajo.
  useEffect(() => {
    const stage = stageRef.current, card = cardRef.current, box = boxRef.current, rail = railRef.current;
    if (!stage || !card || !box || !rail) return;
    const fit = () => {
      const stacked = window.matchMedia(STACKED_MQ).matches;
      const POINTER = 0.06; // la estrella del puntero sobresale ~6 % por arriba
      const railW = rail.offsetWidth ? rail.offsetWidth + (stacked ? 8 : 24) : 0;
      const availH = stacked ? stage.clientHeight - card.offsetHeight - 8 : stage.clientHeight;
      const availW = stage.clientWidth - railW - (stacked ? 0 : card.offsetWidth + 24);
      const size = Math.max(200, Math.floor(Math.min(availW, availH / (1 + POINTER))));
      box.style.width = `${size}px`;
      stage.style.setProperty("--wheel", `${size}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage); ro.observe(card); ro.observe(rail);
    return () => ro.disconnect();
  }, [n]);

  // El carrusel de ganadores solo se activa cuando la lista no cabe en su columna.
  useEffect(() => {
    const win = railWindowRef.current;
    if (!win) return;
    const check = () => {
      const list = railListRef.current;
      if (!list) return;
      const single = list.scrollHeight / (rolls ? 2 : 1);
      setRolls(single > win.clientHeight + 2);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(win);
    return () => ro.disconnect();
  }, [history.length, rolls]);

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
    highlight.current = -1;
    if (window.matchMedia(STACKED_MQ).matches) boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    try {
      const res = await fetch("/api/draw", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo sortear");
      const idx = participants.findIndex((p) => p.id === json.participantId);
      if (idx < 0) throw new Error("El ganador no está en la ruleta. Recarga la página.");
      const winPhoto = participants[idx].photoUrl;
      if (winPhoto) new Image().src = winPhoto; // se descarga mientras gira para que salga al instante

      const start = rotation.current;
      // Ángulo final: centro del segmento ganador bajo el puntero (arriba), con un pequeño desvío aleatorio
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      let target = -Math.PI / 2 - (idx + 0.5) * seg + jitter;
      const minEnd = start + TAU * TURNS;
      target += Math.ceil((minEnd - target) / TAU) * TAU;

      const t0 = performance.now();
      let lastIdx = -1, lastTick = 0, lastBlink = 0;
      await new Promise<void>((done) => {
        const frame = (now: number) => {
          const t = Math.min(1, (now - t0) / SPIN_MS);
          // Antes de arrancar la ruleta retrocede un poquito, como cuando alguien la toma para impulsarla
          const wind = t < WIND_UP ? -.16 * Math.sin(Math.PI * t / WIND_UP) : 0;
          rotation.current = start + (target - start) * spinProgress(t) + wind;
          // Los foquitos parpadean al ritmo de la velocidad de la ruleta
          if (now - lastBlink > 200 && boxRef.current) {
            lastBlink = now;
            const speed = (spinProgress(t + .01) - spinProgress(t)) / .01; // 1 = velocidad media
            boxRef.current.style.setProperty("--blink", `${Math.min(1, Math.max(.12, .25 / Math.max(speed, .01)))}s`);
            boxRef.current.style.setProperty("--glow", `${Math.min(1, speed / 2.5).toFixed(2)}`);
          }
          draw();
          const i = indexAtPointer(rotation.current);
          if (i !== lastIdx) {
            lastIdx = i;
            setCurrent(participants[i]); // el recuadro muestra siempre a quien está bajo el puntero, en el mismo cuadro
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
      boxRef.current?.style.setProperty("--glow", "0");
      highlight.current = idx;
      draw();
      const w = participants[idx];
      setWinner(w);
      setHistory((h) => [w, ...h]);
      setTimeout(() => setShowWin(true), 1100); // un instante para ver la porción ganadora iluminada
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSpinning(false);
    }
  }

  const face = (p: WheelParticipant | null, size: number, font: string) => p?.photoUrl
    ? <img src={p.photoUrl} alt={p.name} style={{ width: size, height: size }} />
    : <div className="xmas-initials" style={{ width: size, height: size, fontSize: font }}>{p ? initials(p.name) : "🎁"}</div>;

  // Mientras gira, el recuadro cambia en casi cada cuadro: la lista de ganadores y las luces se guardan
  // para que React no las vuelva a armar cada vez (en equipos modestos eso trababa el giro).
  const rail = useMemo(() => (
    <aside className={`winners-rail${history.length ? "" : " empty"}`} ref={railRef} aria-label="Ganadores">
      <div className="xmas-label">🏆 Ganadores{history.length ? ` (${history.length})` : ""}</div>
      {history.length ? (
        // Si los ganadores no caben, la lista se duplica y baja sin parar (al terminar una vuelta empieza de nuevo sin saltos).
        // Si caben, se muestran quietos y una sola vez, para que en la TV nadie crea que hay ganadores repetidos.
        <div className={`rail-window${rolls ? " is-rolling" : ""}`} ref={railWindowRef}>
          <ul key={`${history.length}-${rolls}`} ref={railListRef} className={rolls ? "rolling" : ""}
            style={rolls ? { animationDuration: `${Math.max(history.length, 6) * 2.4}s` } : undefined}>
            {(rolls ? [0, 1] : [0]).flatMap((copy) =>
              history.map((h, i) => (
                <li key={`${copy}-${h.id}`} aria-hidden={copy > 0 || undefined}>
                  <div className="float" style={{ animationDelay: `${-(i % 5) * .6}s` }}>
                    {face(h, 40, ".85rem")}
                    <span className="w-num"><span className="w-pos">{history.length - i}.º</span>{pad(h.number)}</span>
                    <span className="w-name">{h.name}</span>
                  </div>
                </li>
              )))}
          </ul>
        </div>
      ) : <p className="w-empty">🎁 Aquí aparecerán los ganadores</p>}
    </aside>
  ), [history, rolls]); // eslint-disable-line react-hooks/exhaustive-deps
  const bulbs = useMemo(() => (
    <div className="bulbs" aria-hidden="true">
      {Array.from({ length: BULBS }, (_, i) => (
        <i key={i} style={{ transform: `translate(-50%, -50%) rotate(${(i * 360) / BULBS}deg) translateY(-48cqw)`, animationDelay: `${(i % 4) * .18}s` }} className={`b${i % 4}`} />
      ))}
    </div>
  ), []);

  // Sin nadie en la ruleta: pantalla final con todos los ganadores (o aviso si aún no hay inscritos).
  if (!n) return history.length ? (
    <div className="xmas-done">
      <div className="xmas-done-title">🎉 ¡Sorteo terminado!</div>
      <p className="xmas-done-sub">Todos los participantes ya ganaron un premio. ¡Felicidades!</p>
      <ul className="xmas-done-list">
        {[...history].reverse().map((h, i) => (
          <li key={h.id} style={{ animationDelay: `${i * .08}s` }}>
            <span className="xmas-done-pos">{i + 1}</span>
            {face(h, 56, "1rem")}
            <span className="w-num">{pad(h.number)}</span>
            <span className="w-name">{h.name}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : <div className="xmas-card xmas-empty">🎟️ Aún no hay participantes inscritos.</div>;

  const shown = winner ?? (spinning && lightSpin && current ? { ...current, photoUrl: null } : current);


  return (
    <div className="stage" ref={stageRef}>
      {/* Ganadores a la izquierda: cada nuevo cae desde arriba y todos flotan suavemente */}
      {rail}

      <div ref={boxRef} className={`wheel-box xmas-wheel${spinning ? " is-spinning" : ""}${winner && !spinning ? " has-winner" : ""}`}>
        <div className="xmas-pointer" ref={pointerRef}><span>⭐</span></div>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-label="Ruleta de participantes" />
        {bulbs}
      </div>

      <aside className={`xmas-card winner${spinning ? " is-spinning" : ""}${winner && !spinning ? " is-win" : ""}`} ref={cardRef}>
        <div className="xmas-label">{winner ? "🎉 ¡Ganador!" : spinning ? "🎶 Girando…" : "🎄 En el puntero"}</div>
        <div className="xmas-face">{face(shown, 150, "3.2rem")}</div>
        <div className="num" key={`n-${shown?.id}`}>{shown ? pad(shown.number) : "—"}</div>
        <div className="xmas-name">{shown?.name}</div>
        {shown?.rank && <div className="xmas-rank">{shown.rank}</div>}
        <p className="xmas-count">{n} en la ruleta{history.length ? ` · ${history.length} ${history.length === 1 ? "ganador" : "ganadores"}` : ""}</p>
        <button className="btn xmas-btn" onClick={spin} disabled={spinning}>
          {spinning ? "Girando…" : "🎁 Girar ruleta"}
        </button>
        <p className="key-hint"><kbd>Espacio</kbd> girar · <kbd>F</kbd> pantalla completa</p>
        {error && <p className="error">{error}</p>}
      </aside>

      {showWin && winner && (
        <div className="win-overlay" role="dialog" aria-modal="true" aria-label={`Ganador ${winner.name}`} onClick={closeWin}>
          <WavingFlag />
          <Fireworks active onLaunch={sounds.launch} onBurst={sounds.boom} />
          <div className="win-content" onClick={(e) => e.stopPropagation()}>
            <div className="win-pos">Ganador n.º {history.length}</div>
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
