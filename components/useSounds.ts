"use client";
import { useEffect, useRef, useState } from "react";

// Sonidos generados con Web Audio (sin archivos): golpecitos de bolitas, "pop" al salir y campanitas al ganar.
export function useSounds() {
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
    clack: () => { if (!muted) tone(900 + Math.random() * 900, 0, .03, "square", .025); },
    tick: () => { if (!muted) tone(1400, 0, .05, "square", .05); },
    pop: () => { if (!muted) { tone(520, 0, .12, "sine", .2); tone(1040, .06, .2, "triangle", .12); } },
    win: () => {
      if (muted) return;
      [784, 988, 1175, 1568, 1319, 1568].forEach((f, i) => tone(f, i * .12, .5, "triangle", .18));
      [2093, 2637, 3136].forEach((f, i) => tone(f, .8 + i * .09, .7, "sine", .08));
    },
  };
}
