// La pantalla del emparejamiento por QR (A25, camino B sin anfitrión; docs/notas/EMPAREJAMIENTO.md «La pantalla»):
// emparejar (leer el QR con la cámara o pegando su texto), la línea fija del emparejamiento (hasta qué hora, la huella,
// la conexión con el relé, «Leer otro QR», «Olvidar el emparejamiento») y lo propuesto a la vista («Propuesto: confírmalo
// en la app» y la lista «Pendiente de la app» con «Volver a pedir» y «Descartar»).
//
// Vive en su propio contenedor, al lado de la carta (no dentro): un repintado de la carta no le quita el vídeo de la
// cámara. Engancha sus propios gestos (como carta/opinar.js) y, además, cualquier botón [data-emparejar] de la página
// (el del arranque y el del aviso de una cuenta que solo se lee) abre su diálogo.
//
// Lo leído del QR es dato hostil: pasa tal cual a emparejamiento.emparejar(texto), que lo valida; nada suyo se pinta
// como HTML (todo va escapado) y de la app solo se dice el código de un rechazo en llano, nunca su motivo.
//
// Los constructores de HTML (htmlLineaEmparejamiento, htmlDialogoEmparejar) son puros y se prueban en Node; instalar()
// es lo único que toca el DOM.

import { escapar } from './dom.js';
import { t } from './textos.js';
import { claveDeQR, claveDeCodigo, esperando, puedeLeerConCamara, leerConCamara, abrirCamara, soltarCamara } from './guardian-emparejado.js';

