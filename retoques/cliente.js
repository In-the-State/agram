// El cliente de retoques: lo inyecta retoques/servidor.mjs en la respuesta de index.html (el archivo en disco no cambia)
// y NO forma parte de la carta publicada. Es un guion clásico en el <head>: corre antes que carta/app.js (un módulo).
//
//   · la llave: la toma del fragmento (#llave=…), la guarda en sessionStorage y la quita de la barra; sin llave, un
//     campo pequeño «pega la llave» (sin ella la carta se ve y se usa igual: solo no hay Core ni envío de opiniones);
//   · anuncia el servidor a la carta en window.agramRetoques (solo si hay llave: si no, la carta queda como siempre);
//   · escucha los avisos de archivos cambiados: un cambio solo de CSS se aplica sin recargar, cualquier otro recarga
//     (si Core está contestando en esta pestaña, la recarga espera a que acabe).
(() => {
  'use strict';
  const CLAVE = 'agram.retoques.llave';
  const OCULTO = 'agram.retoques.sinCampo';
  const CABECERA = 'x-retoques-llave';
  const RE = /^[0-9a-f]{64}$/;
  const leer = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const poner = (k, v) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* sin almacenamiento */ } };

  // La llave del fragmento: a sessionStorage y fuera de la barra (y del historial).
  const enFragmento = /(?:^#|&)llave=([0-9a-f]{64})(?:&|$)/.exec(location.hash);
  if (enFragmento) {
    poner(CLAVE, enFragmento[1]);
    const resto = location.hash.slice(1).split('&').filter((p) => !p.startsWith('llave=')).join('&');
    history.replaceState(history.state, '', location.pathname + location.search + (resto ? '#' + resto : ''));
  }
  let llave = RE.test(leer(CLAVE) ?? '') ? leer(CLAVE) : null;
  let ocupado = 0;
  let recargaPendiente = false;

  const recargar = () => { if (ocupado) recargaPendiente = true; else location.reload(); };

  async function llamar(ruta, { metodo = 'GET', cuerpo } = {}) {
    const cabeceras = { [CABECERA]: llave ?? '' };
    if (cuerpo !== undefined) cabeceras['content-type'] = 'application/json';
    const r = await fetch(ruta, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), cache: 'no-store', credentials: 'same-origin' });
    if (r.status === 401) { llave = null; poner(CLAVE, null); }
    return r;
  }

  /** Las líneas de una respuesta que llega a trozos. */
  async function* lineas(r) {
    const lector = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let n;
      while ((n = buf.indexOf('\n')) >= 0) { yield buf.slice(0, n); buf = buf.slice(n + 1); }
    }
    buf += dec.decode();
    if (buf) yield buf;
  }

  const api = {
    /** ¿Hay llave? Sin ella, la carta no enseña «Core» ni manda opiniones aquí. */
    tieneLlave: () => Boolean(llave),
    ocupado: () => ocupado > 0,
    async estado() {
      const r = await llamar('/retoques/estado');
      return r.ok ? r.json() : { ok: false, estado: r.status };
    },
    /** La lista de cambios de fondo: { total, sesiones, sesionesSinCrecer, entradas: [{ titulo, clase, estado, texto }] } o null. */
    async fondo() {
      try { const r = await llamar('/retoques/fondo'); return r.ok ? await r.json() : null; } catch { return null; }
    },
    /** Manda una opinión de «opinar» a retoques/.datos/opiniones.jsonl. → true si llegó. */
    async opinion(opinion) {
      if (!llave) return false;
      try { return (await llamar('/retoques/opinion', { metodo: 'POST', cuerpo: opinion })).ok; } catch { return false; }
    },
    /** Una conversación nueva con Core. → { ok, motivo? } */
    async nueva() {
      try {
        const r = await llamar('/retoques/core/nueva', { metodo: 'POST', cuerpo: {} });
        return r.ok ? { ok: true } : { ok: false, motivo: (await r.json().catch(() => ({}))).motivo ?? 'HTTP ' + r.status };
      } catch (e) { return { ok: false, motivo: String(e?.message ?? e) }; }
    },
    /** Un commit de lo cambiado en carta/ e index.html (solo en la rama de retoques). → { ok, commit?, motivo? } */
    async guardar(mensaje) {
      try {
        const r = await llamar('/retoques/guardar', { metodo: 'POST', cuerpo: { mensaje } });
        return await r.json().catch(() => ({ ok: false, motivo: 'HTTP ' + r.status }));
      } catch (e) { return { ok: false, motivo: String(e?.message ?? e) }; }
    },
    /**
     * Habla con Core: { texto, contexto, senalado }. alTrozo recibe cada trozo ({ tipo: 'texto' | 'archivo' | 'rechazo' |
     * 'fin' | 'error', … }) según llega. → el último ('fin' o 'error'). Mientras contesta, las recargas esperan.
     */
    async core(cuerpo, alTrozo = () => {}) {
      ocupado++;
      let fin = null;
      const dar = (o) => { try { alTrozo(o); } catch (e) { console.error(e); } };
      try {
        const r = await llamar('/retoques/core', { metodo: 'POST', cuerpo });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          fin = { tipo: 'error', motivo: d.motivo ?? (r.status === 401 ? 'la llave de retoques ya no vale (¿se reinició el servidor?)' : 'HTTP ' + r.status), ocupado: Boolean(d.ocupado) };
          dar(fin);
          return fin;
        }
        for await (const l of lineas(r)) {
          if (!l.trim()) continue;
          let o;
          try { o = JSON.parse(l); } catch { continue; }
          if (o.tipo === 'fin' || o.tipo === 'error') fin = o;
          dar(o);
        }
        if (!fin) { fin = { tipo: 'error', motivo: 'la respuesta se cortó' }; dar(fin); }
        return fin;
      } catch (e) {
        fin = { tipo: 'error', motivo: String(e?.message ?? e) };
        dar(fin);
        return fin;
      } finally {
        ocupado--;
        if (!ocupado && recargaPendiente) setTimeout(() => location.reload(), 250);
      }
    },
  };

  // ---- los avisos de archivos cambiados ----
  function aplicar(aviso) {
    if (aviso?.tipo === 'css') {
      for (const l of document.querySelectorAll('link[rel~="stylesheet"]')) {
        const u = new URL(l.getAttribute('href'), location.href);
        if (u.origin !== location.origin) continue;
        u.searchParams.set('retoque', String(Date.now()));
        l.href = u.pathname + u.search;
      }
    } else if (aviso?.tipo === 'recargar') recargar();
  }
  async function escuchar() {
    let espera = 1000;
    while (llave) {
      try {
        const r = await llamar('/retoques/eventos');
        if (r.status === 401) { mostrarCampo('la llave de retoques ya no vale (¿se reinició el servidor?)'); return; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        espera = 1000;
        for await (const l of lineas(r)) {
          if (!l.startsWith('data: ')) continue;
          try { aplicar(JSON.parse(l.slice(6))); } catch { /* aviso roto */ }
        }
      } catch { /* sin conexión: se reintenta */ }
      await new Promise((ok) => setTimeout(ok, espera));
      espera = Math.min(espera * 2, 15000);
    }
  }

  // ---- «pega la llave» ----
  function mostrarCampo(aviso = '') {
    if (leer(OCULTO) === '1' && !aviso) return;
    const poner2 = () => {
      document.getElementById('retoques-llave')?.remove();
      const caja = document.createElement('form');
      caja.id = 'retoques-llave';
      caja.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;display:flex;gap:4px;align-items:center;max-width:calc(100vw - 16px);padding:6px;background:#fffdf8;color:#2b2620;border:1px solid #c9bfae;border-radius:6px;font:13px system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.15)';
      const campo = document.createElement('input');
      campo.placeholder = aviso || 'pega la llave de retoques';
      campo.setAttribute('aria-label', 'pega la llave de retoques');
      campo.autocomplete = 'off';
      campo.spellcheck = false;
      campo.style.cssText = 'width:16em;max-width:50vw;font:inherit;padding:3px';
      const vale = document.createElement('button');
      vale.textContent = 'vale';
      vale.style.font = 'inherit';
      const cerrar = document.createElement('button');
      cerrar.type = 'button';
      cerrar.textContent = '×';
      cerrar.title = 'sin Core en esta pestaña';
      cerrar.style.font = 'inherit';
      cerrar.addEventListener('click', () => { poner(OCULTO, '1'); caja.remove(); });
      caja.append(campo, vale, cerrar);
      caja.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = campo.value.trim();
        if (!RE.test(v)) { campo.value = ''; campo.placeholder = 'esa llave no vale'; return; }
        llave = v;
        let r = null;
        try { r = await llamar('/retoques/estado'); } catch { /* sin red */ }
        if (r?.ok) { poner(CLAVE, v); location.reload(); }
        else { llave = null; campo.value = ''; campo.placeholder = r ? 'esa llave no vale' : 'sin conexión con el servidor'; }
      });
      document.body.append(caja);
    };
    if (document.body) poner2();
    else document.addEventListener('DOMContentLoaded', poner2, { once: true });
  }

  if (llave) {
    window.agramRetoques = Object.freeze(api);
    void escuchar();
  } else {
    mostrarCampo();
  }
})();
