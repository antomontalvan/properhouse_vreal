// PROPER HOUSE — servidor del sitio, turnero y panel admin.
// Preparado para Hostinger (plan Unlimited / Business, Web App Node.js + MySQL).
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const config = require('./config');
const db = require('./db'); // carga también el .env si existe
const mail = require('./mail');
const { normalizarCelularAR } = require('./telefono');

const PORT = process.env.PORT || 3000;
// Sin ADMIN_PASSWORD el panel queda cerrado (no hay clave por defecto).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
// Clave estable para firmar la sesión del admin. Hostinger apaga la app cuando no tiene
// visitas y la vuelve a levantar: con una clave fija la sesión sobrevive a esos reinicios.
const SECRET = process.env.SESSION_SECRET
  || crypto.createHash('sha256').update(`ph|${ADMIN_PASSWORD}|${process.env.DB_PASSWORD || ''}|${process.env.DB_NAME || ''}`).digest('hex');

if (!ADMIN_PASSWORD) {
  console.warn('⚠  ADMIN_PASSWORD no está definida: el panel /admin queda cerrado hasta que la cargues.');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));

// Envuelve handlers async para que los errores lleguen al manejador de errores.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const esDuplicado = (e) => e && (e.code === 'ER_DUP_ENTRY' || e.errno === 1062);

/* ───────────── Utilidades de fecha (hora de Buenos Aires) ───────────── */

function ahoraBA() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { fecha: `${get('year')}-${get('month')}-${get('day')}`, hora: `${get('hour')}:${get('minute')}` };
}
const aMin = (hhmm) => { const [hh, m] = hhmm.split(':').map(Number); return hh * 60 + m; };
const aHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const diaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function diasReservables() {
  const { fecha } = ahoraBA();
  const out = [];
  for (let i = 0; out.length < config.diasReservables && i < 60; i++) {
    const f = sumarDias(fecha, i);
    if (config.diasAbiertos.includes(diaSemana(f))) out.push(f);
  }
  return out;
}

function horariosBarbero(b) {
  const out = [];
  // "hasta" es el horario del último turno (ej. 19:30 → se ofrece 19:30).
  for (let m = aMin(b.desde); m <= aMin(b.hasta); m += config.intervaloMin) out.push(aHHMM(m));
  return out;
}

const sedePorId = (id) => config.sedes.find((s) => s.id === id);
const barberoPorId = (id) => config.barberos.find((b) => b.id === id);
const barberosDeSede = (sede) => config.barberos.filter((b) => b.sede === sede);

async function barberosLibres(sede, fecha, hora) {
  const rows = await db.all("SELECT barbero FROM turnos WHERE fecha = ? AND hora = ? AND estado <> 'cancelado'", [fecha, hora]);
  const ocupados = new Set(rows.map((r) => r.barbero));
  return barberosDeSede(sede).filter((b) => horariosBarbero(b).includes(hora) && !ocupados.has(b.id));
}

async function disponibilidad(sede, barbero, fecha) {
  const ahora = ahoraBA();
  const candidatos = barbero && barbero !== 'cualquiera' ? [barberoPorId(barbero)] : barberosDeSede(sede);
  const horas = new Set();
  candidatos.forEach((b) => horariosBarbero(b).forEach((x) => horas.add(x)));
  const tomados = await db.all("SELECT barbero, hora FROM turnos WHERE fecha = ? AND sede = ? AND estado <> 'cancelado'", [fecha, sede]);
  return [...horas].sort().map((hora) => {
    const pasado = fecha < ahora.fecha || (fecha === ahora.fecha && aMin(hora) <= aMin(ahora.hora) + 15);
    const libre = candidatos.some((b) =>
      horariosBarbero(b).includes(hora) && !tomados.some((t) => t.barbero === b.id && t.hora === hora));
    return { hora, disponible: libre && !pasado };
  });
}

/* ───────────── Validación ───────────── */

const limpiar = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');

