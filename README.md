# PROPER HOUSE — sitio web + turnero + panel admin

Sitio de Proper House Studio armado sobre el Brandbook Web V6 (7 años), listo para publicar en **Hostinger, plan Unlimited** (también sirve Business o Cloud), como Web App de Node.js con base MySQL.

- **Sitio público** (`/`): tira de aniversario, header con reloj de CABA y estado abierto/cerrado, hero, La marca, Servicios, **turnero**, Sedes con Google Maps, Productos, Sumate, Contacto, frase de cultura y footer. Adaptado a celular (un breakpoint en 768px, menú a pantalla completa, botón flotante "Reservá tu turno").
- **Turnero real**: sede → barbero (o "Cualquiera") → servicios → día y horario → datos. Solo ofrece horarios libres y la base impide turnos dobles aunque dos personas reserven a la vez.
- **Panel admin** (`/admin`): ver y filtrar turnos, cancelar, marcar atendido, reactivar, eliminar, agendar turnos manuales y **ABM de productos** con foto.

Todo lo que cambia (turnos, productos y fotos subidas desde el admin) se guarda en **MySQL**. Por eso actualizar o volver a publicar el sitio nunca borra datos.

---

## Publicar en Hostinger (plan Unlimited)

### 1. Crear la base de datos
1. hPanel → **Websites** → tu sitio → **Dashboard** → **Databases** → **Management**.
2. Creá una base con nombre, usuario y contraseña. Hostinger les agrega un prefijo, por ejemplo `u123456789_properhouse`. Anotá los tres datos tal como quedan.
3. No hace falta crear tablas: la app las crea sola al arrancar la primera vez y carga los 9 productos del brandbook.

### 2. Crear la Web App
1. hPanel → **Websites** → **Create Website** → **Web App**.
2. Elegí una de dos:
   - **Upload your website files** y subí `proper-house-hostinger.zip` (el contenido ya está en la raíz del zip, sin `node_modules`).
   - **Import Git Repository**, si subís el proyecto a GitHub (cada cambio que subas se publica solo).
3. En la configuración de build:
   - Framework: **Express** (o **Other**).
   - Node.js: **22.x** (mínimo 20).
   - Archivo de entrada: `server.js`.
   - Comando de inicio: `npm start`.

### 3. Variables de entorno
En la configuración de la Web App, cargá:

| Variable | Valor |
|---|---|
| `ADMIN_PASSWORD` | La contraseña que quieras para entrar a `/admin`. |
| `DB_HOST` | `127.0.0.1` (no pongas `localhost`). |
| `DB_PORT` | `3306` |
| `DB_USER` | El usuario de la base, con el prefijo. |
| `DB_PASSWORD` | La contraseña de la base. |
| `DB_NAME` | El nombre de la base, con el prefijo. |
| `SESSION_SECRET` | Opcional. Un texto largo al azar. Si no lo ponés, se arma uno fijo a partir de las otras claves. |

Si Hostinger te ofrece el asistente para conectar la base y define `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD` y `MYSQL_DATABASE`, también funciona: la app lee esos nombres.

### 4. Publicar y probar
1. **Deploy**. Si ya estaba creada, **Restart** desde el Dashboard después de cambiar variables.
2. Entrá al sitio, hacé una reserva de prueba y fijate que aparezca en `/admin`.
3. Opcional: en phpMyAdmin vas a ver las tablas `turnos`, `productos` e `imagenes`.
4. Conectá el dominio y activá el SSL (gratis en el plan).

### A tener en cuenta en Hostinger
- **La app se apaga sola si no tiene visitas** y se prende con la siguiente. La primera carga después de un rato puede tardar unos segundos. Los datos no se pierden porque están en MySQL, y la sesión del admin tampoco se cierra.
- **No edites archivos desde el File Manager**: Hostinger los pisa en cada publicación. Los cambios se hacen en el proyecto y se vuelve a subir.
- **Backups**: el plan incluye copias automáticas, y además podés exportar la base desde phpMyAdmin cuando quieras.

---

## Resumen del turno por mail

Cuando un cliente reserva desde la web, le llega un mail con el resumen del turno: día, horario, sede con dirección y link a Google Maps, barbero, servicio y número de turno, con el WhatsApp de la sede por si no puede ir. Trae adjunto el turno para agregarlo al calendario (con recordatorio 2 horas antes). El mail tiene la estética de la marca, en blanco y negro.

Sin costo por envío: usa una casilla de correo común por SMTP. Mientras no cargues los datos de la casilla no se envía nada y el turnero funciona igual.

### Configurarlo con la casilla de Hostinger
1. hPanel → **Emails** → creá una casilla, por ejemplo `turnos@tudominio.com`.
2. Cargá estas variables en la Web App (o en tu `.env` para probar local):

