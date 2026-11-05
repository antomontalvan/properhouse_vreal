// Normaliza celulares argentinos al formato internacional: 549 + código de área + número (sin 0 ni 15).
// Acepta "11 2345 6789", "011 15 2345 6789", "+54 9 11 2345-6789", etc. Devuelve null si no lo reconoce.
function normalizarCelularAR(entrada) {
  let d = String(entrada || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 12) {
    // Tiene el 15 después del código de área (de 2, 3 o 4 dígitos).
    for (const n of [2, 3, 4]) {
      if (d.slice(n, n + 2) === '15') { d = d.slice(0, n) + d.slice(n + 2); break; }
    }
  }
  if (d.length !== 10) return null;
  return `549${d}`;
}

module.exports = { normalizarCelularAR };
