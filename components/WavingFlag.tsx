"use client";
import { useEffect, useRef } from "react";

// Bandera de Venezuela ondeando a pantalla completa, como marca de agua detrás del cartel de ganador.
// En cada cuadro se dibujan las tres franjas como trazos curvos (bordes suaves, sin escalones),
// las 8 estrellas siguiendo la ola y un degradado horizontal que hace de pliegues de la tela.
// Son pocas operaciones por cuadro, así que va fluido en TVs modestas.
const PERIOD = 2.6;    // segundos por ondulación
const WAVES = 2.8;     // ondas a lo ancho de la pantalla
const AMP = .025;      // cuánto sube y baja la tela (fracción del alto)
const MAX_W = 1920;    // resolución interna máxima
const STEP = 12;       // separación (px) entre puntos de cada borde curvo

export default function WavingFlag() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext("2d", { alpha: false })!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, pad = 0, raf = 0;
    const resize = () => {
      const want = canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2);
      const k = Math.min(want, MAX_W) / Math.max(1, canvas.clientWidth);
      w = canvas.width = Math.round(canvas.clientWidth * k);
      h = canvas.height = Math.round(canvas.clientHeight * k);
      pad = h * AMP;
      if (reduce) frame(0); // sin animación: se pinta una vez quieta
    };
    // Desplazamiento vertical de la tela en la posición x
    let t = 0;
    const wave = (x: number) => Math.sin((t / PERIOD + (x / w) * WAVES) * Math.PI * 2);

    // Rellena desde arriba de la pantalla hasta el borde curvo situado en "base"
    const band = (base: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= w + STEP; x += STEP) ctx.lineTo(x, base + wave(x) * pad);
      ctx.lineTo(w, 0);
      ctx.closePath();
      ctx.fill();
    };

    const star = (x: number, y: number, r: number) => {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? r * .4 : r, a = -Math.PI / 2 + k * Math.PI / 5;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    };

    function frame(now: number) {
      if (!reduce) raf = requestAnimationFrame(frame);
      if (!w || !h) return;
      t = reduce ? 0 : now / 1000;
      const b = h / 3;
      ctx.fillStyle = "#CF142B"; ctx.fillRect(0, 0, w, h);
      band(b * 2, "#00247D");
      band(b, "#FFCC00");

      // 8 estrellas en arco sobre la franja azul, siguiendo la ola
      const r = Math.min(w * .3, b * 1.05), sr = Math.min(b * .085, r * .13);
      const cx = w / 2, cy = b * 1.5 + r * .69;
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 8; i++) {
        const a = Math.PI * (1.125 + i * (.75 / 7));
        const x = cx + Math.cos(a) * r;
        star(x, cy + Math.sin(a) * r + wave(x) * pad, sr);
      }

      // Pliegues: donde la tela baja queda en sombra, donde sube brilla un poco
      const g = ctx.createLinearGradient(0, 0, w, 0), n = 48;
      for (let i = 0; i <= n; i++) {
        const s = wave((i / n) * w);
        g.addColorStop(i / n, s > 0 ? `rgba(0,0,0,${(s * .3).toFixed(3)})` : `rgba(255,255,255,${(-s * .14).toFixed(3)})`);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    resize();
    window.addEventListener("resize", resize);
    if (!reduce) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="flag-wave" aria-hidden="true" />;
}
