/* PROPER HOUSE — sitio público: reloj, menú, servicios, turnero y productos. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const TZ = 'America/Argentina/Buenos_Aires';
  const WA = { 'parque-chas': '5491130681320', 'villa-urquiza': '5491132070838' };
  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
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
  const waLink = (sede, text) => `https://wa.me/${WA[sede] || WA['parque-chas']}?text=${encodeURIComponent(text)}`;

  /* ── Reloj CABA + estado abierto ───────────────────── */
  function horaBA() {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday'));
    return { hh: g('hour'), mm: g('minute'), wd, min: Number(g('hour')) * 60 + Number(g('minute')) };
  }
  function tick() {
    const t = horaBA();
    const abierto = t.wd >= 2 && t.wd <= 6 && t.min >= 600 && t.min < 1200;
    $$('[data-clock]').forEach((n) => (n.textContent = `${t.hh}:${t.mm}`));
    $$('[data-open-dot]').forEach((n) => n.classList.toggle('is-open', abierto));
    let txt;
    if (abierto) txt = 'Abierto · hasta las 20 hs';
    else if (t.wd >= 2 && t.wd <= 6 && t.min < 600) txt = 'Cerrado · abre hoy 10 hs';
    else txt = 'Cerrado · abre mar a sáb 10 hs';
    $$('[data-status] span').forEach((n) => (n.textContent = txt));
  }
  tick(); setInterval(tick, 20000);

  /* ── Header y menú mobile ──────────────────────────── */
  const header = $('.ph-header');
  const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // PROPER HOUSE del header: vuelve al principio de la página.
  $$('a[href="#top"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof setMenu === 'function') setMenu(false);
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    history.replaceState(null, '', location.pathname + location.search);
  }));

  const menu = $('#menu'); const burger = $('.ph-burger');
  menu.hidden = false;
  const setMenu = (open) => {
    menu.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    document.body.style.overflow = open ? 'hidden' : '';
    menu.inert = !open;
  };
  menu.inert = true;
  burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && setMenu(false));
  matchMedia('(min-width: 768px)').addEventListener('change', (e) => e.matches && setMenu(false));

  /* Links de WhatsApp genéricos */
  $$('[data-wa]').forEach((a) => (a.href = waLink(a.dataset.wa, a.dataset.waText || 'Hola')));

  /* ── Cintas corridas ───────────────────────────────── */
  const tickerTxt = 'Fades - Cortes clásicos - Tijera - Navaja - Cejas - Afeitado tradicional - Asesoramiento - ';
  $$('[data-ticker]').forEach((t) => {
    const chunk = (tickerTxt + tickerTxt).replace(/ /g, ' ').replace(/ - /g, '  -  ');
    t.append(el('span', { text: chunk }), el('span', { text: chunk }));
  });

  /* ── Revelado ──────────────────────────────────────── */
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  $$('.ph-reveal').forEach((n) => io.observe(n));

  /* ── Botón flotante: se esconde en el turnero y arriba de todo ── */
  const fab = $('[data-fab]');
  const turnos = $('#turnos');
  let turnosVisible = false;
  new IntersectionObserver(([e]) => { turnosVisible = e.isIntersecting; updFab(); }, { threshold: 0 }).observe(turnos);
  const updFab = () => fab.classList.toggle('is-hidden', turnosVisible || window.scrollY < window.innerHeight * 0.6);
  window.addEventListener('scroll', updFab, { passive: true }); updFab();

  /* ── Datos del servidor ────────────────────────────── */
  const api = async (url, opts) => {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'No pudimos conectar. Probá de nuevo.'), { status: r.status });
    return data;
  };

  let INFO = null;
  const state = { sede: null, barbero: 'cualquiera', servicios: new Set(), fecha: null, hora: null };

  /* ── Servicios (lista) ─────────────────────────────── */
  function renderServicios() {
    const ul = $('[data-services]');
    INFO.servicios.forEach((s, i) => {
      ul.append(el('li', { class: `ph-service${s.destacado ? ' ph-service--hl' : ''}` },
        el('a', { href: '#turnos', 'data-pick-service': s.id },
          el('span', { class: 'ph-service__n', text: String(i + 1).padStart(2, '0') }),
          el('span', { class: 'ph-service__name ph-title-m', text: s.nombre }),
          el('span', { class: 'ph-service__d', text: s.desc }),
          el('span', { class: 'ph-service__a', 'aria-hidden': 'true', text: '→' }))));
    });
    $$('[data-pick-service]').forEach((a) => a.addEventListener('click', () => {
      state.servicios.add(a.dataset.pickService); renderChips();
    }));
  }

  /* ── Turnero ───────────────────────────────────────── */
  const form = $('[data-booking]');
  const msg = $('[data-msg]');
  const pressed = (on) => (on ? 'true' : 'false');

  function renderSedes() {
    const box = $('[data-sedes]'); box.replaceChildren();
    INFO.sedes.forEach((s) => box.append(el('button', {
      type: 'button', class: 'ph-option', 'aria-pressed': pressed(state.sede === s.id),
      onclick: () => selectSede(s.id),
    }, el('b', { text: s.nombre }), el('small', { text: s.direccion }))));
  }
  function selectSede(id) {
    if (state.sede !== id) { state.barbero = 'cualquiera'; state.hora = null; }
    state.sede = id; renderSedes(); renderBarberos(); loadSlots();
  }
  function renderBarberos() {
    const box = $('[data-barberos]'); box.replaceChildren();
    const lista = INFO.barberos.filter((b) => b.sede === state.sede);
    $('[data-barbero-count]').textContent = state.sede ? `${lista.length} ${lista.length === 1 ? 'barbero' : 'barberos'}` : '';
    if (!state.sede) {
      box.append(el('p', { class: 'ph-body-s ph-muted', text: 'Primero elegí la sede.' })); return;
    }
    const opts = lista.length > 1 ? [{ id: 'cualquiera', nombre: 'Cualquiera', sub: 'El primero libre' }] : [];
    lista.forEach((b) => opts.push({ id: b.id, nombre: b.nombre, sub: `${b.desde}–${b.hasta} hs` }));
    if (lista.length === 1) state.barbero = lista[0].id;
    box.classList.toggle('ph-options--4', opts.length > 2);
    box.classList.toggle('ph-options--2', opts.length <= 2);
    opts.forEach((o) => box.append(el('button', {
      type: 'button', class: 'ph-option', 'aria-pressed': pressed(state.barbero === o.id),
      onclick: () => { state.barbero = o.id; state.hora = null; renderBarberos(); loadSlots(); },
    }, el('b', { text: o.nombre }), el('small', { text: o.sub }))));
  }
  function renderChips() {
    const box = $('[data-chips]'); box.replaceChildren();
    INFO.servicios.forEach((s) => box.append(el('button', {
      type: 'button', class: 'ph-chip', 'aria-pressed': pressed(state.servicios.has(s.id)),
      onclick: () => { state.servicios.has(s.id) ? state.servicios.delete(s.id) : state.servicios.add(s.id); renderChips(); },
      text: s.chip || s.nombre,
    })));
  }
  function renderDias() {
    const box = $('[data-days]'); box.replaceChildren();
    INFO.dias.forEach((f) => {
      const d = new Date(`${f}T12:00:00Z`);
      box.append(el('button', {
        type: 'button', class: 'ph-day', 'aria-pressed': pressed(state.fecha === f),
        'aria-label': `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`,
        onclick: () => { state.fecha = f; state.hora = null; renderDias(); loadSlots(); },
      }, el('small', { text: DIAS[d.getUTCDay()] }), el('b', { text: d.getUTCDate() }), el('small', { text: MESES[d.getUTCMonth()] })));
    });
  }
  let slotReq = 0;
  async function loadSlots() {
    const box = $('[data-slots]');
    if (!state.sede || !state.fecha) {
      box.replaceChildren(el('p', { class: 'ph-slots__empty', text: state.sede ? 'Elegí un día.' : 'Elegí la sede para ver los horarios.' }));
      return;
    }
    const id = ++slotReq;
    box.setAttribute('aria-busy', 'true');
    try {
      const q = new URLSearchParams({ sede: state.sede, barbero: state.barbero, fecha: state.fecha });
      const { horarios } = await api(`/api/disponibilidad?${q}`);
      if (id !== slotReq) return;
      box.replaceChildren();
      if (!horarios.some((h) => h.disponible)) {
        box.append(el('p', { class: 'ph-slots__empty', text: 'No quedan horarios este día. Probá otro día u otro barbero.' }));
      }
      horarios.forEach((h) => box.append(el('button', {
        type: 'button', class: 'ph-slot', disabled: !h.disponible, 'aria-pressed': pressed(state.hora === h.hora),
        'aria-label': h.disponible ? `${h.hora} hs` : `${h.hora} hs, ocupado`,
        onclick: () => { state.hora = h.hora; $$('.ph-slot', box).forEach((b) => b.setAttribute('aria-pressed', pressed(b.textContent === h.hora))); },
        text: h.hora,
      })));
      if (state.hora && !horarios.find((h) => h.hora === state.hora && h.disponible)) state.hora = null;
    } catch (e) {
      box.replaceChildren(el('p', { class: 'ph-slots__empty', text: e.message }));
    } finally { box.removeAttribute('aria-busy'); }
  }

  function showMsg(text, focusSel) {
    msg.textContent = text;
    if (focusSel) $(focusSel)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('#f-nombre').value.trim();
    const telefono = $('#f-tel').value.trim();
    const email = $('#f-email').value.trim();
    ['#f-nombre', '#f-tel', '#f-email'].forEach((id) => $(id).removeAttribute('aria-invalid'));
    if (!state.sede) return showMsg('Elegí la sede.', '[data-step="sede"]');
    if (!state.servicios.size) return showMsg('Elegí al menos un servicio.', '[data-step="servicio"]');
    if (!state.fecha || !state.hora) return showMsg('Elegí día y horario.', '[data-step="horario"]');
    if (nombre.length < 2) { $('#f-nombre').setAttribute('aria-invalid', 'true'); $('#f-nombre').focus(); return showMsg('Escribí tu nombre.'); }
    if (telefono.replace(/\D/g, '').length < 8) { $('#f-tel').setAttribute('aria-invalid', 'true'); $('#f-tel').focus(); return showMsg('Revisá el teléfono: con código de área, sin 0 ni 15 (ej. 11 2345 6789).'); }
    if (!/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(email)) { $('#f-email').setAttribute('aria-invalid', 'true'); $('#f-email').focus(); return showMsg('Revisá el email: ahí te mandamos el resumen del turno.'); }
    msg.textContent = '';
    const btn = $('[data-submit]'); btn.disabled = true; btn.textContent = 'Reservando…';
    try {
      const r = await api('/api/turnos', {
        method: 'POST',
        body: JSON.stringify({ sede: state.sede, barbero: state.barbero, servicios: [...state.servicios], fecha: state.fecha, hora: state.hora, nombre, telefono, email }),
      });
      mostrarResumen(r, nombre, email);
    } catch (err) {
      showMsg(err.message);
      if (err.status === 409) { state.hora = null; loadSlots(); }
    } finally { btn.disabled = false; btn.textContent = 'Reservar turno ↗'; }
  });

  function mostrarResumen(r, nombre, email) {
    const sede = INFO.sedes.find((s) => s.id === r.sede);
    const d = new Date(`${r.fecha}T12:00:00Z`);
    const serv = [...state.servicios].map((id) => INFO.servicios.find((s) => s.id === id)?.chip || INFO.servicios.find((s) => s.id === id)?.nombre).join(', ');
    const box = $('[data-summary]');
    box.replaceChildren(
      el('span', { class: 'ph-meta', style: 'color:var(--stone-400)', text: `Turno #${r.id} · reservado` }),
      el('h3', { text: `Te esperamos, ${nombre.split(' ')[0]}.` }),
      el('dl', {},
        el('div', {}, el('dt', { text: 'Sede' }), el('dd', { text: sede.nombre })),
        el('div', {}, el('dt', { text: 'Día' }), el('dd', { text: `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` })),
        el('div', {}, el('dt', { text: 'Horario' }), el('dd', { text: `${r.hora} hs` })),
        el('div', {}, el('dt', { text: 'Barbero' }), el('dd', { text: r.barbero }))),
      el('p', { text: r.mailEnviado
        ? `${serv}. Te mandamos el resumen del turno a ${email}. Si no podés venir, avisanos con anticipación.`
        : `${serv}. Si no podés venir, avisanos con anticipación.` }),
      el('div', { class: 'ph-actions' },
        el('button', { type: 'button', class: 'ph-btn ph-btn--light', onclick: nuevaReserva, text: 'Reservar otro turno' })),
    );
    form.hidden = true; box.hidden = false; box.focus({ preventScroll: true });
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function nuevaReserva() {
    state.hora = null; state.servicios.clear();
    form.hidden = false; $('[data-summary]').hidden = true;
    renderChips(); loadSlots();
    $('#turnos').scrollIntoView({ behavior: 'smooth' });
  }

  $$('[data-book-sede]').forEach((a) => a.addEventListener('click', () => INFO && selectSede(a.dataset.bookSede)));

  /* ── Productos ─────────────────────────────────────── */
  async function renderProductos() {
    const box = $('[data-products]');
    let lista = [];
    try { lista = await api('/api/productos'); } catch { /* se muestra solo la tarjeta de consulta */ }
    box.replaceChildren();
    lista.forEach((p) => {
      const img = p.imagen
        ? el('div', { class: 'ph-product__img' }, el('img', { src: p.imagen, alt: p.nombre, loading: 'lazy', width: 524, height: 524 }), el('span', { class: 'ph-tape', text: p.categoria }))
        : el('div', { class: 'ph-product__img ph-product__img--empty' }, el('span', { text: 'PH' }), el('span', { class: 'ph-tape', style: 'position:absolute;top:10px;left:10px', text: p.categoria }));
      box.append(el('article', { class: 'ph-product' }, img, el('h3', { text: p.nombre }), p.descripcion ? el('p', { text: p.descripcion }) : null));
    });
    box.append(el('a', {
      class: 'ph-products-cta', target: '_blank', rel: 'noopener',
      href: waLink('parque-chas', 'Hola, quería consultar por los productos Pimp Paradise.'),
    },
    el('span', { class: 'ph-products-cta__txt' }, el('strong', { text: '¿Te interesa alguno?' }), ' Escribinos por disponibilidad y precios.'),
    el('span', { class: 'ph-products-cta__arrow', 'aria-hidden': 'true', text: '↗' })));
  }

  /* ── Init ──────────────────────────────────────────── */
  (async () => {
    renderProductos();
    try {
      INFO = await api('/api/info');
    } catch (e) {
      showMsg('No pudimos cargar el turnero. Reservá por WhatsApp: Parque Chas +54 9 11 3068-1320 · Villa Urquiza +54 9 11 3207-0838.');
      return;
    }
    renderServicios();
    state.fecha = INFO.dias[0];
    state.sede = INFO.sedes[0].id;
    renderSedes(); renderBarberos(); renderChips(); renderDias(); loadSlots();
  })();
})();