| Variable | Valor |
|---|---|
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | La casilla completa, por ejemplo `turnos@tudominio.com`. |
| `SMTP_PASS` | La contraseña de esa casilla. |
| `MAIL_FROM_NAME` | Opcional. Nombre del remitente, por defecto `Proper House`. |
| `MAIL_REPLY_TO` | Opcional. A dónde llegan las respuestas del cliente (por ejemplo el mail de la barbería). |
| `MAIL_COPIA` | Opcional. Si querés recibir una copia oculta de cada resumen. |

3. Reiniciá la app y hacé una reserva de prueba con tu mail. En el admin el turno tiene que decir **"Mail ✓"**.

Para que los mails no caigan en spam, en hPanel → Emails revisá que el dominio tenga activados **SPF, DKIM y DMARC** (Hostinger los configura casi solos si el dominio está en Hostinger).

**Límite:** la casilla gratuita del plan permite 100 mails por día (cada reserva es un mail). Si algún día no alcanza, se puede usar otro servidor SMTP, como Brevo o Gmail, cambiando solo estas variables.

### En el panel admin
Cada turno muestra el email del cliente y si el mail salió ("Mail ✓" / "Mail no enviado"). Con **Reenviar mail** se le vuelve a mandar. En los turnos que cargás a mano, si ponés el email del cliente, también le llega.

---

## Probar en tu compu (opcional)

Necesitás Node 20 o más (recomendado 22 LTS) y un MySQL o MariaDB local.

```bash
npm install
cp .env.example .env    # y completá los datos de tu base local
npm start
```

Abrí `http://localhost:3000` y `http://localhost:3000/admin`. El `.env` es solo para tu compu: no lo subas a Hostinger.

---

## Dónde se editan las cosas

- **Sedes, teléfonos, barberos y sus horarios, servicios, días de atención**: `config.js`. Por ejemplo, si Alex pasa a entrar a las 14, se cambia `desde: '14:00'`.
- **Textos del sitio**: `public/index.html`. Las direcciones y teléfonos de Sedes y Contacto también están ahí (si cambian, actualizarlos en los dos lugares).
- **Colores, tipografías y espacios**: `public/css/tokens.css`. Componentes en `public/css/bundle.css` (prefijo `ph-`).
- **Productos**: desde el panel admin.

## Cómo funciona el turnero

- Turnos cada 30 minutos, desde el `desde` hasta el `hasta` de cada barbero inclusive (con 10:00 y 19:30 se ofrecen 10:00, 10:30 … 19:30).
- Al reservar, el cliente recibe el resumen del turno por mail (si está configurado, ver arriba).
- Cada turno ocupa un bloque de 30 minutos, aunque se elijan varios servicios.
- Se reserva hasta 10 días hábiles hacia adelante (martes a sábado). No se ofrecen horarios que ya pasaron (con 15 min de margen).
- "Cualquiera" asigna al barbero libre con menos turnos ese día.
- Cancelar un turno libera el horario en la web al instante.
- Límites contra abuso: 8 reservas cada 10 minutos por conexión y 10 intentos de login cada 15 minutos.

## Imágenes y logos

Todas las imágenes están en `public/img`, optimizadas para web:

| Archivo | Dónde se ve | Formato |
|---|---|---|
| `hero.jpg` | Portada (desktop recortado 16:8, celular foto completa) | 16:9 |
| `retrato-frente.jpg`, `retrato-nuca.jpg`, `retrato-perfil.jpg` | La marca (en blanco y negro, color al pasar el mouse) | 4:5, 1000 × 1250 |
| `cultura.jpg` | Frase "Vení por el corte" (se oscurece y pasa a blanco y negro) | horizontal |
| `pomada-*.jpg`, `polvo-texturizador.jpg`, `after-shave.jpg`, `cera-barba.jpg`, `aceite-barba.jpg` | Productos (carga inicial) | cuadradas, 800 × 800 |
| `favicon.svg`, `apple-touch-icon.png`, `og.jpg` | Ícono de la pestaña, ícono en celulares y vista previa al compartir el link | — |

Los logos (monograma PH y PROPER® HOUSE.) están como vector dentro de `public/index.html` (portada y footer).

Para cambiar una foto fija, reemplazá el archivo por otro con el mismo nombre y proporción. Las fotos de productos se cambian desde el panel admin.

Las fotos de aceite, cera y after shave se recrearon en un fondo de estudio beige: el producto se recortó del original, se mejoró con super-resolución (EDSR) y se ubicó sobre el fondo con sombra.

## Pendiente

- **Fotos de cada barbero**: todavía no hay; el turnero muestra nombre y horario.
