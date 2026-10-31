"use client";
import { useEffect, useRef } from "react";

// Bandera de Venezuela ondeando como marca de agua: la imagen se corta en franjas verticales
// que suben y bajan con un pequeño desfase, con sombra que simula los pliegues de la tela.
// Se dibuja en un solo lienzo (antes eran 36 elementos animados bajo una máscara y trababan la TV).
const STRIPS = 36;
const PERIOD = 2.6;    // segundos por ondulación
const LAG = .09;       // desfase entre franjas (s)
const AMP = .022;      // cuánto sube y baja cada franja (fracción del alto)

export default function WavingFlag() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!, ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const img = new Image();
    img.src = "/bandera-venezuela.svg";
    let w = 0, h = 0, raf = 0;
    const resize = () => { w = canvas.width = canvas.clientWidth; h = canvas.height = canvas.clientHeight; };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!img.complete || !img.naturalWidth || !w) return;
      const t = reduce ? 0 : now / 1000, sw = w / STRIPS, pad = h * AMP, fh = h - pad * 2;
      const iw = img.naturalWidth / STRIPS, ih = img.naturalHeight;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < STRIPS; i++) {
        const s = reduce ? 0 : Math.sin(((t + i * LAG) / PERIOD) * Math.PI * 2);
        const x = i * sw, y = pad + s * pad;
        // +0.6 px de solape para que no se vean rayas entre franjas
        ctx.drawImage(img, i * iw, 0, iw, ih, x, y, sw + .6, fh);
        // Abajo la tela queda en sombra; arriba, con un poco de brillo
        ctx.fillStyle = s > 0 ? `rgba(0,0,0,${(s * .22).toFixed(3)})` : `rgba(255,255,255,${(-s * .12).toFixed(3)})`;
        ctx.fillRect(x, y, sw + .6, fh);
      }
      // Bordes que se desvanecen (como la máscara radial que tenía antes)
      ctx.globalCompositeOperation = "destination-in";
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.scale(w / 2 * Math.SQRT2, h / 2 * Math.SQRT2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(.5, "#000"); g.addColorStop(.78, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="flag-wave" aria-hidden="true" />;
}