function validarTurno(body, { admin = false } = {}) {
  const sede = sedePorId(body.sede);
  if (!sede) return { error: 'Elegí una sede.' };
  const barbero = body.barbero || 'cualquiera';
  if (barbero !== 'cualquiera') {
    const b = barberoPorId(barbero);
    if (!b || b.sede !== sede.id) return { error: 'Ese barbero no atiende en esta sede.' };
  }
  const servicios = Array.isArray(body.servicios) ? body.servicios.filter((s) => config.servicios.some((x) => x.id === s)) : [];
  if (!servicios.length) return { error: 'Elegí al menos un servicio.' };
  const fecha = String(body.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Elegí un día.' };
  if (!admin && !diasReservables().includes(fecha)) return { error: 'Ese día no está disponible.' };
  if (admin && !config.diasAbiertos.includes(diaSemana(fecha))) return { error: 'Ese día la barbería está cerrada.' };
  const hora = String(body.hora || '');
  if (!/^\d{2}:\d{2}$/.test(hora)) return { error: 'Elegí un horario.' };
  const nombre = limpiar(body.nombre, 60);
  if (nombre.length < 2) return { error: 'Escribí tu nombre.' };
  let tel = soloDigitos(body.telefono);
  if (admin) {
    if (tel.length < 8 || tel.length > 15) return { error: 'Revisá el teléfono.' };
    // Si es un celular argentino, se guarda como 549… (así andan los links de WhatsApp y llamada).
    tel = normalizarCelularAR(tel) || tel;
  } else {
    // Celular del cliente, guardado en formato internacional (549…) para escribirle desde el admin.
    tel = normalizarCelularAR(tel);
    if (!tel) return { error: 'Revisá el teléfono: con código de área, sin 0 ni 15 (ej. 11 2345 6789).' };
  }
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(email)) return { error: 'Revisá el email.' };
  if (!admin && !email) return { error: 'Escribí tu email para mandarte el resumen del turno.' };
  return { sede, barbero, servicios, fecha, hora, nombre, telefono: tel, email: email || null, nota: limpiar(body.nota, 200) || null };
}

