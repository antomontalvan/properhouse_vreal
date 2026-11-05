// Base de datos MySQL / MariaDB (la que incluye Hostinger).
// Todo lo que cambia (turnos, productos y fotos subidas) vive acá, así que
// actualizar o redeployar el sitio nunca borra datos.
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

// Carga un .env si existe (opcional; en Hostinger se usan las variables del panel).
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function opciones() {
  if (process.env.DATABASE_URL) return { uri: process.env.DATABASE_URL };
  const host = process.env.DB_HOST || process.env.MYSQL_HOST;
  if (!host) {
    throw new Error('Falta configurar la base de datos: definí DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME (o DATABASE_URL).');
  }
  return {
    // En Hostinger usar 127.0.0.1 y no "localhost" (Node >= 17 resuelve localhost a IPv6).
    host: host === 'localhost' ? '127.0.0.1' : host,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER,
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD,
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE,
  };
}

const pool = mysql.createPool({
  ...opciones(),
  waitForConnections: true,
  connectionLimit: 5,
  charset: 'utf8mb4',
  dateStrings: true,
  timezone: 'Z',
});

/** SELECT que devuelve filas */
async function all(sql, args = []) { const [rows] = await pool.execute(sql, args); return rows; }
/** SELECT que devuelve una fila (o undefined) */
async function get(sql, args = []) { return (await all(sql, args))[0]; }
/** INSERT / UPDATE / DELETE → { insertId, affectedRows } */
async function run(sql, args = []) { const [r] = await pool.execute(sql, args); return r; }

async function init() {
  await run(`CREATE TABLE IF NOT EXISTS turnos (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    sede        VARCHAR(40)  NOT NULL,
    barbero     VARCHAR(40)  NOT NULL,
    servicios   VARCHAR(400) NOT NULL DEFAULT '[]',
    fecha       CHAR(10)     NOT NULL,
    hora        CHAR(5)      NOT NULL,
    nombre      VARCHAR(80)  NOT NULL,
    telefono    VARCHAR(20)  NOT NULL,
    email       VARCHAR(120) NULL,
    nota        VARCHAR(220) NULL,
    estado      VARCHAR(12)  NOT NULL DEFAULT 'confirmado',
    origen      VARCHAR(10)  NOT NULL DEFAULT 'web',
    creado      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelado   DATETIME     NULL,
    mail_estado VARCHAR(12)  NULL,
    -- Un barbero no puede tener dos turnos activos en el mismo horario:
    -- la app guarda "barbero|fecha|hora" y la pone en NULL al cancelar (los NULL no chocan).
    slot_activo VARCHAR(80)  NULL,
    UNIQUE KEY turnos_slot_activo (slot_activo),
    KEY turnos_fecha (fecha, hora)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Bases creadas con versiones anteriores: agrega las columnas que falten.
  const columnas = new Set((await all(`SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'turnos'`)).map((r) => r.c));
  if (!columnas.has('email')) await run('ALTER TABLE turnos ADD COLUMN email VARCHAR(120) NULL AFTER telefono');
  if (!columnas.has('mail_estado')) await run('ALTER TABLE turnos ADD COLUMN mail_estado VARCHAR(12) NULL AFTER cancelado');
  if (columnas.has('wa_estado')) await run('ALTER TABLE turnos DROP COLUMN wa_estado'); // de una versión de prueba anterior

  await run(`CREATE TABLE IF NOT EXISTS imagenes (
    id      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mime    VARCHAR(30)  NOT NULL,
    datos   MEDIUMBLOB   NOT NULL,
    creado  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await run(`CREATE TABLE IF NOT EXISTS productos (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(80)  NOT NULL,
    categoria   VARCHAR(20)  NOT NULL DEFAULT 'POMADA',
    descripcion VARCHAR(160) NOT NULL DEFAULT '',
    imagen      VARCHAR(200) NULL,
    visible     TINYINT(1)   NOT NULL DEFAULT 1,
    orden       INT          NOT NULL DEFAULT 0,
    actualizado DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Versión de los datos iniciales, para aplicar cambios una sola vez sin pisar lo cargado desde el admin.
  await run(`CREATE TABLE IF NOT EXISTS meta (
    clave VARCHAR(40) PRIMARY KEY,
    valor VARCHAR(200) NOT NULL
  ) ENGINE=InnoDB`);
  const versionRow = await get("SELECT valor FROM meta WHERE clave = 'catalogo'");
  const version = Number(versionRow?.valor || 1);

  // Productos iniciales, solo la primera vez.
  const { n } = await get('SELECT COUNT(*) AS n FROM productos');
  if (Number(n) === 0) {
    const seed = [
      ['Pomada Bali', 'POMADA', 'Acabado semi mate.', '/img/pomada-bali.jpg'],
      ['Pomada Hawaii', 'POMADA', 'Brillo medio.', '/img/pomada-hawaii.jpg'],
      ['Pomada Malibu', 'POMADA', 'Brillo medio · Fijación fuerte.', '/img/pomada-malibu.jpg'],
      ['Pomada Cartagena', 'POMADA', 'Fijación extrema.', '/img/pomada-cartagena.jpg'],
      ['Pomada Rio', 'POMADA', 'Acabado mate.', '/img/pomada-rio.jpg'],
      ['Pomada Mar del Plata', 'POMADA', 'Edición Mar del Plata.', '/img/pomada-mar-del-plata.jpg'],
      ['Polvo texturizador', 'STYLING', 'Volumen y textura.', '/img/polvo-texturizador.jpg'],
      ['After shave', 'BARBA', 'Formato spray, dos tamaños.', '/img/after-shave.jpg'],
      ['Cera para barba', 'BARBA', 'Cuidado e hidratación de la barba.', '/img/cera-barba.jpg'],
      ['Aceite para barba', 'BARBA', 'Suaviza y nutre la barba.', '/img/aceite-barba.jpg'],
    ];
    for (const [i, p] of seed.entries()) {
      await run('INSERT INTO productos (nombre, categoria, descripcion, imagen, orden) VALUES (?, ?, ?, ?, ?)', [...p, i + 1]);
    }
  } else if (version < 2) {
    // Bases creadas con la primera versión: se actualizan los productos con las fotos nuevas.
    await run("UPDATE productos SET nombre = 'After shave', categoria = 'BARBA', imagen = '/img/after-shave.jpg' WHERE imagen = '/img/pomada-spray.jpg'");
    await run("UPDATE productos SET nombre = 'Cera para barba', imagen = '/img/cera-barba.jpg' WHERE imagen = '/img/balsamo-barba.jpg'");
    const aceite = await get("SELECT id FROM productos WHERE imagen = '/img/aceite-barba.jpg'");
    if (!aceite) {
      const { o } = await get('SELECT COALESCE(MAX(orden), 0) + 1 AS o FROM productos');
      await run("INSERT INTO productos (nombre, categoria, descripcion, imagen, orden) VALUES ('Aceite para barba', 'BARBA', 'Suaviza y nutre la barba.', '/img/aceite-barba.jpg', ?)", [Number(o)]);
    }
  }
  await run("INSERT INTO meta (clave, valor) VALUES ('catalogo', '2') ON DUPLICATE KEY UPDATE valor = '2'");
}

module.exports = { pool, all, get, run, init };
