// Servidor rápido para la laptop de la red local: usa la versión compilada (next build) en vez del
// modo desarrollo, que compila cada página al abrirla. Sirve por HTTPS para que la cámara funcione en
// los teléfonos, con el certificado que crea `npm run red` la primera vez (carpeta certificates/).
import { createServer } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import next from "next";

const port = Number(process.env.PORT || 3001);
const keyFile = "certificates/localhost-key.pem";
const certFile = "certificates/localhost.pem";
if (!existsSync(keyFile) || !existsSync(certFile)) {
  console.error("Falta el certificado HTTPS. Corre una vez `npm run red`, espera a que diga Ready, ciérralo con Ctrl+C y vuelve a intentar.");
  process.exit(1);
}

const app = next({ dev: false, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();
await app.prepare();

createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => handle(req, res))
  .listen(port, "0.0.0.0", () => {
    const ips = Object.values(networkInterfaces()).flat()
      .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => `https://${n.address}:${port}`);
    console.log(`\n  Rifa lista (modo rápido)\n  - En esta PC:   https://localhost:${port}`);
    ips.forEach((u) => console.log(`  - En la red:    ${u}`));
    console.log("");
  });
