"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Refresca los datos del servidor cada N segundos (para ver en vivo lo que registran los operadores).
export default function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