const attr = (s) => escapar(s).replace(/'/g, '&#39;');
const dos = (n) => String(n).padStart(2, '0');

/** La hora local HH:MM de un instante (ISO o milisegundos); '' si no es un instante. */
export function horaDe(x) {
  const d = new Date(typeof x === 'number' ? x : Date.parse(x));
  return Number.isFinite(d.getTime()) ? dos(d.getHours()) + ':' + dos(d.getMinutes()) : '';
}

/** Lo que se dice de la conexión con el relé (los avisos del cliente: conectado, desconectado, auth_rechazado). */
const RELE = Object.freeze({ conectado: 'emparejarConectado', desconectado: 'emparejarDesconectado', auth_rechazado: 'emparejarAuthRechazado' });

/** Una propuesta de la lista «Pendiente de la app»: su registro, su estado en llano (y el motivo, por su código) y sus gestos. */
function htmlPropuesta(p, sesionViva) {
  const estado = t('emparejarEstado_' + p.estado);
  const motivo = p.estado !== 'propuesto' && p.estado !== 'firmado' && p.code ? ` <small class="emparejar-motivo">${escapar(t(claveDeCodigo(p.code)))}</small>` : '';
  const reenviar = p.estado === 'propuesto' && p.sesion === sesionViva ? `<button type="button" class="enlace" data-emparejar-reenviar="${attr(p.id)}">${escapar(t('emparejarReenviar'))}</button> ` : '';
  return `<li data-propuesta="${attr(p.id)}" data-estado="${attr(p.estado)}"><span>${escapar(t('emparejarPropuesta', { id: String(p.id).slice(0, 8), hora: horaDe(p.propuestaEn) }))}</span> · <b class="emparejar-estado">${escapar(estado)}</b>${motivo} ${reenviar}<button type="button" class="enlace" data-emparejar-descartar="${attr(p.id)}">${escapar(t('emparejarDescartar'))}</button></li>`;
}

/**
 * La línea fija del emparejamiento. `v`: { estado (el de Emparejamiento.estado(), o null), propuestas (las guardadas),
 * esperan (cuántas esperan ahora a la app), rele ('conectado' | 'desconectado' | 'auth_rechazado' | null), mensaje (un
 * texto ya dicho en llano, o ''), pendientesAbierto }. Sin emparejamiento, sin propuestas y sin mensaje, nada.
 */
export function htmlLineaEmparejamiento({ estado = null, propuestas = [], esperan = 0, rele = null, mensaje = '', pendientesAbierto = false } = {}) {
  if (!estado && !propuestas.length && !mensaje) return '';
  const partes = [];
  if (estado) {
    const conexion = RELE[rele ?? (estado.conectado ? 'conectado' : 'desconectado')];
    partes.push(`<span class="emparejar-hasta">${escapar(t('emparejarLinea', { hora: horaDe(estado.hasta), huella: estado.huella }))}</span>`);
    partes.push(`<span class="emparejar-rele" data-rele="${attr(rele ?? (estado.conectado ? 'conectado' : 'desconectado'))}">${escapar(t(conexion))}</span>`);
    if (!estado.aceptada) partes.push(`<span class="emparejar-esperando">${escapar(t('emparejarEsperando'))}</span>`);
  }
  if (esperan > 0) partes.push(`<b class="emparejar-propuesto" data-emparejar-propuesto>${escapar(t('emparejarPropuestoAviso'))}</b>`);
  const botones = estado
    ? ` <button type="button" class="enlace" data-emparejar>${escapar(t('emparejarLeerOtro'))}</button> <button type="button" class="enlace" data-emparejar-olvidar title="${attr(t('emparejarOlvidarTitulo'))}">${escapar(t('emparejarOlvidar'))}</button>`
    : '';
  const aviso = mensaje ? `<p class="emparejar-mensaje" data-emparejar-mensaje>${escapar(mensaje)}</p>` : '';
  const lista = propuestas.length
    ? `<details class="emparejar-pendientes" data-emparejar-pendientes${pendientesAbierto ? ' open' : ''}><summary>${escapar(t('emparejarPendientes', { n: propuestas.length }))}</summary><ul>${[...propuestas].sort((a, b) => (b.propuestaEn ?? 0) - (a.propuestaEn ?? 0)).map((p) => htmlPropuesta(p, estado?.sesion)).join('')}</ul></details>`
    : '';
  return `<div class="emparejar-linea" role="status" data-emparejar-linea>${partes.length ? `<p>${partes.join(' · ')}${botones}</p>` : ''}${aviso}${lista}</div>`;
}

/**
 * El diálogo de emparejar. `v`: { fase: 'leer' | 'hecho', camara (el navegador puede leer con la cámara), camaraActiva,
 * texto (lo pegado, para no perderlo al repintar), error (una clave de textos), ocupado, resultado ({ hasta, huella }),
 * aceptada, sinLibro (no hay ningún libro de la clave de la app en este dispositivo), mensaje }.
 */
export function htmlDialogoEmparejar({ fase = 'leer', camara = false, camaraActiva = false, texto = '', error = null, ocupado = false, resultado = null, aceptada = false, sinLibro = false, mensaje = '' } = {}) {
  let cuerpo;
  if (fase === 'hecho' && resultado) {
    const libro = sinLibro && aceptada
      ? `<p>${escapar(t('emparejarSinLibro'))}</p><p class="opciones"><button type="button" class="principal" data-emparejar-arranque="crear">${escapar(t('emparejarAbrirLibro'))}</button> <button type="button" data-emparejar-arranque="restaurar">${escapar(t('emparejarRestaurar'))}</button></p>`
      : '';
    cuerpo = `<p>${escapar(t('emparejarHasta', { hora: horaDe(resultado.hasta) }))}</p>
      <p>${escapar(t('emparejarHuella', { huella: '' }))}<b class="emparejar-huella" data-emparejar-huella>${escapar(resultado.huella)}</b></p>
      <p role="status" data-emparejar-aceptada="${aceptada}">${escapar(t(aceptada ? 'emparejarAceptada' : 'emparejarEsperando'))}</p>
      ${mensaje ? `<p class="aviso">${escapar(mensaje)}</p>` : ''}${libro}
      <footer><button type="button" data-emparejar-cerrar>${escapar(t('emparejarHecho'))}</button></footer>`;
  } else {
    const lector = !camara
      ? `<p class="ayuda" data-emparejar-sin-camara>${escapar(t('emparejarSinCamara'))}</p>`
      : camaraActiva
        ? `<video class="emparejar-video" data-emparejar-video playsinline muted autoplay></video><p class="ayuda">${escapar(t('emparejarApunta'))} <button type="button" class="enlace" data-emparejar-camara-parar>${escapar(t('emparejarCancelar'))}</button></p>`
        : `<p><button type="button" data-emparejar-camara>${escapar(t('emparejarUsarCamara'))}</button></p>`;
    cuerpo = `<p class="ayuda">${escapar(t('emparejarAyuda'))}</p>
      ${lector}
      <div class="campo"><label for="emparejar-texto">${escapar(t('emparejarTextoQR'))}</label><textarea id="emparejar-texto" data-emparejar-texto rows="3" autocomplete="off" autocapitalize="off" spellcheck="false">${escapar(texto)}</textarea></div>
      ${error ? `<p class="aviso" role="alert" data-emparejar-error>${escapar(t(error))}</p>` : ''}
      <footer><button type="button" data-emparejar-leer${ocupado ? ' disabled aria-busy="true"' : ''}>${escapar(t(ocupado ? 'emparejarLeyendo' : 'emparejarLeer'))}</button></footer>`;
  }
  return `<div class="formulario-fondo emparejar-fondo" data-emparejar-fondo><section class="formulario emparejar" role="dialog" aria-modal="true" aria-label="${attr(t('emparejarTitulo'))}">
    <header><h2>${escapar(t('emparejarTitulo'))}</h2><button type="button" class="cerrar" data-emparejar-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    ${cuerpo}
  </section></div>`;
}

/**
 * La confirmación dentro de la página (en lugar del `confirm` del navegador): el mismo diálogo de la carta (fondo, sección y pie con
 * botones) con una frase y «Seguir» / «Cancelar». `texto` ya va dicho en llano.
 */
export function htmlConfirmarEmparejar({ texto = '' } = {}) {
  return `<div class="formulario-fondo emparejar-fondo" data-emparejar-confirmar-fondo><section class="formulario emparejar" role="alertdialog" aria-modal="true" aria-label="${attr(t('emparejarTitulo'))}">
    <p data-emparejar-confirmar-texto>${escapar(texto)}</p>
    <footer><button type="button" class="principal" data-emparejar-confirmar="si">${escapar(t('emparejarSeguir'))}</button> <button type="button" data-emparejar-confirmar="no">${escapar(t('emparejarCancelar'))}</button></footer>
  </section></div>`;
}

/** Los avisos del emparejamiento que terminan la sesión, con lo que se dice. */
const FINALES = Object.freeze({ rechazada: 'emparejarRechazada', caducada: 'emparejarCaducada', revocada: 'emparejarRevocada', olvidada: 'emparejarOlvidado' });

/**
 * Instala la pantalla: crea su contenedor detrás de `raiz` y engancha sus gestos. `emparejamiento`: la instancia de la
 * página; `adaptador`: su guardián (guardian-emparejado.js, para saber cuántas propuestas esperan ahora); `alCambiar(aviso)`:
 * tras emparejar u olvidar (la carta vuelve a mirar su guardián); `abrirArranque(que)`: «Abrir un libro con la clave de la
 * app» (crear) y «Restaurar una copia» (restaurar); `sinLibro()`: ¿no hay ningún libro de la clave de la app aquí?
 * → { pintar(), abrir(), avisar(aviso) }.
 */
export function instalar({ raiz, emparejamiento, adaptador = null, alCambiar = () => {}, abrirArranque = () => {}, sinLibro = () => false, entorno = globalThis }) {
  const documento = raiz.ownerDocument;
  const caja = documento.createElement('div');
  caja.className = 'emparejamiento';
  caja.innerHTML = '<div data-emparejar-caja-linea></div><div data-emparejar-caja-dialogo></div>';
  raiz.after(caja);
  const cajaLinea = caja.querySelector('[data-emparejar-caja-linea]');
  const cajaDialogo = caja.querySelector('[data-emparejar-caja-dialogo]');
  const ui = { abierto: false, fase: 'leer', camaraActiva: false, texto: '', error: null, ocupado: false, resultado: null, mensaje: '', mensajeDialogo: '', rele: null, pendientesAbierto: false, turno: 0, confirmando: null };
  /** Pregunta dentro de la página; resuelve true con «Seguir», false con «Cancelar», el fondo o Escape (y false si ya hay otra pregunta abierta). */
  const confirmar = (texto) => new Promise((resolver) => {
    if (ui.confirmando) { resolver(false); return; }
    ui.confirmando = { texto, resolver };
    pintarDialogo();
  });
  const responder = (si) => {
    const c = ui.confirmando;
    if (!c) return;
    ui.confirmando = null;
    pintarDialogo();
    c.resolver(si);
  };

  const video = () => cajaDialogo.querySelector('[data-emparejar-video]');

  // La línea es fija abajo: la página reserva su alto (--emparejar-alto, en la raíz) para que no tape nada. Sin línea, 0 y se quita.
  let observador = null;
  function reservarAlto() {
    const linea = cajaLinea.querySelector('[data-emparejar-linea]');
    const alto = linea ? Math.ceil(linea.getBoundingClientRect().height) : 0;
    const estilo = documento.documentElement?.style;
    if (!estilo) return;
    if (alto > 0) estilo.setProperty('--emparejar-alto', alto + 'px');
    else estilo.removeProperty('--emparejar-alto');
    return linea;
  }
  function medirLinea() {
    const linea = reservarAlto();
    try {
      observador?.disconnect();
      if (linea && typeof entorno.ResizeObserver === 'function') {
        observador = observador ?? new entorno.ResizeObserver(() => reservarAlto());
        observador.observe(linea);
      }
    } catch { /* sin observador: el alto se mide en cada repintado y al girar o cambiar de tamaño */ }
  }
  entorno.addEventListener?.('resize', reservarAlto);

  function pintarLinea() {
    let estado = null;
    let propuestas = [];
    try { estado = emparejamiento.estado(); propuestas = emparejamiento.propuestas(); } catch { /* sin emparejamiento usable */ }
    const esperan = esperando(emparejamiento).length + (adaptador?.enEspera?.size ?? 0);
    cajaLinea.innerHTML = htmlLineaEmparejamiento({ estado, propuestas, esperan, rele: estado ? ui.rele : null, mensaje: ui.mensaje, pendientesAbierto: ui.pendientesAbierto });
    medirLinea();
  }

  function pintarDialogo() {
    const pregunta = ui.confirmando ? htmlConfirmarEmparejar({ texto: ui.confirmando.texto }) : '';
    if (!ui.abierto) { cajaDialogo.innerHTML = pregunta; cajaDialogo.querySelector('[data-emparejar-confirmar="no"]')?.focus?.(); return; }
    const estado = emparejamiento.estado();
    cajaDialogo.innerHTML = htmlDialogoEmparejar({
      fase: ui.fase, camara: puedeLeerConCamara(entorno), camaraActiva: ui.camaraActiva, texto: ui.texto, error: ui.error, ocupado: ui.ocupado,
      resultado: ui.resultado, aceptada: Boolean(estado?.aceptada), sinLibro: sinLibro(), mensaje: ui.mensajeDialogo,
    }) + pregunta;
    if (pregunta) cajaDialogo.querySelector('[data-emparejar-confirmar="no"]')?.focus?.();
    else if (ui.fase === 'leer' && !ui.camaraActiva) cajaDialogo.querySelector('[data-emparejar-texto]')?.focus?.();
  }

  function pintar() {
    pintarLinea();
    // Con la cámara abierta el diálogo no se repinta (perdería el vídeo); en «hecho», sí (llega «emparejada»).
    if (ui.abierto && ui.fase === 'hecho') pintarDialogo();
  }

  /** Para la lectura con la cámara (si la hay) y la suelta. */
  function pararCamara() {
    ui.turno += 1;
    if (ui.camaraActiva) soltarCamara(video());
    ui.camaraActiva = false;
  }

  function abrir() {
    pararCamara();
    Object.assign(ui, { abierto: true, fase: 'leer', texto: '', error: null, ocupado: false, resultado: null, mensajeDialogo: '' });
    pintarDialogo();
  }

  function cerrar() {
    pararCamara();
    ui.abierto = false;
    pintarDialogo();
  }

  /** Lee el texto de un QR: avisa antes si hay propuestas esperando (caducarán), empareja y lo dice. */
  async function procesar(texto) {
    const n = esperando(emparejamiento).length;
    if (n && !(await confirmar(t('emparejarSustituirConfirmar', { n })))) return;
    ui.ocupado = true;
    ui.error = null;
    pintarDialogo();
    try {
      ui.resultado = await emparejamiento.emparejar(texto); // tal cual: lo valida el módulo
      ui.fase = 'hecho';
      ui.texto = '';
      ui.mensajeDialogo = n ? t('emparejarSustituidas', { n }) : '';
      ui.mensaje = ui.mensajeDialogo;
      ui.rele = null;
    } catch (e) {
      ui.error = claveDeQR(e);
      if (ui.error === 'emparejarFallo') console.error('emparejamiento:', String(e?.message ?? e));
    }
    ui.ocupado = false;
    pintarDialogo();
    pintarLinea();
    await alCambiar({ tipo: 'leida' });
  }

  async function usarCamara() {
    pararCamara();
    const turno = ui.turno;
    ui.camaraActiva = true;
    ui.error = null;
    pintarDialogo();
    const v = video();
    try {
      const detector = await abrirCamara(v, entorno);
      if (turno !== ui.turno) { soltarCamara(v); return; }
      const texto = await leerConCamara({ detector, video: v, cancelado: () => turno !== ui.turno });
      if (turno !== ui.turno || texto === null) return;
      ui.camaraActiva = false;
      await procesar(texto);
    } catch {
      soltarCamara(v);
      if (turno !== ui.turno) return;
      ui.camaraActiva = false;
      ui.error = 'emparejarCamaraNo';
      pintarDialogo();
    }
  }

  async function gesto(f) {
    try { await f(); } catch (e) { ui.mensaje = t(claveDeCodigo(e?.code)); console.error('emparejamiento:', String(e?.message ?? e)); }
    pintarLinea();
  }

  documento.addEventListener('click', (e) => {
    const b = (s) => e.target?.closest?.(s);
    let el;
    if ((el = b('[data-emparejar-confirmar]'))) { e.preventDefault(); responder(el.dataset.emparejarConfirmar === 'si'); return; }
    if ((el = b('[data-emparejar-confirmar-fondo]')) && e.target === el) { responder(false); return; }
    if (ui.confirmando) return; // con una pregunta abierta, solo ella responde
    if ((el = b('[data-emparejar-fondo]')) && e.target === el) { cerrar(); return; }
    if (b('[data-emparejar-cerrar]')) { e.preventDefault(); cerrar(); return; }
    if (b('[data-emparejar-camara-parar]')) { e.preventDefault(); pararCamara(); pintarDialogo(); return; }
    if (b('[data-emparejar-camara]')) { e.preventDefault(); void usarCamara(); return; }
    if ((el = b('[data-emparejar-leer]'))) { e.preventDefault(); if (!el.disabled) void procesar(cajaDialogo.querySelector('[data-emparejar-texto]')?.value ?? ''); return; }
    if ((el = b('[data-emparejar-arranque]'))) { e.preventDefault(); const que = el.dataset.emparejarArranque; cerrar(); void abrirArranque(que); return; }
    if ((el = b('[data-emparejar-reenviar]'))) { e.preventDefault(); const id = el.dataset.emparejarReenviar; void gesto(() => emparejamiento.reenviar(id)); return; }
    if ((el = b('[data-emparejar-descartar]'))) { e.preventDefault(); const id = el.dataset.emparejarDescartar; void gesto(() => emparejamiento.descartar(id)); return; }
    if (b('[data-emparejar-olvidar]')) {
      e.preventDefault();
      void confirmar(t('emparejarOlvidarConfirmar')).then((si) => {
        if (si) return gesto(async () => { await emparejamiento.olvidar(); ui.mensaje = t('emparejarOlvidado'); await alCambiar({ tipo: 'olvidada' }); });
      });
      return;
    }
    if (b('[data-emparejar]')) { e.preventDefault(); abrir(); }
  });
  documento.addEventListener('input', (e) => { if (e.target?.matches?.('[data-emparejar-texto]')) ui.texto = e.target.value; });
  documento.addEventListener('toggle', (e) => { if (e.target?.matches?.('[data-emparejar-pendientes]')) { ui.pendientesAbierto = e.target.open; reservarAlto(); } }, true);
  documento.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (ui.confirmando) responder(false); else if (ui.abierto) cerrar(); });
  // Al salir de la pantalla, la cámara se suelta; al cerrar la página, además se para el cliente del relé (no borra nada).
  documento.addEventListener('visibilitychange', () => { if (documento.visibilityState === 'hidden' && ui.camaraActiva) { pararCamara(); pintarDialogo(); } });
  entorno.addEventListener?.('pagehide', () => { pararCamara(); emparejamiento.cerrar(); });
  entorno.addEventListener?.('pageshow', (e) => { if (e.persisted) void emparejamiento.cargar().then(() => alCambiar({ tipo: 'cargada' })).catch(() => {}); });

  return {
    pintar,
    abrir,
    /** Un aviso del emparejamiento: la conexión con el relé y lo que termina la sesión se dicen; todo repinta la línea. */
    avisar(aviso) {
      const tipo = aviso?.tipo;
      if (tipo in RELE) ui.rele = tipo;
      if (tipo in FINALES && tipo !== 'olvidada') ui.mensaje = t(FINALES[tipo]);
      if (tipo === 'emparejada') ui.mensaje = '';
      if (tipo === 'propuesta') setTimeout(pintarLinea, 300); // la propuesta se guarda en cuanto sale hacia el relé
      pintar();
    },
  };
}