async function crearTurno(v, origen) {
  const disp = (await disponibilidad(v.sede.id, v.barbero, v.fecha)).find((s) => s.hora === v.hora);
  if (origen === 'web' && (!disp || !disp.disponible)) return { error: 'Ese horario ya no está disponible. Elegí otro.', status: 409 };
  let asignado = v.barbero;
  if (asignado === 'cualquiera') {
    const libres = await barberosLibres(v.sede.id, v.fecha, v.hora);
    if (!libres.length) return { error: 'Ese horario ya no está disponible. Elegí otro.', status: 409 };
    // Reparte: el barbero libre con menos turnos ese día.
    const cargas = await Promise.all(libres.map(async (b) => ({
      id: b.id,
      n: Number((await db.get("SELECT COUNT(*) AS n FROM turnos WHERE barbero = ? AND fecha = ? AND estado <> 'cancelado'", [b.id, v.fecha])).n),
    })));
    asignado = cargas.sort((a, b) => a.n - b.n)[0].id;
  } else if (!horariosBarbero(barberoPorId(asignado)).includes(v.hora)) {
    return { error: 'El barbero no atiende en ese horario.', status: 400 };
  }
  try {
    const r = await db.run(`INSERT INTO turnos (sede, barbero, servicios, fecha, hora, nombre, telefono, email, nota, origen, slot_activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [v.sede.id, asignado, JSON.stringify(v.servicios), v.fecha, v.hora, v.nombre, v.telefono, v.email, v.nota, origen, `${asignado}|${v.fecha}|${v.hora}`]);
    return { turno: await leerTurno(r.insertId) };
  } catch (e) {
    if (esDuplicado(e)) return { error: 'Ese horario se acaba de ocupar. Elegí otro.', status: 409 };
    throw e;
  }
}

const COLS_TURNO = 'id, sede, barbero, servicios, fecha, hora, nombre, telefono, email, nota, estado, origen, creado, cancelado, mail_estado';
const parseTurno = (t) => t && { ...t, servicios: JSON.parse(t.servicios || '[]') };
async function leerTurno(id) {
  return parseTurno(await db.get(`SELECT ${COLS_TURNO} FROM turnos WHERE id = ?`, [id]));
}

/** Manda el resumen por mail y guarda el resultado en el turno. */
async function enviarResumenMail(t) {
  const r = await mail.enviarResumen(t);
  if (r.estado === 'enviado' || r.estado === 'error') {
    await db.run('UPDATE turnos SET mail_estado = ? WHERE id = ?', [r.estado, t.id]).catch(() => {});
  }
  return r;
}

/* ───────────── Límite simple de pedidos por IP ───────────── */

function limitador(max, ventanaMs) {
  const hits = new Map();
  // Borra las IPs que ya no tienen intentos dentro de la ventana, para no acumular memoria.
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) if (!arr.some((t) => now - t < ventanaMs)) hits.delete(k);
  }, ventanaMs).unref();
  return (req, res, next) => {
    const k = req.ip; const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < ventanaMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Demasiados intentos. Probá en unos minutos.' });
    arr.push(now); hits.set(k, arr); next();
  };
}

/* ───────────── Sesión admin (cookie firmada) ───────────── */

function firmar(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function verificar(token) {
  try {
    if (!token || !token.includes('.')) return null;
    const [data, sig] = token.split('.');
    const ok = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
    if (sig.length !== ok.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(ok))) return null;
    const p = JSON.parse(Buffer.from(data, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
const leerCookie = (req, name) => (req.headers.cookie || '').split(';').map((c) => c.trim().split('='))
  .find(([k]) => k === name)?.[1];

function soloAdmin(req, res, next) {
  if (!verificar(leerCookie(req, 'ph_admin'))) return res.status(401).json({ error: 'Sesión vencida. Volvé a entrar.' });
  next();
}

/* ───────────── API pública ───────────── */

app.get('/api/info', (req, res) => {
  res.json({
    sedes: config.sedes,
    barberos: config.barberos,
    servicios: config.servicios,
    dias: diasReservables(),
    ahora: ahoraBA(),
    categorias: config.categoriasProducto,
    mailActivo: mail.activo(),
  });
});

app.get('/api/disponibilidad', h(async (req, res) => {
  const { sede, barbero, fecha } = req.query;
  if (!sedePorId(sede) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return res.status(400).json({ error: 'Datos incompletos.' });
  if (barbero && barbero !== 'cualquiera' && barberoPorId(barbero)?.sede !== sede) return res.status(400).json({ error: 'Barbero inválido.' });
  res.json({ fecha, horarios: await disponibilidad(sede, barbero, fecha) });
}));

app.post('/api/turnos', limitador(8, 10 * 60 * 1000), h(async (req, res) => {
  const v = validarTurno(req.body);
  if (v.error) return res.status(400).json(v);
  const r = await crearTurno(v, 'web');
  if (r.error) return res.status(r.status).json({ error: r.error });
  const t = r.turno;
  res.status(201).json({
    id: t.id, fecha: t.fecha, hora: t.hora, sede: t.sede,
    barbero: barberoPorId(t.barbero)?.nombre, mailActivo: mail.activo(),
  });
  // El mail sale después de responder: así el cliente no espera al SMTP.
  enviarResumenMail(t).catch((e) => console.error(`Mail: turno #${t.id}: ${e.message}`));
}));

app.get('/api/productos', h(async (req, res) => {
  res.json(await db.all('SELECT id, nombre, categoria, descripcion, imagen FROM productos WHERE visible = 1 ORDER BY orden, id'));
}));

// Fotos subidas desde el admin (guardadas en la base).
app.get('/media/:id', h(async (req, res) => {
  const img = await db.get('SELECT mime, datos FROM imagenes WHERE id = ?', [Number(req.params.id) || 0]);
  if (!img) return res.status(404).end();
  res.set('Content-Type', img.mime);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(img.datos);
}));

/* ───────────── API admin ───────────── */

