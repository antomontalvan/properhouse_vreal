/* PROPER HOUSE — panel admin: turnos (ver, cancelar, agendar) y ABM de productos. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && n.append(c));
    return n;
  };

  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', ...opts });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && !url.endsWith('/login')) { showView('login'); throw new Error(data.error || 'Sesión vencida.'); }
    if (!r.ok) throw new Error(data.error || 'Algo salió mal.');
    return data;
  }

  let toastT;
  function toast(text) {
    const t = $('[data-toast]'); t.textContent = text; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  function confirmar(title, text, yes = 'Confirmar') {
    const d = $('[data-confirm]');
    $('[data-confirm-title]', d).textContent = title;
    $('[data-confirm-text]', d).textContent = text;
    $('[data-confirm-yes]', d).textContent = yes;
    d.returnValue = '';
    d.showModal();
    return new Promise((res) => d.addEventListener('close', () => res(d.returnValue === 'yes'), { once: true }));
  }

  // Los botones "cancelar" de los diálogos no validan el formulario.
  $$('dialog button[value="cancel"], dialog button[value="no"]').forEach((b) => (b.formNoValidate = true));

  /* ── Vistas ────────────────────────────────────────── */
  function showView(v) {
    $('[data-view="login"]').hidden = v !== 'login';
    $('[data-view="app"]').hidden = v !== 'app';
    if (v === 'login') setTimeout(() => $('#pw').focus(), 50);
  }

  $('[data-login]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('[data-login-msg]'); msg.textContent = '';
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('#pw').value }) });
      $('#pw').value = '';
      await start();
    } catch (err) { msg.textContent = err.message; }
  });

  $('[data-logout]').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    showView('login');
  });

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  function setTab(tab) {
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
    history.replaceState(null, '', `#${tab}`);
    if (tab === 'productos') cargarProductos(); else cargarTurnos();
  }

  /* ── Info general ──────────────────────────────────── */
  let INFO;
  const sedeNombre = (id) => INFO.sedes.find((s) => s.id === id)?.nombre || id;
  const barberoNombre = (id) => INFO.barberos.find((b) => b.id === id)?.nombre || id;
  const servNombre = (id) => { const s = INFO.servicios.find((x) => x.id === id); return s?.chip || s?.nombre || id; };
  const fechaLarga = (f) => { const d = new Date(`${f}T12:00:00Z`); return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };
  const telBonito = (t) => {
    if (t.startsWith('549') && t.length === 13) return `+54 9 ${t.slice(3, 5)} ${t.slice(5, 9)}-${t.slice(9)}`;
    if (t.length === 10 && t.startsWith('11')) return `11 ${t.slice(2, 6)}-${t.slice(6)}`;
    return t;
  };
  const waCliente = (t) => {
    let n = t.telefono; if (!n.startsWith('54')) n = `549${n.replace(/^0/, '')}`;
    return `https://wa.me/${n}`;
  };

  /* ── Turnos ────────────────────────────────────────── */
  const filtros = { rango: 'proximos' };
  $$('[data-rango] .ph-chip').forEach((c) => c.addEventListener('click', () => {
    filtros.rango = c.dataset.r; $('#f-fecha').value = '';
    $$('[data-rango] .ph-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    cargarTurnos();
  }));
  $('#f-fecha').addEventListener('change', () => {
    if ($('#f-fecha').value) { filtros.rango = 'dia'; $$('[data-rango] .ph-chip').forEach((x) => x.setAttribute('aria-pressed', 'false')); }
    cargarTurnos();
  });
  ['#f-sede', '#f-barbero', '#f-estado'].forEach((s) => $(s).addEventListener('change', cargarTurnos));
  let qT; $('#f-q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(cargarTurnos, 250); });
  $('#f-sede').addEventListener('change', () => llenarBarberos($('#f-barbero'), $('#f-sede').value, true));

  function llenarBarberos(select, sede, todos) {
    const val = select.value;
    select.replaceChildren(...(todos ? [el('option', { value: '', text: 'Todos' })] : []),
      ...INFO.barberos.filter((b) => !sede || b.sede === sede).map((b) => el('option', { value: b.id, text: b.nombre })));
    if ([...select.options].some((o) => o.value === val)) select.value = val;
  }

  let reqT = 0;
  async function cargarTurnos() {
    const id = ++reqT;
    const q = new URLSearchParams();
    const hoy = INFO.ahora.fecha;
    if (filtros.rango === 'hoy') { q.set('desde', hoy); q.set('hasta', hoy); }
    else if (filtros.rango === 'proximos') q.set('desde', hoy);
    else if (filtros.rango === 'pasados') { q.set('hasta', hoy); }
    else if (filtros.rango === 'dia') { q.set('desde', $('#f-fecha').value); q.set('hasta', $('#f-fecha').value); }
    if ($('#f-sede').value) q.set('sede', $('#f-sede').value);
    if ($('#f-barbero').value) q.set('barbero', $('#f-barbero').value);
    if ($('#f-estado').value) q.set('estado', $('#f-estado').value);
    if ($('#f-q').value.trim()) q.set('q', $('#f-q').value.trim());
    const box = $('[data-turnos]');
    try {
      const { turnos, resumen } = await api(`/api/admin/turnos?${q}`);
      if (id !== reqT) return;
      Object.entries(resumen).forEach(([k, v]) => ($(`[data-stat="${k}"]`).textContent = v));
      let lista = turnos;
      if (filtros.rango === 'pasados') lista = [...turnos].reverse();
      renderTurnos(box, lista);
    } catch (e) { box.replaceChildren(el('div', { class: 'ad-empty' }, el('b', { text: 'No se pudieron cargar los turnos.' }), e.message)); }
  }

  function renderTurnos(box, turnos) {
    box.replaceChildren();
    if (!turnos.length) {
      box.append(el('div', { class: 'ad-empty' }, el('b', { text: 'No hay turnos con estos filtros.' }), 'Probá con otro rango o estado.'));
      return;
    }
    const porDia = new Map();
    turnos.forEach((t) => { if (!porDia.has(t.fecha)) porDia.set(t.fecha, []); porDia.get(t.fecha).push(t); });
    porDia.forEach((lista, fecha) => {
      const activos = lista.filter((t) => t.estado !== 'cancelado').length;
      box.append(el('div', { class: 'ad-day' },
        el('div', { class: 'ad-day__h' },
          el('h2', { text: fecha === INFO.ahora.fecha ? `Hoy · ${fechaLarga(fecha)}` : fechaLarga(fecha) }),
          el('span', { class: 'ph-meta ph-muted', text: `${activos} ${activos === 1 ? 'turno' : 'turnos'}` })),
        lista.map(filaTurno)));
    });
  }

  function filaTurno(t) {
    const acciones = [
      el('a', { class: 'ad-icon-btn', href: waCliente(t), target: '_blank', rel: 'noopener', title: 'Escribirle por WhatsApp', text: 'WhatsApp' }),
    ];
    if (t.estado === 'confirmado' && t.email && INFO.mailActivo) {
      acciones.push(el('button', { type: 'button', class: 'ad-icon-btn', text: 'Reenviar mail', title: 'Volver a mandarle el resumen del turno', onclick: () => reenviarMail(t) }));
    }
    if (t.estado === 'confirmado') {
      acciones.push(el('button', { type: 'button', class: 'ad-icon-btn', text: 'Atendido', onclick: () => cambiarEstado(t, 'atendido') }));
      acciones.push(el('button', { type: 'button', class: 'ad-icon-btn ad-icon-btn--dark', text: 'Cancelar', onclick: () => cancelar(t) }));
    } else if (t.estado === 'cancelado') {
      acciones.push(el('button', { type: 'button', class: 'ad-icon-btn', text: 'Reactivar', onclick: () => cambiarEstado(t, 'confirmado') }));
      acciones.push(el('button', { type: 'button', class: 'ad-icon-btn', text: 'Eliminar', onclick: () => eliminarTurno(t) }));
    } else {
      acciones.push(el('button', { type: 'button', class: 'ad-icon-btn', text: 'Deshacer', onclick: () => cambiarEstado(t, 'confirmado') }));
    }
    return el('div', { class: `ad-row is-${t.estado}` },
      el('span', { class: 'ad-row__hora', text: t.hora }),
      el('div', { class: 'ad-row__who' }, el('b', { text: t.nombre }),
        el('a', { href: `tel:+${t.telefono.startsWith('54') ? t.telefono : '549' + t.telefono}`, text: telBonito(t.telefono) }),
        t.email ? el('a', { href: `mailto:${t.email}`, text: t.email }) : null),
      el('div', { class: 'ad-row__where' }, el('small', { text: `${sedeNombre(t.sede)} · #${t.id}${t.origen === 'admin' ? ' · manual' : ''}${t.mail_estado === 'enviado' ? ' · Mail ✓' : t.mail_estado === 'error' ? ' · Mail no enviado' : ''}` }), barberoNombre(t.barbero)),
      el('div', { class: 'ad-row__serv' }, t.servicios.map(servNombre).join(', '), t.nota ? el('small', { text: t.nota }) : null),
      el('span', { class: `ad-pill ad-pill--${t.estado}`, text: t.estado }),
      el('div', { class: 'ad-row__act' }, acciones));
  }

  async function cancelar(t) {
    const ok = await confirmar(`¿Cancelar el turno de ${t.nombre}?`,
      `${fechaLarga(t.fecha)} a las ${t.hora} hs con ${barberoNombre(t.barbero)} en ${sedeNombre(t.sede)}. El horario vuelve a quedar libre en la web. Acordate de avisarle por WhatsApp.`, 'Cancelar turno');
    if (ok) cambiarEstado(t, 'cancelado');
  }
  async function cambiarEstado(t, estado) {
    try {
      await api(`/api/admin/turnos/${t.id}`, { method: 'PATCH', body: JSON.stringify({ estado }) });
      toast(estado === 'cancelado' ? 'Turno cancelado.' : estado === 'atendido' ? 'Marcado como atendido.' : 'Turno reactivado.');
      cargarTurnos();
    } catch (e) { toast(e.message); }
  }
  async function reenviarMail(t) {
    try { await api(`/api/admin/turnos/${t.id}/mail`, { method: 'POST' }); toast(`Resumen enviado a ${t.email}.`); cargarTurnos(); }
    catch (e) { toast(e.message); }
  }
  async function eliminarTurno(t) {
    const ok = await confirmar('¿Eliminar este turno?', 'Se borra del historial y no se puede deshacer.', 'Eliminar');
    if (!ok) return;
    try { await api(`/api/admin/turnos/${t.id}`, { method: 'DELETE' }); toast('Turno eliminado.'); cargarTurnos(); } catch (e) { toast(e.message); }
  }

  /* Nuevo turno manual */
  const tDlg = $('[data-turno-dialog]');
  const tSel = new Set();
  function horasPara(barberoId) {
    const b = INFO.barberos.find((x) => x.id === barberoId); if (!b) return [];
    const toM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const out = []; for (let m = toM(b.desde); m <= toM(b.hasta); m += 30) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    return out;
  }
  async function refrescarHoras() {
    const sel = $('#t-hora'); const b = $('#t-barbero').value; const f = $('#t-fecha').value;
    let ocupadas = new Set();
    if (f) {
      try {
        const { horarios } = await api(`/api/disponibilidad?${new URLSearchParams({ sede: $('#t-sede').value, barbero: b, fecha: f })}`);
        ocupadas = new Set(horarios.filter((h) => !h.disponible).map((h) => h.hora));
      } catch { /* sin datos, se valida al guardar */ }
    }
    sel.replaceChildren(...horasPara(b).map((h) => el('option', { value: h, text: ocupadas.has(h) ? `${h} · ocupado o pasado` : h })));
  }
  function renderTChips() {
    const box = $('[data-t-servicios]'); box.replaceChildren();
    INFO.servicios.forEach((s) => box.append(el('button', {
      type: 'button', class: 'ph-chip', 'aria-pressed': String(tSel.has(s.id)), text: s.chip || s.nombre,
      onclick: () => { tSel.has(s.id) ? tSel.delete(s.id) : tSel.add(s.id); renderTChips(); },
    })));
  }
  $('#t-sede').addEventListener('change', () => { llenarBarberos($('#t-barbero'), $('#t-sede').value, false); refrescarHoras(); });
  $('#t-barbero').addEventListener('change', refrescarHoras);
  $('#t-fecha').addEventListener('change', refrescarHoras);
  $('[data-new-turno]').addEventListener('click', () => {
    $('[data-turno-form]').reset(); tSel.clear(); $('[data-turno-msg]').textContent = '';
    $('#t-sede').value = INFO.sedes[0].id; llenarBarberos($('#t-barbero'), $('#t-sede').value, false);
    $('#t-fecha').value = INFO.dias[0]; renderTChips(); refrescarHoras();
    tDlg.showModal();
  });
  $('[data-turno-form]').addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const msg = $('[data-turno-msg]'); msg.textContent = '';
    try {
      await api('/api/admin/turnos', { method: 'POST', body: JSON.stringify({
        sede: $('#t-sede').value, barbero: $('#t-barbero').value, fecha: $('#t-fecha').value, hora: $('#t-hora').value,
        servicios: [...tSel], nombre: $('#t-nombre').value, telefono: $('#t-tel').value, email: $('#t-email').value, nota: $('#t-nota').value,
      }) });
      tDlg.close(); toast('Turno agendado.'); cargarTurnos();
    } catch (err) { msg.textContent = err.message; }
  });

  /* ── Productos ─────────────────────────────────────── */
  let PRODS = [];
  async function cargarProductos() {
    const box = $('[data-prods]');
    try { PRODS = await api('/api/admin/productos'); } catch (e) { box.replaceChildren(el('div', { class: 'ad-empty' }, el('b', { text: e.message }))); return; }
    box.replaceChildren();
    if (!PRODS.length) { box.append(el('div', { class: 'ad-empty', style: 'grid-column:1/-1' }, el('b', { text: 'Todavía no hay productos.' }), 'Agregá el primero con “Nuevo producto”.')); return; }
    PRODS.forEach((p, i) => box.append(el('article', { class: `ad-prod${p.visible ? '' : ' is-hidden'}` },
      el('div', { class: 'ad-prod__img' },
        p.imagen ? el('img', { src: p.imagen, alt: '', loading: 'lazy' }) : el('span', { class: 'ad-prod__noimg', text: 'PH' }),
        el('span', { class: 'ph-tape', text: p.categoria }),
        p.visible ? null : el('span', { class: 'ph-tape ph-tape--ink ad-hidden-tag', text: 'Oculto' })),
      el('div', { class: 'ad-prod__body' }, el('h3', { text: p.nombre }), el('p', { text: p.descripcion || '—' })),
      el('div', { class: 'ad-prod__foot' },
        el('button', { type: 'button', class: 'ad-icon-btn', 'aria-label': 'Subir', disabled: i === 0, text: '↑', onclick: () => mover(i, -1) }),
        el('button', { type: 'button', class: 'ad-icon-btn', 'aria-label': 'Bajar', disabled: i === PRODS.length - 1, text: '↓', onclick: () => mover(i, 1) }),
        el('span', { class: 'ad-spacer' }),
        el('button', { type: 'button', class: 'ad-icon-btn', text: 'Editar', onclick: () => abrirProducto(p) }),
        el('button', { type: 'button', class: 'ad-icon-btn ad-icon-btn--dark', text: 'Borrar', onclick: () => borrarProducto(p) })))));
  }
  async function mover(i, d) {
    const ids = PRODS.map((p) => p.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try { await api('/api/admin/productos/orden', { method: 'POST', body: JSON.stringify({ ids }) }); cargarProductos(); } catch (e) { toast(e.message); }
  }
  async function borrarProducto(p) {
    const ok = await confirmar(`¿Borrar ${p.nombre}?`, 'Deja de aparecer en el sitio y se elimina su foto. Si solo querés esconderlo, editalo y apagá “Visible”.', 'Borrar');
    if (!ok) return;
    try { await api(`/api/admin/productos/${p.id}`, { method: 'DELETE' }); toast('Producto borrado.'); cargarProductos(); } catch (e) { toast(e.message); }
  }

  const pDlg = $('[data-prod-dialog]');
  let editando = null; let imagenData = null; let quitarImagen = false;
  function preview(src) {
    const box = $('[data-img-prev]');
    box.replaceChildren(src ? el('img', { src, alt: '' }) : el('span', { text: 'Sin foto' }));
    $('[data-img-remove]').hidden = !src;
  }
  function abrirProducto(p) {
    editando = p || null; imagenData = null; quitarImagen = false;
    $('[data-prod-title]').textContent = p ? 'Editar producto' : 'Nuevo producto';
    $('#p-nombre').value = p?.nombre || '';
    $('#p-cat').value = p?.categoria || 'POMADA';
    $('#p-desc').value = p?.descripcion || '';
    $('#p-visible').checked = p ? !!p.visible : true;
    $('[data-prod-msg]').textContent = '';
    $('[data-img-input]').value = '';
    preview(p?.imagen || null);
    pDlg.showModal();
  }
  $('[data-new-prod]').addEventListener('click', () => abrirProducto(null));
  $('[data-img-remove]').addEventListener('click', () => { imagenData = null; quitarImagen = true; preview(null); });
  $('[data-img-input]').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { imagenData = await achicar(f, 1000); quitarImagen = false; preview(imagenData); }
    catch { $('[data-prod-msg]').textContent = 'No se pudo leer esa imagen.'; }
  });
  // Recorta al centro en cuadrado y comprime a JPG antes de subir.
  function achicar(file, size) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(img.width, img.height); const out = Math.min(size, s);
        const c = document.createElement('canvas'); c.width = c.height = out;
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, out, out);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = rej; img.src = url;
    });
  }
  $('[data-prod-form]').addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return;
    e.preventDefault();
    const body = {
      nombre: $('#p-nombre').value, categoria: $('#p-cat').value, descripcion: $('#p-desc').value,
      visible: $('#p-visible').checked, imagenData, quitarImagen,
    };
    const btn = $('[data-prod-save]'); btn.disabled = true;
    try {
      if (editando) await api(`/api/admin/productos/${editando.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/api/admin/productos', { method: 'POST', body: JSON.stringify(body) });
      pDlg.close(); toast(editando ? 'Producto actualizado.' : 'Producto creado.'); cargarProductos();
    } catch (err) { $('[data-prod-msg]').textContent = err.message; }
    finally { btn.disabled = false; }
  });

  /* ── Arranque ──────────────────────────────────────── */
  async function start() {
    INFO = await api('/api/info');
    $('#f-sede').replaceChildren(el('option', { value: '', text: 'Todas' }), ...INFO.sedes.map((s) => el('option', { value: s.id, text: s.nombre })));
    $('#t-sede').replaceChildren(...INFO.sedes.map((s) => el('option', { value: s.id, text: s.nombre })));
    $('#p-cat').replaceChildren(...INFO.categorias.map((c) => el('option', { value: c, text: c.charAt(0) + c.slice(1).toLowerCase() })));
    llenarBarberos($('#f-barbero'), '', true);
    showView('app');
    setTab(location.hash === '#productos' ? 'productos' : 'turnos');
  }

  (async () => {
    try { await api('/api/admin/sesion'); await start(); } catch { showView('login'); }
  })();
})();
