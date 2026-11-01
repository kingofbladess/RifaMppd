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

## Probar desde celulares en la red local

1. Laptop y celulares en la **misma red WiFi**.
2. En la carpeta del proyecto: `npm run red` (HTTPS en el puerto 3001; la primera vez descarga un certificado de prueba).
   Para el evento usa **`npm run rapido`**: compila una vez (1–2 min) y sirve la versión optimizada, mucho más rápida que `npm run red` (que compila cada página al abrirla). Necesita que `npm run red` se haya corrido al menos una vez para tener el certificado. Si no cambiaste código, `npm run rapido:sin-compilar` arranca al instante.
3. Si Windows pregunta por el firewall, permite el acceso en **redes privadas**.
4. En el celular abre **https://TU-IP:3001**, usando la IP que muestra la terminal en la línea "Network" (o la de `ipconfig`, "Dirección IPv4"). Si el router te asigna otra IP no hay que cambiar nada en el código. Saldrá un aviso de "conexión no privada" (el certificado es de prueba):
   Android → *Configuración avanzada → Continuar*; iPhone → *Mostrar detalles → visitar este sitio web*.

Hace falta HTTPS porque los navegadores no permiten usar la cámara en `http://` salvo en `localhost`.
Para **instalar** la app en el celular se necesita un certificado válido: eso se logra publicándola en Vercel.

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

### Infopress (red local)

Si `INFOPRESS_API_KEY` tiene valor, la consulta usa **Infopress** (`GET /v1/consulta/V12345678` con `X-API-Key`) en lugar de `PERSON_API_URL`.
Infopress **solo se alcanza dentro de la red** donde está `192.168.150.30`, así que la app debe correr en una PC de esa red
(`npm run red`), no en Vercel. Esa PC también necesita internet para guardar en Supabase; lo que se registre se ve en Vercel al instante.

- Archivo `hosts` de esa PC (Windows: `C:\Windows\System32\drivers\etc\hosts`, como administrador):
  `192.168.150.30 infopress.sidefensa.nexus.ia.ve` y `192.168.150.30 s3.infopress.sidefensa.nexus.ia.ve`.
- En la pantalla de registro, el botón **V/E** junto a la cédula elige la nacionalidad (por defecto V).
- Nombre y fecha de nacimiento salen de SAIME (o IPSFA si SAIME no responde); el grado sale de IPSFA (o Resoluciones).
- La foto llega como enlace S3 privado: el servidor la descarga y la guarda en Supabase al registrar. Si está `pending`,
  se vuelve a consultar tras 2 s y 4 s; si sigue sin foto, el operador la toma con la cámara.
- Cada consulta puede tardar hasta ~2 minutos (timeout de 125 s) y gasta cuota (60 por minuto, 4 simultáneas por clave).

**Modo demo:** si `PERSON_API_URL` e `INFOPRESS_API_KEY` están vacíos, la app responde con datos ficticios para probar el flujo:
cédula terminada en **0** = no encontrada, en número **par** = con foto, **impar** = sin foto.

## Instalación

1. **Supabase:** SQL Editor → pega `supabase/schema.sql` → Run. Sirve para instalación nueva y para actualizar la v1.
   Ajusta la rifa en Table Editor → `raffles` (nombre, premio, rango de números).
