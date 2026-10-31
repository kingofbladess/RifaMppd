"use client";
import { useEffect, useRef } from "react";

// Bandera de Venezuela ondeando a pantalla completa detrás del cartel de ganador.
// La bandera se dibuja una sola vez en un lienzo aparte (franjas + 8 estrellas) y en cada cuadro
// se copia en franjas verticales que suben y bajan con un pequeño desfase, con sombra en los pliegues.
// Se dibuja un poco más alta que la pantalla para que al ondear nunca se vean los bordes.
const STRIPS = 80;
const PERIOD = 2.6;    // segundos por ondulación
const LAG = .09;       // desfase entre franjas (s)
const AMP = .025;      // cuánto sube y baja cada franja (fracción del alto)
const MAX_W = 1280;    // resolución interna máxima: la TV escala el lienzo, no hace falta más

function drawFlag(c: HTMLCanvasElement, w: number, h: number) {
  c.width = w; c.height = h;
  const g = c.getContext("2d")!, band = h / 3;
  g.fillStyle = "#FFCC00"; g.fillRect(0, 0, w, band + 1);
  g.fillStyle = "#00247D"; g.fillRect(0, band, w, band + 1);
  g.fillStyle = "#CF142B"; g.fillRect(0, band * 2, w, h - band * 2);
  // 8 estrellas blancas en arco sobre la franja azul
  const r = Math.min(w * .3, band * 1.05), sr = Math.min(band * .085, r * .13);
  const cx = w / 2, cy = band * 1.5 + r * .69;   // arco centrado en la franja azul
  g.fillStyle = "#fff";
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (1.5 - .375 + i * (.75 / 7));   // de -67.5° a +67.5° respecto a la vertical
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? sr * .4 : sr, ang = -Math.PI / 2 + k * Math.PI / 5;
      g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    g.closePath(); g.fill();
  }
}

export default function WavingFlag() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext("2d", { alpha: false })!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const flag = document.createElement("canvas");
    let w = 0, h = 0, pad = 0, raf = 0;
    const resize = () => {
      const k = Math.min(1, MAX_W / Math.max(1, canvas.clientWidth));
      w = canvas.width = Math.round(canvas.clientWidth * k);
      h = canvas.height = Math.round(canvas.clientHeight * k);
      pad = Math.ceil(h * AMP);
      if (w && h) drawFlag(flag, w, h + pad * 4);
      if (reduce) frame(0); // sin animación: se pinta una vez quieta
    };
    function frame(now: number) {
      if (!reduce) raf = requestAnimationFrame(frame);
      if (!w || !h) return;
      const t = reduce ? 0 : now / 1000, s0 = w / STRIPS, fw = flag.width / STRIPS, fh = flag.height;
      for (let i = 0; i < STRIPS; i++) {
        const s = reduce ? 0 : Math.sin(((t + i * LAG) / PERIOD) * Math.PI * 2);
        const x = Math.floor(i * s0), y = -pad * 2 + s * pad;
        const xw = Math.ceil(s0) + 1; // solape de 1 px para que no se vean rayas entre franjas
        ctx.drawImage(flag, i * fw, 0, fw, fh, x, y, xw, fh);
        // Abajo la tela queda en sombra; arriba, con un poco de brillo
        ctx.fillStyle = s > 0 ? `rgba(0,0,0,${(s * .28).toFixed(3)})` : `rgba(255,255,255,${(-s * .14).toFixed(3)})`;
        ctx.fillRect(x, 0, xw, h);
      }
    }
    resize();
    window.addEventListener("resize", resize);
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="flag-wave" aria-hidden="true" />;
}