app.post('/api/admin/login', limitador(10, 15 * 60 * 1000), (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Falta configurar la contraseña del panel (ADMIN_PASSWORD).' });
  const pass = String(req.body?.password || '');
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Contraseña incorrecta.' });
  const token = firmar({ exp: Date.now() + 12 * 3600 * 1000 });
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `ph_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'ph_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/sesion', soloAdmin, (req, res) => res.json({ ok: true }));

app.get('/api/admin/turnos', soloAdmin, h(async (req, res) => {
  const { desde, hasta, sede, barbero, estado, q } = req.query;
  const where = []; const args = [];
  if (desde) { where.push('fecha >= ?'); args.push(String(desde)); }
  if (hasta) { where.push('fecha <= ?'); args.push(String(hasta)); }
  if (sede) { where.push('sede = ?'); args.push(String(sede)); }
  if (barbero) { where.push('barbero = ?'); args.push(String(barbero)); }
  if (estado) { where.push('estado = ?'); args.push(String(estado)); }
  if (q) { where.push('(nombre LIKE ? OR telefono LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const sql = `SELECT ${COLS_TURNO} FROM turnos ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY fecha, hora, id LIMIT 1000`;
  const turnos = (await db.all(sql, args)).map(parseTurno);
  const hoy = ahoraBA().fecha;
  const contar = async (sql2, a2) => Number((await db.get(sql2, a2)).n);
  const resumen = {
    hoy: await contar("SELECT COUNT(*) AS n FROM turnos WHERE fecha = ? AND estado = 'confirmado'", [hoy]),
    proximos: await contar("SELECT COUNT(*) AS n FROM turnos WHERE fecha >= ? AND estado = 'confirmado'", [hoy]),
    cancelados: await contar("SELECT COUNT(*) AS n FROM turnos WHERE fecha >= ? AND estado = 'cancelado'", [hoy]),
  };
  res.json({ turnos, resumen, hoy });
}));

app.post('/api/admin/turnos', soloAdmin, h(async (req, res) => {
  const v = validarTurno(req.body, { admin: true });
  if (v.error) return res.status(400).json(v);
  const r = await crearTurno(v, 'admin');
  if (r.error) return res.status(r.status).json({ error: r.error });
  // Si se cargó el email del cliente, también le llega el resumen.
  const m = r.turno.email ? await enviarResumenMail(r.turno) : { estado: 'sin-email' };
  res.status(201).json({ ...r.turno, mail_estado: m.estado === 'enviado' || m.estado === 'error' ? m.estado : null });
}));

app.patch('/api/admin/turnos/:id', soloAdmin, h(async (req, res) => {
  const t = await leerTurno(Number(req.params.id) || 0);
  if (!t) return res.status(404).json({ error: 'No existe ese turno.' });
  const estado = req.body?.estado;
  if (!['confirmado', 'cancelado', 'atendido'].includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });
  try {
    const slot = estado === 'cancelado' ? null : `${t.barbero}|${t.fecha}|${t.hora}`;
    await db.run('UPDATE turnos SET estado = ?, slot_activo = ?, cancelado = ? WHERE id = ?',
      [estado, slot, estado === 'cancelado' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null, t.id]);
  } catch (e) {
    if (esDuplicado(e)) return res.status(409).json({ error: 'Ese horario ya lo tomó otro turno: no se puede reactivar.' });
    throw e;
  }
  res.json(await leerTurno(t.id));
}));

// Reenviar el resumen por mail (por si falló o el cliente no lo encuentra).
app.post('/api/admin/turnos/:id/mail', soloAdmin, h(async (req, res) => {
  const t = await leerTurno(Number(req.params.id) || 0);
  if (!t) return res.status(404).json({ error: 'No existe ese turno.' });
  if (!mail.activo()) return res.status(400).json({ error: 'El envío de mails no está configurado.' });
  if (!t.email) return res.status(400).json({ error: 'Este turno no tiene email.' });
  const r = await enviarResumenMail(t);
  if (r.estado !== 'enviado') return res.status(502).json({ error: `No se pudo enviar: ${r.detalle}` });
  res.json({ ok: true });
}));

app.delete('/api/admin/turnos/:id', soloAdmin, h(async (req, res) => {
  const r = await db.run('DELETE FROM turnos WHERE id = ?', [Number(req.params.id) || 0]);
  if (!r.affectedRows) return res.status(404).json({ error: 'No existe ese turno.' });
  res.json({ ok: true });
}));

/* Productos */

async function guardarImagen(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) return null;
  const r = await db.run('INSERT INTO imagenes (mime, datos) VALUES (?, ?)', [`image/${m[1]}`, buf]);
  return `/media/${r.insertId}`;
}
async function borrarImagenSubida(ruta) {
  const m = /^\/media\/(\d+)$/.exec(ruta || '');
  if (m) await db.run('DELETE FROM imagenes WHERE id = ?', [Number(m[1])]);
}
function validarProducto(body) {
  const nombre = limpiar(body.nombre, 60);
  if (nombre.length < 2) return { error: 'Escribí el nombre del producto.' };
  const categoria = config.categoriasProducto.includes(body.categoria) ? body.categoria : 'OTRO';
  return { nombre, categoria, descripcion: limpiar(body.descripcion, 120), visible: body.visible === false ? 0 : 1 };
}
const ERROR_IMG = 'La imagen tiene que ser JPG, PNG o WebP de hasta 5 MB.';

app.get('/api/admin/productos', soloAdmin, h(async (req, res) => {
  res.json(await db.all('SELECT * FROM productos ORDER BY orden, id'));
}));

app.post('/api/admin/productos', soloAdmin, h(async (req, res) => {
  const v = validarProducto(req.body);
  if (v.error) return res.status(400).json(v);
  const imagen = req.body.imagenData ? await guardarImagen(req.body.imagenData) : null;
  if (req.body.imagenData && !imagen) return res.status(400).json({ error: ERROR_IMG });
  const { o } = await db.get('SELECT COALESCE(MAX(orden), 0) + 1 AS o FROM productos');
  const r = await db.run('INSERT INTO productos (nombre, categoria, descripcion, imagen, visible, orden) VALUES (?, ?, ?, ?, ?, ?)',
    [v.nombre, v.categoria, v.descripcion, imagen, v.visible, Number(o)]);
  res.status(201).json(await db.get('SELECT * FROM productos WHERE id = ?', [r.insertId]));
}));

app.put('/api/admin/productos/:id', soloAdmin, h(async (req, res) => {
  const p = await db.get('SELECT * FROM productos WHERE id = ?', [Number(req.params.id) || 0]);
  if (!p) return res.status(404).json({ error: 'No existe ese producto.' });
  const v = validarProducto(req.body);
  if (v.error) return res.status(400).json(v);
  let imagen = p.imagen;
  if (req.body.imagenData) {
    const nueva = await guardarImagen(req.body.imagenData);
    if (!nueva) return res.status(400).json({ error: ERROR_IMG });
    await borrarImagenSubida(p.imagen); imagen = nueva;
  } else if (req.body.quitarImagen) { await borrarImagenSubida(p.imagen); imagen = null; }
  await db.run('UPDATE productos SET nombre = ?, categoria = ?, descripcion = ?, imagen = ?, visible = ? WHERE id = ?',
    [v.nombre, v.categoria, v.descripcion, imagen, v.visible, p.id]);
  res.json(await db.get('SELECT * FROM productos WHERE id = ?', [p.id]));
}));

app.post('/api/admin/productos/orden', soloAdmin, h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const conn = await db.pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const [i, id] of ids.entries()) await conn.execute('UPDATE productos SET orden = ? WHERE id = ?', [i + 1, id]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  res.json({ ok: true });
}));

app.delete('/api/admin/productos/:id', soloAdmin, h(async (req, res) => {
  const p = await db.get('SELECT * FROM productos WHERE id = ?', [Number(req.params.id) || 0]);
  if (!p) return res.status(404).json({ error: 'No existe ese producto.' });
  await db.run('DELETE FROM productos WHERE id = ?', [p.id]);
  await borrarImagenSubida(p.imagen);
  res.json({ ok: true });
}));

/* ───────────── Estáticos ───────────── */

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '7d',
  // HTML, CSS y JS: el navegador siempre consulta si hay versión nueva (así los cambios
  // se ven apenas se publica). Imágenes y fuentes sí quedan guardadas 7 días.
  setHeaders: (res, file) => {
    if (/\.(html|css|js)$/.test(file)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Algo salió mal. Probá de nuevo.' });
});

db.init()
  .then(() => app.listen(PORT, () => console.log(`PROPER HOUSE en el puerto ${PORT}  ·  admin en /admin`)))
  .catch((e) => {
    console.error('No se pudo conectar a la base de datos:', e.message);
    process.exit(1);
  });
