"use client";
import { useEffect, useState } from "react";

type Flake = { left: number; size: number; dur: number; delay: number; drift: number; char: string };

// Nieve que cae detrás de la ruleta. Se genera al montar para no chocar con el render del servidor.
export default function Snow({ count = 45 }: { count?: number }) {
  const [flakes, setFlakes] = useState<Flake[]>([]);
  useEffect(() => {
    setFlakes(Array.from({ length: count }, () => ({
      left: Math.random() * 100, size: 8 + Math.random() * 16, dur: 9 + Math.random() * 12,
      delay: -Math.random() * 20, drift: (Math.random() - .5) * 80, char: Math.random() < .3 ? "❄" : "•",
    })));
  }, [count]);
  return (
    <div className="snow" aria-hidden="true">
      {flakes.map((f, i) => (
        <span key={i} style={{ left: `${f.left}%`, fontSize: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`,
          ["--drift" as string]: `${f.drift}px` }}>{f.char}</span>
      ))}
    </div>
  );
}
