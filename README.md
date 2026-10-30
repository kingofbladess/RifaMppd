# Sistema de Rifa · Next.js + Supabase + Vercel (v2)

Registro asistido por operadores: se escribe la **cédula**, una API externa devuelve los **datos y la foto**
de la persona, el operador revisa (y puede **tomar una foto nueva** si no hay o si está vieja) y guarda.
Se asigna un **número único** y el día del sorteo una **ruleta** muestra nombres y fotos.
Varios operadores pueden registrar **al mismo tiempo**, cada uno con su usuario.

## Pantallas

| Ruta | Quién | Qué hace |
|---|---|---|
| `/login` | Todos | Usuario y contraseña |
| `/registro` | Operadores y admin | Cédula → consulta API → vista previa → guardar → número. El foco vuelve a la cédula para el siguiente |
| `/admin` | Admin | Inscritos en vivo (se refresca cada 15 s), conteo por operador, foto, quién registró |
| `/admin/usuarios` | Admin | Crear operadores, cambiar contraseña, activar/desactivar |
| `/ruleta` | Admin | Ruleta con nombre, número y foto. El ganador lo elige el servidor y queda guardado |
| `/privacidad` | Público | Plantilla de política de datos (complétala) |

## App en el celular (operadores)

La app es una **PWA**: se instala desde el navegador, sin Play Store ni App Store, y se actualiza sola con cada despliegue.

- **Android (Chrome):** abre la URL de Vercel, entra y toca **Instalar** en el aviso de abajo (o menú ⋮ → *Instalar app*).
- **iPhone (Safari):** botón **Compartir** → **Agregar a pantalla de inicio**.

Se abre en pantalla completa directo en `/registro`, usa la cámara trasera para la foto y muestra un aviso si no hay internet.
No guarda datos personales en el celular: todo se consulta y se guarda en el servidor.

## Flujo de registro

1. El operador escribe la cédula y presiona Enter.
2. La app consulta **a la vez** la API de personas y si esa cédula ya está inscrita (si lo está, avisa con el número y quién la registró).
3. Vista previa con los datos editables y la foto:
   - **Con foto de la API:** se puede usar tal cual o pulsar **Actualizar foto** (si la API informa la fecha de la foto y tiene 5 años o más, se sugiere actualizarla).
   - **Sin foto:** la cámara se abre sola.
   - **No encontrada / API caída:** formulario vacío para registrar a mano.
4. Teléfono → **Guardar**. Aparece el número y la casilla de cédula queda lista para la siguiente persona.
5. Opcional: adjuntar foto de la cédula (queda en un bucket privado).

## Conectar la API de personas

Variables `PERSON_API_URL` (con `{doc}` donde va el número, ej. `https://api.tuproveedor.com/personas/{doc}`)
y `PERSON_API_TOKEN` (se envía como `Authorization: Bearer ...`). La consulta se hace **desde el servidor**,
así el token nunca llega al navegador.

El adaptador está en `lib/person-api.ts`. Reconoce nombres de campo comunes (`nombres`, `apellidos`, `nombre_completo`,
`cedula`, `fecha_nacimiento`, `municipio`, `rango`/`cargo`, `celular`, `foto`, `foto_url`, `foto_base64`, `fecha_foto`…) y la foto puede venir
en base64, data URL o URL. Si la API real usa otros nombres o requiere otro método de autenticación, solo se ajusta ese archivo.

**Modo demo:** si `PERSON_API_URL` está vacío, la app responde con datos ficticios para probar el flujo:
cédula terminada en **0** = no encontrada, en número **par** = con foto, **impar** = sin foto.

## Instalación

1. **Supabase:** SQL Editor → pega `supabase/schema.sql` → Run. Sirve para instalación nueva y para actualizar la v1.
   Ajusta la rifa en Table Editor → `raffles` (nombre, premio, rango de números).
2. **Variables** (`.env.local` en local, o Environment Variables en Vercel) — ver `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (tu `sb_secret_...`), `ADMIN_PASSWORD`, `SESSION_SECRET`,
   `PERSON_API_URL`, `PERSON_API_TOKEN`.
3. Local: `npm install && npm run dev`. Vercel: importa el repo y despliega.
4. Entra con usuario `admin` y la contraseña de `ADMIN_PASSWORD`, ve a **Usuarios** y crea un usuario por operador.

## Detalles técnicos

- **Número único y concurrencia:** la función SQL `register_participant` toma un bloqueo por rifa, elige un número libre
  al azar e inserta en la misma transacción. Con varios operadores a la vez no puede repetirse el número ni la cédula
  (`unique (raffle_id, raffle_number)` y `unique (raffle_id, document_number)`).
- **Fotos:** siempre se guardan en JPG (las de la API se convierten en el navegador). Se registra si la foto es
  `api` o `camera` (columna `photo_source`).
- **Usuarios:** tabla `app_users` con contraseñas `scrypt`; sesión en cookie httpOnly firmada (12 h). Un usuario
  desactivado ya no puede guardar registros.
- **Sorteo:** `POST /api/draw` elige con `crypto.randomInt` entre quienes no han ganado y lo guarda en `draws`.

## Privacidad y seguridad

- RLS activado sin políticas: la clave pública no puede leer nada. Solo el servidor (clave secreta) accede.
- Buckets privados; las fotos se ven solo con enlaces firmados que caducan.
- Completa `/privacidad` (responsable, proveedor de la API, plazo de borrado) y cumple la ley de tu país
  (en Colombia, Ley 1581 de 2012; las rifas con venta de boletas requieren autorización de Coljuegos).
- Regenera la clave secreta de Supabase si se compartió por chat, y no subas `.env.local` al repositorio.

## Pendiente

- Documentación de la API real (URL, autenticación, formato de respuesta y de la foto).

Decidido: la foto actualizada **no** se envía de vuelta a la API; no habrá pagos, varios números por persona ni exportación a Excel.