2. **Variables** (`.env.local` en local, o Environment Variables en Vercel) — ver `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (tu `sb_secret_...`), `ADMIN_PASSWORD`, `SESSION_SECRET`,
   `PERSON_API_URL`, `PERSON_API_TOKEN` (o `INFOPRESS_BASE_URL`, `INFOPRESS_API_KEY`).
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

### Fotos durante el giro

La tarjeta prepara antes de animar únicamente los retratos de su secuencia visual (hasta 101 posiciones en un giro de 10 segundos), también con más de 400 inscritos. Descarga hasta cuatro fotos a la vez, reintenta una vez y conserva versiones decodificadas de 192 × 192 px en memoria. Durante el giro no necesita descargar las fotos de la tarjeta; la secuencia y el ganador mantienen sus datos correspondientes.

La pantalla muestra el progreso de preparación, con un máximo de 20 segundos de espera para las fotos. Si una foto falta o sigue sin responder, informa y muestra las iniciales de esa persona, sin excluirla ni cambiar el ganador. No requiere cambios de base de datos ni de configuración.

Pruebas del cargador (Node con soporte TypeScript): `node --test tests/spin-photos.test.mjs`.

## Lista de participantes de la rifa

La asistencia y la elegibilidad para ganar se administran por separado. `/admin/rifa` permite importar Excel **.xlsx**, CSV o escribir cédulas manualmente. Para Excel puede elegirse la hoja y la columna de cédula; para archivos `.xls` antiguos, guardar primero como `.xlsx`. La vista previa identifica cédulas duplicadas o inválidas y cruza por cédula: registrados incluidos, personas de la lista aún no registradas y asistentes fuera de la lista. Al guardar, la importación consulta Infopress/API y registra automáticamente las personas nuevas con datos completos y foto; reutiliza a las ya registradas. Nunca elimina asistentes.

Antes de desplegar esta versión sobre una instalación existente, ejecutar `supabase/eligibility.sql` en el SQL Editor de Supabase. Para una instalación nueva, el bloque ya está incluido en `supabase/schema.sql`. La lista se guarda privada y por rifa; solo el administrador la gestiona. Sin lista, lista vacía o error de lectura, el sorteo **no vuelve al padrón completo**: queda bloqueado. Las cédulas pendientes se habilitan automáticamente al registrarse en el evento.

El servidor filtra candidatos por la lista, ganadores anteriores y participantes presentes en la ruleta, y después aplica sin cambios `elegirGanador` (civil/militar, pesos por grado y exclusiones). La pantalla pública sigue mostrando a todos los asistentes, con la misma animación. La entrada manual y la importación añaden cédulas a la lista existente sin eliminar integrantes. Para quitar integrantes se utiliza «Administrar lista» y «Guardar cambios»; una versión desactualizada se rechaza para evitar sobrescribir cambios de otras pestañas. Solo afecta a sorteos posteriores y no modifica resultados existentes.

Pruebas de selección e importación: `node --test tests/*.test.mjs`.

## Privacidad y seguridad

- RLS activado sin políticas: la clave pública no puede leer nada. Solo el servidor (clave secreta) accede.
- Buckets privados; las fotos se ven solo con enlaces firmados que caducan.
- Completa `/privacidad` (responsable, proveedor de la API, plazo de borrado) y cumple la ley de tu país
  (en Colombia, Ley 1581 de 2012; las rifas con venta de boletas requieren autorización de Coljuegos).
- Regenera la clave secreta de Supabase si se compartió por chat, y no subas `.env.local` al repositorio.

## Pendiente

- Documentación de la API real (URL, autenticación, formato de respuesta y de la foto).

Decidido: la foto actualizada **no** se envía de vuelta a la API; no habrá pagos, varios números por persona ni exportación a Excel.

### Registro automático desde la lista

«Guardar lista y registrar personas» conserva la lista vigente, añade las cédulas nuevas y procesa secuencialmente solo las cédulas de la entrada o archivo actual, sin recorrer la lista anterior. Cada cédula existente se reutiliza; para las nuevas se consulta Infopress/API, se convierte la foto a JPEG y se usa el mismo registro atómico de operadores. Se elige nacionalidad V/E para las consultas y se muestra avance, registros nuevos, existentes, errores y casos sin procesar. Puede detenerse o repetirse sin duplicar cédulas. Mantén la pantalla abierta durante el proceso. «Completar registros pendientes» procesa únicamente las cédulas de la lista guardada que no figuraban registradas al abrir la pantalla.

Si falta nombre, fecha o foto, la API no encuentra a la persona o no está configurada, se informa el caso y no se fabrican datos. El modo demo no se utiliza para registrar una importación. Esos casos requieren completar el registro o reintentar cuando la API esté disponible.

## Origen del registro y confirmación del operador

El panel y el módulo de lista identifican los registros creados automáticamente desde la lista, actuales y futuros, mediante la misma huella de foto que la importación utiliza desde su primera versión. Estar incluido en la lista o tener una foto de API no significa haber sido creado por importación. Los registros de otras vías mantienen su clasificación independiente.

Ejecutar `supabase/operator-confirmations.sql` para habilitar la confirmación explícita del operador. En `/registro`, al consultar una persona creada por la lista, el operador puede pulsar «Confirmar registro con operador». Se conserva la primera fecha y el operador; los reintentos no duplican la confirmación ni al participante.

El módulo de lista, su cruce y el PDF usan palometas: ✅ indica pertenencia a la lista sin registro por otra vía; ✅✅ indica lista más registro por otra vía o confirmación del operador. Las dos incluyen los registros que ya existían antes de importar la lista. Una cédula de la lista aún pendiente de registro tiene una palometa y conserva su estado pendiente. Los registros fuera de la lista no reciben palometas por pertenencia; los casos de origen/confirmación no verificable se muestran «Por verificar». Los filtros de una y dos palometas aplican la misma regla que el PDF. No se altera el origen histórico del registro para representar esta clasificación.

«Solo lista» significa que no hay constancia de confirmación del operador en el sistema; no demuestra ausencia física. Las consultas/atenciones anteriores que nunca se registraron como confirmación no pueden reconstruirse retrospectivamente. Si falta la tabla o falla su lectura se muestra «confirmación no disponible», sin afirmar que no exista. No se cambia la elegibilidad ni la pantalla pública.
