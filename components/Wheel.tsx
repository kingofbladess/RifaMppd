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
const KICK: Keyframe[] = [
  { transform: "translateX(-50%) rotate(0)" },
  { transform: "translateX(-50%) rotate(-14deg)", offset: .4 },
  { transform: "translateX(-50%) rotate(0)" },
];
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
// Aro, centro y estrella no cambian nunca: se dibujan una sola vez en lienzos aparte y en cada cuadro solo se copian.
const STAR = 140;
let STATICS: { base: HTMLCanvasElement; hub: HTMLCanvasElement; star: HTMLCanvasElement } | null = null;
function statics() {
  if (STATICS) return STATICS;
  const make = (w: number) => { const cv = document.createElement("canvas"); cv.width = cv.height = w; return [cv, cv.getContext("2d")!] as const; };
  const c = SIZE / 2, R = c - 40;
  const [base, b] = make(SIZE);
  const rim = b.createLinearGradient(0, 0, SIZE, SIZE);
  rim.addColorStop(0, "#fbe7a1"); rim.addColorStop(.35, "#d4a017"); rim.addColorStop(.65, "#8a6100"); rim.addColorStop(1, "#f6d365");
  b.beginPath(); b.arc(c, c, c - 4, 0, TAU); b.fillStyle = rim; b.fill();
  b.beginPath(); b.arc(c, c, R + 4, 0, TAU); b.fillStyle = "#5c0a14"; b.fill();
  // Centro: esfera roja con borde dorado
  const [hub, h] = make(SIZE);
  const g = h.createRadialGradient(c - 20, c - 20, 10, c, c, 80);
  g.addColorStop(0, "#ff5a6e"); g.addColorStop(.6, "#c8102e"); g.addColorStop(1, "#7a0b1c");
  h.beginPath(); h.arc(c, c, 78, 0, TAU); h.fillStyle = g; h.fill();
  h.lineWidth = 8; h.strokeStyle = "#f6d365"; h.stroke();
  // Estrella dorada con su brillo
  const [star, s] = make(STAR);
  s.translate(STAR / 2, STAR / 2);
  s.beginPath();
  for (let k = 0; k < 10; k++) {
    const rad = k % 2 ? 20 : 48, a = -Math.PI / 2 + k * Math.PI / 5;
    s.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  s.closePath();
  s.fillStyle = "#ffd166"; s.shadowColor = "#ffe9a8"; s.shadowBlur = 18; s.fill();
  return (STATICS = { base, hub, star });
}

function spinProgress(u: number) {
  const x = Math.min(1, Math.max(0, u)) * (PROFILE.length - 1), i = Math.floor(x), f = x - i;
  return i >= PROFILE.length - 1 ? 1 : PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * f;
}

// Sonido generado con Web Audio (sin archivos): "tic" al pasar cada porción. Los fuegos artificiales van sin sonido.
function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const outRef = useRef<AudioNode | null>(null);
  const audio = () => {
    if (!ctxRef.current) {
      const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // Un compresor evita que los "tic" seguidos saturen los parlantes.
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      comp.connect(ac.destination);
      ctxRef.current = ac; outRef.current = comp;
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume().catch(() => {}); // sin un clic previo el navegador no deja sonar
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
  return {
    unlock: () => { audio(); },
    tick: () => { tone(1400, 0, .04, "square", .05); },
  };
}

// Espejo (usuario TV): no tiene botones; repite en vivo los giros que se hacen desde otra pantalla.
const MIRROR_POLL_MS = 1500;

export default function Wheel({ participants: initial, pastWinners = [], digits, canManage = false, mirror = false }: { participants: WheelParticipant[]; pastWinners?: WheelParticipant[]; digits: number; canManage?: boolean; mirror?: boolean }) {
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
  const busy = useRef(false); // candado inmediato: dos toques seguidos nunca lanzan dos giros
  const loaded = useRef(new Set<string>()); // fotos ya descargadas
  // Fotos que ya estaban descargadas al empezar el giro: SOLO esas se muestran mientras gira. La del ganador
  // se descarga al empezar (para salir al instante al final) y, si contara, sería la única foto visible
  // en las vueltas y delataría quién va a ganar.
  const loadedAtStart = useRef(new Set<string>());
  const [spinning, setSpinning] = useState(false);
  const [current, setCurrent] = useState<WheelParticipant | null>(null);
  const [winner, setWinner] = useState<WheelParticipant | null>(null);
  const [showWin, setShowWin] = useState(false);
  const [history, setHistory] = useState<WheelParticipant[]>(pastWinners);
  const [error, setError] = useState<string | null>(null);
  const sounds = useSounds();
  const [queued, setQueued] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [mirrorQueue, setMirrorQueue] = useState<string[]>([]);
  const knownDraws = useRef(new Set(pastWinners.map((w) => w.id)));
  const closedRef = useRef<string | null>(null); // último cartel que cerró el admin (espejo)
  const [closedTick, setClosedTick] = useState(0);
  const winTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); // espera antes del cartel de ganador

  // Solo admin: quitar un ganador (vuelve a la ruleta) o todos, para repetir pruebas.
  const removeWinner = useCallback(async (w: WheelParticipant | null) => {
    if (spinning || removing) return;
    if (!confirm(w ? `¿Quitar a ${w.name} de los ganadores? Vuelve a la ruleta.` : "¿Quitar a TODOS los ganadores? Vuelven a la ruleta.")) return;
    setRemoving(w?.id ?? "all"); setError(null);
    try {
      const res = await fetch("/api/admin/draws", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(w ? { participantId: w.id } : { all: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo quitar el ganador");
      const back = w ? [w] : history;
      const ids = new Set(back.map((p) => p.id));
      setHistory((h) => h.filter((p) => !ids.has(p.id)));
      setParticipants((list) => [...list.filter((p) => !ids.has(p.id)), ...back].sort((a, b) => a.number - b.number));
      setWinner((cur) => (cur && ids.has(cur.id) ? null : cur));
      clearTimeout(winTimer.current);
      setShowWin(false);
      highlight.current = -1;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRemoving(null);
    }
  }, [spinning, removing, history]);

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

  // Las porciones con sus nombres y fotos se dibujan una sola vez (sin girar) en un lienzo aparte;
  // mientras gira, cada cuadro solo copia ese disco rotado, así el giro va fluido aunque haya miles de personas.
  const disc = useRef<{ key: unknown; canvas: HTMLCanvasElement } | null>(null);
  const renderDisc = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;
    const c = SIZE / 2, RIM = 34, R = c - RIM - 6, r = 0;

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
    return canvas;
  }, [participants, n, seg, showPhotos, showNames, showNumbers, digits]); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !n) return;
    const c = SIZE / 2, R = c - 40, r = rotation.current, s = statics();
    if (disc.current?.key !== renderDisc) disc.current = { key: renderDisc, canvas: renderDisc() };
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(s.base, 0, 0);
    ctx.save(); ctx.translate(c, c); ctx.rotate(r); ctx.drawImage(disc.current.canvas, -c, -c); ctx.restore();

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
    ctx.drawImage(s.hub, 0, 0);
    ctx.save(); ctx.translate(c, c); ctx.rotate(r * .25); ctx.drawImage(s.star, -STAR / 2, -STAR / 2); ctx.restore();
  }, [renderDisc, n, seg]);

  // Con hasta 200 personas todas las fotos se descargan al abrir: así durante el giro el recuadro muestra
  // las caras (no solo iniciales) y la del ganador no es distinta a las demás.
  useEffect(() => {
    if (n <= 200) participants.forEach((p) => { if (p.photoUrl) preload(p.photoUrl); });
  }, [participants, n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showPhotos) return;
    participants.forEach((p) => {
      if (!p.photoUrl || images.current.has(p.photoUrl)) return;
      const img = new Image();
      img.onload = () => { disc.current = null; draw(); }; // la foto llegó: se vuelve a dibujar el disco con ella
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
    clearTimeout(winTimer.current); // si el cartel aún no salía, ya no sale
    // Admin: avisa que cerró este cartel para que la TV espejo lo cierre también (si falla, la TV lo cierra al siguiente giro).
    if (!mirror && winner) fetch("/api/draw/cerrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId: winner.id }) }).catch(() => {});
    setShowWin(false);
    highlight.current = -1;
    setParticipants((list) => (winner ? list.filter((p) => p.id !== winner.id) : list));
    // El recuadro vuelve a mostrar a quien señala el puntero; el ganador queda en la lista de abajo.
    setWinner(null);
  }, [winner, mirror]);
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
    if (spinning || mirror) return;
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

  // Espejo: cada 1,5 s pregunta qué sorteos hay. Un sorteo nuevo se gira aquí hasta la misma persona;
  // si quitaron ganadores o hay inscritos que esta pantalla no tiene, se recarga para quedar igual.
  useEffect(() => {
    if (!mirror) return;
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch("/api/draw", { cache: "no-store" });
        if (res.ok) {
          const { draws, closed } = (await res.json()) as { draws: { participantId: string }[]; closed?: string | null };
          closedRef.current = closed ?? null;
          const ids = draws.map((d) => d.participantId), now = new Set(ids);
          if ([...knownDraws.current].some((id) => !now.has(id))) { if (!busy.current) location.reload(); return; }
          const fresh = ids.filter((id) => !knownDraws.current.has(id));
          if (fresh.length) { fresh.forEach((id) => knownDraws.current.add(id)); setMirrorQueue((q) => [...q, ...fresh]); }
          else setClosedTick((t) => t + 1); // revisa si el admin cerró el cartel del ganador actual
        }
      } catch { /* sin red: se reintenta en el siguiente ciclo */ }
      if (!stop) timer = setTimeout(tick, MIRROR_POLL_MS);
    };
    timer = setTimeout(tick, MIRROR_POLL_MS);
    return () => { stop = true; clearTimeout(timer); };
  }, [mirror]);
  // La TV: el navegador solo deja sonar después de un clic o tecla; además se recarga cada 6 h en reposo
  // porque los enlaces de las fotos vencen a las 12 h.
  useEffect(() => {
    if (!mirror) return;
    const unlock = () => sounds.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const loadedAt = Date.now();
    const iv = setInterval(() => { if (Date.now() - loadedAt > 6 * 3600e3 && !busy.current && !document.querySelector(".win-overlay")) location.reload(); }, 60e3);
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); clearInterval(iv); };
  }, [mirror]); // eslint-disable-line react-hooks/exhaustive-deps

  // Espejo: si el admin ya cerró el cartel de este ganador, la TV lo cierra igual (solo cuando ya terminó de girar).
  useEffect(() => {
    if (mirror && winner && showWin && !spinning && !busy.current && closedRef.current === winner.id) closeWin();
  }, [mirror, winner, showWin, spinning, closedTick, closeWin]);

  // Gira los sorteos pendientes uno por uno; antes cierra el cartel del ganador anterior (y lo saca de la ruleta).
  useEffect(() => {
    if (!mirror || !mirrorQueue.length || spinning || busy.current) return;
    if (winner) { closeWin(); return; }
    const [next, ...rest] = mirrorQueue;
    setMirrorQueue(rest);
    if (!participants.some((p) => p.id === next)) { location.reload(); return; }
    spin(next);
  }, [mirror, mirrorQueue, spinning, winner, participants]); // eslint-disable-line react-hooks/exhaustive-deps

  async function spin(mirrored?: string) {
    // Si el ganador anterior sigue en pantalla (el cartel aún no sale) no se gira: así nunca queda pegado.
    if (busy.current || spinning || winner || !n || (mirror && !mirrored)) return;
    busy.current = true;
    loadedAtStart.current = new Set(loaded.current);
    clearTimeout(winTimer.current);
    sounds.unlock();
    setError(null);
    setWinner(null);
    setShowWin(false);
    setSpinning(true);
    // En el celular el botón queda debajo de la ruleta: la subimos a la vista para ver el giro
    highlight.current = -1;
    if (window.matchMedia(STACKED_MQ).matches) boxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    try {
      let winnerId = mirrored;
      if (!winnerId) {
        // Si la red se cuelga, a los 20 s se avisa y el botón vuelve a quedar listo (nunca "Girando…" para siempre).
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        let res: Response | null = null, json: { error?: string; participantId?: string } = {};
        try {
          res = await fetch("/api/draw", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: participants.map((p) => p.id) }), signal: ctrl.signal,
          });
          json = await res.json().catch(() => ({ error: "Respuesta inválida del servidor" }));
        } catch { /* sin respuesta: se revisa abajo si el sorteo igual quedó guardado */ } finally {
          clearTimeout(timer);
        }
        if (res?.ok && json.participantId) winnerId = json.participantId;
        else if (res?.status === 409) throw new Error(json.error ?? "No se pudo sortear"); // respuesta clara: no hubo sorteo
        else {
          // La respuesta se perdió o hubo un error: puede que el ganador SÍ haya quedado guardado.
          // Se pregunta el último sorteo; si es alguien de esta ruleta que aún no salió, se muestra igual
          // (nunca queda un ganador guardado que nadie vio).
          winnerId = (await lastSavedDraw()) ?? undefined;
          if (!winnerId) throw new Error(res ? `${json.error ?? "No se pudo sortear"}. Vuelve a girar.` : "Sin conexión con el servidor. Revisa el internet y vuelve a girar.");
        }
      }
      const idx = participants.findIndex((p) => p.id === winnerId);
      if (idx < 0) throw new Error("El ganador no está en la ruleta. Recarga la página.");
      const winPhoto = participants[idx].photoUrl;
      if (winPhoto) preload(winPhoto); // se descarga mientras gira para que salga al instante

      const start = rotation.current;
      // Ángulo final: centro del segmento ganador bajo el puntero (arriba), con un pequeño desvío aleatorio
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      let target = -Math.PI / 2 - (idx + 0.5) * seg + jitter;
      const minEnd = start + TAU * TURNS;
      target += Math.ceil((minEnd - target) / TAU) * TAU;

      const t0 = performance.now();
      let lastIdx = -1, lastTick = 0, lastBlink = 0, lastShown = 0;
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
            // El recuadro muestra a quien está bajo el puntero. Con cientos de personas por segundo nadie alcanza a leerlo,
            // así que se refresca ~20 veces por segundo (y siempre al frenar) para no trabar la TV.
            if (!lightSpin || now - lastShown > 50 || t > .9) { lastShown = now; setCurrent(participants[i]); }
            // "tic" y golpecito del puntero, limitados para que no suene como un zumbido
            if (now - lastTick > 45) {
              lastTick = now;
              sounds.tick();
              // Web Animations: reinicia el golpecito sin forzar al navegador a recalcular la página
              pointerRef.current?.animate(KICK, { duration: 120, easing: "ease-out" });
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
      winTimer.current = setTimeout(() => setShowWin(true), 1100); // un instante para ver la porción ganadora iluminada
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      busy.current = false;
      setSpinning(false);
    }
  }

  async function lastSavedDraw(): Promise<string | null> {
    try {
      const r = await fetch("/api/draw", { cache: "no-store", signal: AbortSignal.timeout(6000) });
      const { draws } = (await r.json()) as { draws?: { participantId: string }[] };
      const last = draws?.at(-1)?.participantId;
      const won = new Set(history.map((h) => h.id));
      return last && participants.some((p) => p.id === last) && !won.has(last) ? last : null;
    } catch {
      return null;
    }
  }

  function preload(url: string) {
    if (loaded.current.has(url)) return;
    const img = new Image();
    img.onload = () => { if (img.naturalWidth) loaded.current.add(url); };
    img.src = url;
  }

  // Si una foto no carga (enlace vencido o red lenta) se muestran las iniciales, nunca el texto alternativo gigante.
  const [badPhotos, setBadPhotos] = useState<Set<string>>(() => new Set());
  const markBad = (u: string) => setBadPhotos((s) => (s.has(u) ? s : new Set(s).add(u)));
  // Mientras gira solo se pinta una foto ya descargada (si no, iniciales) y cada foto es un <img> nuevo (key):
  // así el número y la foto siempre son de la misma persona y nunca queda pegada la foto anterior.
  const face = (p: WheelParticipant | null, size: number, font: string, stack = false) => {
    const fallback = <div className="xmas-initials" style={{ width: size, height: size, fontSize: font }}>{p ? initials(p.name) : "🎁"}</div>;
    const url = p?.photoUrl;
    if (!url || badPhotos.has(url) || (spinning && !loadedAtStart.current.has(url) && (preload(url), true))) return fallback;
    const img = <img key={url} src={url} alt="" style={{ width: size, height: size }} onError={() => markBad(url)}
      onLoad={(e) => { loaded.current.add(url); e.currentTarget.classList.add("ok"); }}
      // Una foto que falló antes de que la página terminara de cargar no dispara onError: se revisa al montarla.
      ref={(el) => { if (!el?.complete) return; if (el.naturalWidth) el.classList.add("ok"); else markBad(url); }} />;
    // Recuadro y cartel de ganador: las iniciales quedan debajo y la foto aparece encima solo cuando ya cargó,
    // así el círculo nunca se ve vacío aunque la foto tarde o no llegue.
    return stack ? <span className="face-stack" key={url}>{fallback}{img}</span> : img;
  };

  // Mientras gira, el recuadro cambia en cada cuadro: las luces y la lista de ganadores se guardan ya armadas
  // para que React no las vuelva a recorrer 60 veces por segundo.
  const bulbs = useMemo(() => Array.from({ length: BULBS }, (_, i) => (
    <i key={i} style={{ transform: `translate(-50%, -50%) rotate(${(i * 360) / BULBS}deg) translateY(-48cqw)`, animationDelay: `${(i % 4) * .18}s` }} className={`b${i % 4}`} />
  )), []);
  const rail = useMemo(() => history.length ? (
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
                {canManage && (
                  <button type="button" className="w-del" title="Quitar ganador" aria-label={`Quitar a ${h.name} de los ganadores`}
                    tabIndex={copy > 0 ? -1 : undefined} disabled={spinning || !!removing} onClick={() => removeWinner(h)}>✕</button>
                )}
              </div>
            </li>
          )))}
      </ul>
    </div>
  ) : <p className="w-empty">🎁 Aquí aparecerán los ganadores</p>, [history, rolls, digits, badPhotos, canManage, spinning, removing, removeWinner]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {canManage && (
        <button type="button" className="btn secondary xmas-ghost" onClick={() => removeWinner(null)} disabled={!!removing}>
          Reiniciar ganadores
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  ) : <div className="xmas-card xmas-empty">🎟️ Aún no hay participantes inscritos.</div>;

  const shown = winner ?? (spinning && lightSpin && current ? { ...current, photoUrl: null } : current);


  return (
    <div className="stage" ref={stageRef}>
      {/* Ganadores a la izquierda: cada nuevo cae desde arriba y todos flotan suavemente */}
      <aside className={`winners-rail${history.length ? "" : " empty"}`} ref={railRef} aria-label="Ganadores">
        <div className="xmas-label">🏆 Ganadores{history.length ? ` (${history.length})` : ""}
          {canManage && history.length > 0 && (
            <button type="button" className="w-reset" onClick={() => removeWinner(null)} disabled={spinning || !!removing}>Reiniciar</button>
          )}
        </div>
        {rail}
      </aside>

      <div ref={boxRef} className={`wheel-box xmas-wheel${spinning ? " is-spinning" : ""}${winner && !spinning ? " has-winner" : ""}`}>
        <div className="xmas-pointer" ref={pointerRef}><span>⭐</span></div>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} aria-label="Ruleta de participantes" />
        <div className="bulbs" aria-hidden="true">{bulbs}</div>
      </div>

      <aside className={`xmas-card winner${spinning ? " is-spinning" : ""}${winner && !spinning ? " is-win" : ""}`} ref={cardRef}>
        <div className="xmas-label">{winner ? "🎉 ¡Ganador!" : spinning ? "🎶 Girando…" : "🎄 En el puntero"}</div>
        <div className="xmas-face">{face(shown, 150, "3.2rem", true)}</div>
        <div className="num" key={`n-${shown?.id}`}>{shown ? pad(shown.number) : "—"}</div>
        {/* Nombre y grado ocupan siempre el mismo alto: la tarjeta no salta mientras gira. */}
        <div className="xmas-name">{shown?.name ?? "\u00a0"}</div>
        <div className="xmas-rank">{shown ? shown.rank || "Civil" : "\u00a0"}</div>
        <p className="xmas-count">{n} en la ruleta{history.length ? ` · ${history.length} ${history.length === 1 ? "ganador" : "ganadores"}` : ""}</p>
        <button className="btn xmas-btn" onClick={() => spin()} disabled={spinning || (!!winner && !showWin)}>
          {spinning ? "Girando…" : "🎁 Girar ruleta"}
        </button>
        <p className="key-hint"><kbd>Espacio</kbd> girar · <kbd>F</kbd> pantalla completa</p>
        {error && <p className="error">{error}</p>}
      </aside>

      {showWin && winner && (
        <div className="win-overlay" role="dialog" aria-modal="true" aria-label={`Ganador ${winner.name}`} onClick={closeWin}>
          <WavingFlag />
          <Fireworks active />
          <div className="win-content" onClick={(e) => e.stopPropagation()}>
            <div className="win-pos">Ganador n.º {history.length}</div>
            <div className="win-title" data-text="¡GANADOR!">¡GANADOR!</div>
            <div className="win-face">{face(winner, 190, "4rem", true)}</div>
            <div className="win-num">{pad(winner.number)}</div>
            <div className="win-name">{winner.name}</div>
            <div className="win-rank">{winner.rank || "Civil"}</div>
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
