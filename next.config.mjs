/** @type {import('next').NextConfig} */
const nextConfig = {
  // Las imágenes se comprimen en el navegador antes de subir (límite de 4.5 MB por petición en Vercel).
  poweredByHeader: false,
  // Permite abrir el servidor de desarrollo desde los celulares de la red local (npm run red).
  // Sirve con cualquier IP de red privada, así no hay que cambiarla cuando el router asigna otra.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
};
export default nextConfig;
