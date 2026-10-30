"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Registra el service worker y ofrece instalar la app (Android/Chrome) o explica cómo hacerlo en iPhone.
export default function PwaInstall() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    try { setDismissed(sessionStorage.getItem("pwa-dismissed") === "1"); } catch {}
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // La ruleta se proyecta en pantalla grande: ahí no se ofrece instalar.
  if (installed || dismissed || (!deferred && !ios) || pathname?.startsWith("/ruleta")) return null;

  return (
    <div className="install-bar">
      <img src="/icons/icon-192.png" alt="" />
      <div style={{ flex: 1 }}>
        <strong>Instala la app</strong>
        <div className="small">Acceso directo en tu celular, en pantalla completa.</div>
        {showIosHelp && (
          <div className="small" style={{ marginTop: 6 }}>
            En Safari toca <strong>Compartir</strong> (cuadro con flecha ↑) y luego <strong>Agregar a pantalla de inicio</strong>.
          </div>
        )}
      </div>
      <button type="button" className="btn" onClick={async () => {
        if (deferred) { await deferred.prompt(); await deferred.userChoice; setDeferred(null); }
        else setShowIosHelp((v) => !v);
      }}>{deferred ? "Instalar" : "Cómo"}</button>
      <button type="button" className="link" aria-label="Cerrar" onClick={() => {
        setDismissed(true);
        try { sessionStorage.setItem("pwa-dismissed", "1"); } catch {}
      }}>✕</button>
    </div>
  );
}
