// Bandera de Venezuela ondeando como marca de agua: la imagen se corta en franjas verticales
// que suben y bajan con un pequeño desfase, con sombra que simula los pliegues de la tela.
const STRIPS = 36;
const W = 100 / STRIPS + .4;                 // ancho de cada franja (%), con un poco de solape para que no se vean rayas
const BG = (100 / W) * 100;                  // la imagen completa mide lo que mide la bandera entera

export default function WavingFlag() {
  return (
    <div className="flag-wave" aria-hidden="true">
      {Array.from({ length: STRIPS }, (_, i) => (
        <span key={i} style={{
          left: `${(i * 100) / STRIPS}%`,
          width: `${W}%`,
          backgroundSize: `${BG}% 100%`,
          backgroundPosition: `${((i * 100) / STRIPS / (100 - W)) * 100}% 0`,
          animationDelay: `${-i * .09}s`,
        }} />
      ))}
    </div>
  );
}
