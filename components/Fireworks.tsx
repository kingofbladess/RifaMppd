"use client";
import { useEffect, useRef } from "react";

const COLORS = ["#ffd166", "#ff3b3b", "#2ee59d", "#ffffff", "#ff8fab", "#7cc6ff", "#f5c542"];

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Rocket = { x: number; y: number; vx: number; vy: number; targetY: number; color: string };

// Fuegos artificiales (sin sonido) en un canvas a pantalla completa: cohetes que suben y estallan con gravedad.
export default function Fireworks({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, last = performance.now(), nextLaunch = 0;
    const MAX_PARTS = 1400; // tope para que varias explosiones juntas no traben la TV
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      // Como mucho ~1280 px de ancho interno: en TV grande se estira y las chispas siguen viéndose igual de brillantes
      const dpr = Math.min(1.5, window.devicePixelRatio || 1, 1280 / Math.max(1, w));
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const rockets: Rocket[] = [];
    const parts: Particle[] = [];
    const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)];

    const explode = (x: number, y: number, color: string) => {
      const count = Math.min(reduce ? 30 : 70 + Math.floor(Math.random() * 40), Math.max(20, MAX_PARTS - parts.length));
      const ring = Math.random() < .35;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * .2;
        const sp = ring ? 4.2 : 1 + Math.random() * 4.5;
        const max = 60 + Math.random() * 40;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: max, max,
          color: Math.random() < .2 ? "#ffffff" : color, size: 1.6 + Math.random() * 1.6 });
      }
    };
    const launch = () => {
      const x = w * (.15 + Math.random() * .7);
      rockets.push({ x, y: h, vx: (Math.random() - .5) * 1.5, vy: -(9 + Math.random() * 4), targetY: h * (.12 + Math.random() * .35), color: pick() });
    };
    // Primera ráfaga de 3 a la vez
    const first = [0, 1, 2].map((i) => setTimeout(() => explode(w * (.2 + .3 * i), h * (.25 + Math.random() * .15), pick()), i * 180));

    const frame = (now: number) => {
      const dt = Math.min(2, (now - last) / 16.7); last = now;
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      if (now > nextLaunch) { launch(); if (Math.random() < .4) launch(); nextLaunch = now + (reduce ? 1400 : 380 + Math.random() * 500); }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx * dt; r.y += r.vy * dt; r.vy += .12 * dt;
        ctx.fillStyle = r.color;
        ctx.beginPath(); ctx.arc(r.x, r.y, 2.4, 0, Math.PI * 2); ctx.fill();
        if (r.y <= r.targetY || r.vy >= 0) { explode(r.x, r.y, r.color); rockets.splice(i, 1); }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vx *= .985; p.vy = p.vy * .985 + .06 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        // Chispas como cuadraditos: a este tamaño se ven igual que círculos y cuestan mucho menos
        ctx.fillRect(p.x - p.size * .9, p.y - p.size * .9, p.size * 1.8, p.size * 1.8);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { first.forEach(clearTimeout); cancelAnimationFrame(raf); window.removeEventListener("resize", resize); ctx.clearRect(0, 0, w, h); };
  }, [active]);
  return <canvas ref={ref} className="fireworks" aria-hidden="true" />;
}
