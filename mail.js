// Envío del resumen del turno por mail (SMTP; por ejemplo la casilla de Hostinger).
//
// Se activa sola cuando están definidas SMTP_HOST, SMTP_USER y SMTP_PASS.
// Sin esas variables no se envía nada y el turnero funciona igual.

const nodemailer = require('nodemailer');
const config = require('./config');

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function activo() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporte = null;
function smtp() {
  if (!transporte) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporte;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fecha = (f) => new Date(`${f}T12:00:00Z`);
const fechaLarga = (f) => { const d = fecha(f); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; };
const fechaCorta = (f) => { const d = fecha(f); return `${DIAS_CORTOS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
const telLindo = (sede) => sede.telefono || `+${sede.whatsapp}`;

function datos(t) {
  const sede = config.sedes.find((s) => s.id === t.sede);
  const barbero = config.barberos.find((b) => b.id === t.barbero);
  const servicios = t.servicios.map((id) => config.servicios.find((s) => s.id === id)?.nombre).filter(Boolean).join(', ');
  return {
    nombre: t.nombre.split(' ')[0],
    sede,
    barbero: barbero?.nombre || '',
    servicios,
    maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sede.maps || sede.direccion)}`,
    wa: `https://wa.me/${sede.whatsapp}?text=${encodeURIComponent(`Hola, tengo el turno #${t.id} (${fechaCorta(t.fecha)} ${t.hora} hs).`)}`,
  };
}

/** Evento de calendario (.ics) para que el cliente lo agende con un toque. */
function ics(t, d) {
  const [y, m, dd] = t.fecha.split('-').map(Number);
  const [hh, mi] = t.hora.split(':').map(Number);
  // Buenos Aires es UTC-3 todo el año.
  const ini = new Date(Date.UTC(y, m - 1, dd, hh + 3, mi));
  const fin = new Date(ini.getTime() + (config.intervaloMin || 30) * 60000);
  const f = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const txt = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Proper House//Turnos//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:turno-${t.id}@properhouse`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(ini)}`,
    `DTEND:${f(fin)}`,
    `SUMMARY:${txt(`Turno en Proper House · ${d.sede.nombre}`)}`,
    `LOCATION:${txt(`${d.sede.direccion}, CABA`)}`,
    `DESCRIPTION:${txt(`Barbero: ${d.barbero}\nServicio: ${d.servicios}\nTurno #${t.id}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Turno en Proper House', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

function html(t, d) {
  const fila = (label, valor) => `
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #e2e2e0;width:120px;vertical-align:top;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5f5f5c;">${label}</td>
            <td style="padding:14px 0;border-bottom:1px solid #e2e2e0;vertical-align:top;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.45;color:#0b0b0b;">${valor}</td>
          </tr>`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Tu turno en Proper House</title>
</head>
<body style="margin:0;padding:0;background:#f3f3f2;">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(`${fechaLarga(t.fecha)} a las ${t.hora} hs con ${d.barbero} en ${d.sede.nombre}.`)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f3f2;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;">
        <tr>
          <td style="background:#0b0b0b;padding:20px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:Helvetica,Arial,sans-serif;font-weight:bold;font-size:20px;letter-spacing:-0.5px;color:#ffffff;">PROPER HOUSE</td>
              <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#9b9b98;">Turno #${t.id}</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 28px 8px;">
            <p style="margin:0 0 10px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5f5f5c;">Turno reservado</p>
            <h1 style="margin:0;font-family:Helvetica,Arial,sans-serif;font-weight:bold;font-size:34px;line-height:1;letter-spacing:-1px;text-transform:uppercase;color:#0b0b0b;">Te esperamos, ${esc(d.nombre)}.</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #0b0b0b;">
              ${fila('Día', esc(fechaLarga(t.fecha).replace(/^./, (c) => c.toUpperCase())))}
              ${fila('Horario', `${esc(t.hora)} hs`)}
              ${fila('Sede', `${esc(d.sede.nombre)}<br><span style="color:#5f5f5c;font-size:14px;">${esc(d.sede.direccion)}, CABA</span><br><a href="${d.maps}" style="color:#0b0b0b;font-size:14px;">Cómo llegar ↗</a>`)}
              ${fila('Barbero', esc(d.barbero))}
              ${fila('Servicio', esc(d.servicios))}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f3f2;">
              <tr><td style="padding:18px 20px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#0b0b0b;">
                <strong>¿No podés venir?</strong> Avisanos con anticipación por WhatsApp a la sede:
                <a href="${d.wa}" style="color:#0b0b0b;">${esc(telLindo(d.sede))}</a>.
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 28px 32px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5f5f5c;">
            Adjuntamos el turno para que lo agregues a tu calendario.
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px;border-top:1px solid #e2e2e0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9b9b98;">© Proper House® Studio · since 2019</td>
              <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;"><a href="https://instagram.com/${config.instagram.studio}" style="color:#9b9b98;text-decoration:none;">@${config.instagram.studio}</a></td>
            </tr></table>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function texto(t, d) {
  return [
    `TE ESPERAMOS, ${d.nombre.toUpperCase()}.`,
    `Tu turno en Proper House quedó reservado (turno #${t.id}).`,
    '',
    `Día: ${fechaLarga(t.fecha)}`,
    `Horario: ${t.hora} hs`,
    `Sede: ${d.sede.nombre} · ${d.sede.direccion}, CABA`,
    `Cómo llegar: ${d.maps}`,
    `Barbero: ${d.barbero}`,
    `Servicio: ${d.servicios}`,
    '',
    `¿No podés venir? Avisanos con anticipación por WhatsApp a la sede: ${telLindo(d.sede)}`,
    '',
    'Proper House Studio · since 2019',
  ].join('\n');
}

/** Envía el resumen. Nunca tira error: devuelve { estado: 'enviado' | 'error' | 'desactivado' | 'sin-email', detalle }. */
async function enviarResumen(t) {
  if (!activo()) return { estado: 'desactivado' };
  if (!t.email) return { estado: 'sin-email' };
  const d = datos(t);
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  try {
    await smtp().sendMail({
      from: { name: process.env.MAIL_FROM_NAME || 'Proper House', address: from },
      to: t.email,
      bcc: process.env.MAIL_COPIA || undefined,
      replyTo: process.env.MAIL_REPLY_TO || undefined,
      subject: `Tu turno en Proper House · ${fechaCorta(t.fecha)} · ${t.hora} hs`,
      text: texto(t, d),
      html: html(t, d),
      attachments: [{ filename: `turno-proper-house-${t.id}.ics`, content: ics(t, d), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }],
    });
    return { estado: 'enviado' };
  } catch (e) {
    console.error(`Mail: no se pudo enviar el turno #${t.id}: ${e.message}`);
    return { estado: 'error', detalle: e.message };
  }
}

module.exports = { activo, enviarResumen };
