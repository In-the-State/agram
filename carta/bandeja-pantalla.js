// La bandeja en pantalla (A33; agram-equipo/DISENO_BANDEJA_PV4.md, pasos 2 y 3): lo que se pinta de la bandeja
// (carta/bandeja.js) en la lente, sin decidir nada. Dos mitades:
//
//   - vistaDeLaBandeja: de lo que dio la prueba en seco (bandeja.probar) a lo que se pinta, con los textos llanos que da
//     la app (nombres de acciones, quién, cuánto): cada entrada con dónde se compuso, «entra» o su motivo y su resumen
//     sacado SOLO del candidato (bandeja.resumenDe), y lo de la bandeja entera (cuántas, cuántas no entran, lo que cuesta).
//   - los html*: la cuenta en el marco de la lente, la tira de pendientes bajo la cabecera de acciones de donde se compuso
//     (y la marca en la ficha de la acción), la bandeja entera en el 4, y el estado de la entrada y los botones dentro del
//     formulario (en la bandeja: «listo» y «quitar»; en el aro: el resumen y «ejecutar ahora»).
//
// Qué es dato, qué es código: lo compuesto es dato del dispositivo (el borrador); su resumen y estos sitios son lente, y
// ningún libro los redefine: la bandeja es la salida de emergencia de la persona. Por eso el sitio del 4 es una constante
// de la lente (PV_DE_LA_BANDEJA) y no sale de la época. Ninguna acción se nombra aquí: todo llega por su id.

import { t } from './textos.js';
import * as acciones from '../src/acciones.js';
import * as contrato from '../src/contrato.js';

/** El punto de vista donde se ejecuta la bandeja (VG 18-11: «ejecutar está en el 4»). De la lente, no de la época. */
export const PV_DE_LA_BANDEJA = 4;

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const corto = (id) => String(id ?? '').slice(0, 8);

/** Una cantidad de T en segundos, por escalas, como se lee («1 h 11 min»). */
export function textoDeT(segundos) {
  const escalas = [['dia', 86400], ['hora', 3600], ['minuto', 60], ['segundo', 1]];
  let resto = Math.max(0, Math.round(Number(segundos) || 0));
  const partes = [];
  for (const [escala, s] of escalas) {
    const n = Math.floor(resto / s);
    if (n > 0) { partes.push(t('tPieza_' + escala, { n })); resto -= n * s; }
  }
  return partes.length ? partes.join(' ') : t('tPieza_minuto', { n: 0 });
}

/**
 * La etiqueta de un parámetro de una acción en el idioma de quien mira, la misma que enseña su formulario (carta.js
 * formulario: la del núcleo, con el retoque del libro si lo hay). Sin plantilla, su nombre.
 */
export function etiquetaDeParametro(eje, accion, nombre, { idioma } = {}) {
  const epoca = typeof eje?.epoca === 'function' ? eje.epoca() : undefined;
  const o = { idioma, ...(epoca ? { epoca } : {}) };
  const p = acciones.plantillaDeTransaccion(accion, o) ?? acciones.plantillaDeTransaccion(accion);
  if (!p) return nombre;
  const delNucleo = acciones.parametros(p, { ...o, eje }).find((x) => x.nombre === nombre)?.etiqueta ?? nombre;
  return contrato.texto(eje, contrato.claves.parametro(acciones.nombreDeAccion(p), nombre, 'label'), idioma, { original: delNucleo, ...(epoca ? { epoca } : {}) }) ?? delNucleo;
}

/**
 * Lo que de verdad le falta a una acción para estar completa: los parámetros que su formulario, sin nada escrito, da por
 * que faltan (requeridos sin valor ni defecto; los que tienen defecto los pone el núcleo al componer). `campos`: los de
 * carta.formulario(eje, X, accion, yo, {}). → sus nombres.
 */
export const queFaltan = (campos) => (campos ?? []).filter((c) => c.falta).map((c) => c.nombre);

/** ¿Está completa una entrada? Lo escrito se lee sin fallos y cada uno de los que faltaban (queFaltan) tiene ya valor. */
export const estaCompleta = (valores, faltaban, motivos = []) => (motivos ?? []).length === 0
  && (faltaban ?? []).every((n) => valores?.[n] !== undefined && valores[n] !== null && valores[n] !== '');

/**
 * Lo que dijo el último intento de ejecutar, solo mientras el borrador sea el mismo con que se intentó (`de`: el borrador
 * guardado entonces). Quitar, poner o cambiar una entrada lo deja viejo, y un motivo viejo no se enseña.
 */
export const motivosDelUltimoIntento = ({ motivos = [], de = null } = {}, borrador) => (de !== null && de === borrador ? motivos : []);

/** El motivo de un item en una línea llana: «falta por rellenar: …» o los mensajes (ya en llano) unidos. */
function motivoDe(x, llano, etiqueta = (n) => n) {
  if (x.entra) return null;
  // Lo que falta, por la etiqueta del parámetro en el idioma (la que enseña el formulario), nunca por su nombre interno.
  if (x.faltan) return t('bandejaFalta', { campos: x.faltan.map(etiqueta).join(', ') || '…' });
  const ms = llano(x.motivos ?? []).map((m) => m?.mensaje ?? String(m)).filter(Boolean);
  return ms.length ? ms.join(' · ') : t('bandejaNoEntra');
}

/**
 * Lo que se pinta de la bandeja, desde lo que dio bandeja.probar (o probarAhora). `textos`: cómo dice la app las cosas
 * en el idioma de quien mira ({ nombre(accion), registro(id), quien(identidad), cuanto({ serie, cantidad }), llano(motivos)
 * }); sin ellos, los ids cortos. `extra`: { motivos, ocupado } (lo que dijo la última vez que se ejecutó). → null si no hay
 * nada que pintar; si no, { total, noEntran, ok, items, cuesta, motivos, ocupado }. Cada item: { id, puesta, para, accion
 * (su id), nombre, entra, motivo, donde: { X, pv }, resumen: { nace, sobre, movimientos: [texto], cuesta } }.
 */
export function vistaDeLaBandeja(probado, textos = {}, extra = {}) {
  if (!probado || !Array.isArray(probado.items)) return null;
  const nombre = textos.nombre ?? ((a) => String(a));
  const registro = textos.registro ?? corto;
  const quien = textos.quien ?? ((x) => String(x));
  const cuanto = textos.cuanto ?? ((m) => `${m.cantidad} ${m.serie}`);
  const llano = textos.llano ?? ((ms) => ms);
  const etiquetaDe = textos.etiqueta ?? ((accion, n) => n);
  const porId = new Map(probado.items.filter((x) => x.id !== null).map((x) => [x.id, x]));
  const items = probado.items.map((x) => {
    // Lo que pone la bandeja se ve donde se compuso lo que lo necesita.
    const entrada = x.entrada ?? porId.get(x.para)?.entrada ?? null;
    const accion = x.puesta ? x.accion : entrada?.accion ?? x.accion;
    // Un campo (tocar un valor) no es una acción: se nombra por lo que escribe.
    const esCampo = !x.puesta && entrada?.tipo === 'campo';
    const esRegistro = !x.puesta && entrada?.tipo === 'registro';
    const suNombre = nombreDeLaEntrada(x.puesta ? null : entrada, accion, nombre);
    const r = x.resumen;
    const resumen = r ? {
      nace: suNombre,
      sobre: r.nace.sobre ? registro(r.nace.sobre) : null,
      movimientos: r.movimientos.filter((m) => !(m.token === 'T' && m.a === null && m.de === r.nace.autor && !m.estado))
        .map((m) => t('bandejaMueve', { cuanto: cuanto(m), de: m.de === null ? t('bandejaNadie') : quien(m.de), a: m.a === null ? t('bandejaNadie') : quien(m.a) })),
      cuesta: r.cuesta.segundos,
    } : null;
    return {
      id: x.id, puesta: Boolean(x.puesta), para: x.para ?? null, accion, nombre: suNombre, ...(esCampo ? { tipo: 'campo' } : esRegistro ? { tipo: 'registro' } : {}), entra: Boolean(x.entra),
      motivo: motivoDe(x, llano, (n) => etiquetaDe(accion, n)), donde: entrada?.donde ?? { X: null, pv: null }, valores: entrada?.valores ?? null, resumen,
    };
  });
  const total = items.filter((x) => !x.puesta).length;
  const motivos = [...llano(probado.motivos ?? []), ...(extra.motivos ?? [])].map((m) => m?.mensaje ?? String(m));
  if (!total && !motivos.length) return null;
  return {
    total, noEntran: items.filter((x) => !x.entra).length, ok: Boolean(probado.ok) && items.length > 0, items,
    cuesta: probado.cuesta?.segundos ?? items.reduce((s, x) => s + (x.resumen?.cuesta ?? 0), 0), motivos, ocupado: Boolean(extra.ocupado),
  };
}

/**
 * Cómo se llama lo que compone una entrada, según su tipo: un campo, por lo que escribe; un registro de ajustes, «guardar
 * ajustes»; una acción (o lo que pone la bandeja), su nombre en el idioma (`nombre(accion)`). Nunca «null».
 */
export function nombreDeLaEntrada(entrada, accion, nombre = (a) => String(a)) {
  if (entrada?.tipo === 'campo') return t('bandejaCampo', { texto: entrada.valores?.texto ?? '' });
  if (entrada?.tipo === 'registro') return t('bandejaRegistro');
  return accion === null || accion === undefined ? t('bandejaRegistro') : nombre(accion);
}

/** Lo compuesto en un sitio (registro X y punto de vista pv), con lo que la bandeja pone para ello. */
export const delSitio = (v, X, pv) => (v?.items ?? []).filter((x) => x.donde.X === X && x.donde.pv === pv);

/** El orden del 4 de X: primero lo compuesto sobre X (con lo que la bandeja pone para ello), después lo demás, cada parte en su orden. */
export function ordenDelCuatro(v, X) {
  const items = v?.items ?? [];
  const aqui = (x) => x.donde.X === X;
  return [...items.filter(aqui), ...items.filter((x) => !aqui(x))];
}

/** ¿Tiene la acción `accion` sobre X una entrada pendiente? (la marca en su ficha). */
export const tienePendiente = (v, X, accion) => (v?.items ?? []).some((x) => !x.puesta && x.donde.X === X && x.accion === accion);

// ---------- el html ----------

const estadoDe = (x) => (x.entra
  ? `<span class="bandeja-entra" data-entra>${escapar(t('bandejaEntra'))}</span>`
  : `<span class="bandeja-no-entra" data-no-entra>${escapar(x.motivo ?? t('bandejaNoEntra'))}</span>`);

/** El resumen de una entrada: qué nace (y sobre qué), qué mueve y lo que cuesta. */
function htmlResumen(r, { largo = false } = {}) {
  if (!r) return '';
  const nace = r.sobre ? t('bandejaNace', { accion: r.nace, sobre: r.sobre }) : r.nace;
  const mueve = r.movimientos.length ? (largo ? `<ul class="bandeja-mueve">${r.movimientos.map((m) => `<li>${escapar(m)}</li>`).join('')}</ul>` : ` · ${escapar(r.movimientos.join(' · '))}`) : '';
  const cuesta = `<small class="bandeja-cuesta">${escapar(t('bandejaCuesta', { t: textoDeT(r.cuesta) }))}</small>`;
  return largo ? `<b class="bandeja-nace">${escapar(nace)}</b>${mueve} ${cuesta}` : `<span class="bandeja-nace">${escapar(nace)}</span>${mueve} ${cuesta}`;
}

/** La cuenta de la bandeja en el marco de la lente: siempre a la vista, distinta si alguna no entra; vacía, nada. Tocarla lleva al 4. */
export function htmlCuentaDeLaBandeja(v) {
  if (!v?.total) return '';
  const texto = v.noEntran ? t('bandejaCuentaNoEntra', { n: v.total, k: v.noEntran }) : t('bandejaCuenta', { n: v.total });
  return `<button type="button" class="bandeja-cuenta${v.noEntran ? ' no-entra' : ''}" data-nodo="control" data-bandeja-ir title="${escapar(t('bandejaCuentaTitulo'))}">${escapar(texto)}</button>`;
}

/**
 * La tira de pendientes bajo la cabecera de acciones de un sitio (X, pv): cada entrada compuesta ahí con su nombre, su
 * resumen corto y «entra» o su motivo; tocarla vuelve a abrir su formulario y su «×» la quita. Lo que pone la bandeja
 * se ve, pero no se quita suelto.
 */
export function htmlTiraDeLaBandeja(v, X, pv) {
  const lista = delSitio(v, X, pv);
  if (!lista.length) return '';
  const li = (x) => {
    // El nombre va una vez: el resumen ya empieza por él («comprometer tiempo sobre …»); sin resumen (a medias), solo el nombre.
    const cuerpo = `${x.resumen ? htmlResumen(x.resumen) : `<span class="bandeja-nombre">${escapar(x.nombre)}</span>`} ${estadoDe(x)}`;
    if (x.puesta) return `<li class="bandeja-item puesta${x.entra ? '' : ' no-entra'}" data-bandeja-puesta title="${escapar(t('bandejaPuestaTitulo'))}"><small class="bandeja-la-pone">${escapar(t('bandejaPuesta'))}</small> ${cuerpo}</li>`;
    if (x.tipo === 'campo' || x.tipo === 'registro') return `<li class="bandeja-item campo${x.entra ? '' : ' no-entra'}"><span class="bandeja-abrir">${cuerpo}</span><button type="button" class="bandeja-quitar" data-nodo="control" data-bandeja-quitar="${escapar(x.id)}" title="${escapar(t('bandejaQuitarTitulo'))}" aria-label="${escapar(t('bandejaQuitarTitulo'))}">×</button></li>`;
    return `<li class="bandeja-item${x.entra ? '' : ' no-entra'}"><button type="button" class="bandeja-abrir" data-nodo="accion" data-bandeja-abrir="${escapar(x.id)}" title="${escapar(t('bandejaAbrirTitulo'))}">${cuerpo}</button><button type="button" class="bandeja-quitar" data-nodo="control" data-bandeja-quitar="${escapar(x.id)}" title="${escapar(t('bandejaQuitarTitulo'))}" aria-label="${escapar(t('bandejaQuitarTitulo'))}">×</button></li>`;
  };
  return `<ul class="bandeja-tira" data-bandeja-tira="${escapar(pv)}" data-x="${escapar(X)}" aria-label="${escapar(t('bandejaTira'))}">${lista.map(li).join('')}</ul>`;
}

/** En un sitio comprimido (o una fila cerrada): solo cuántas hay compuestas ahí. */
export function htmlMarcaDeLaBandeja(v, X, pv) {
  const n = delSitio(v, X, pv).filter((x) => !x.puesta).length;
  return n ? `<small class="bandeja-marca" data-bandeja-marca="${escapar(pv)}" title="${escapar(t('bandejaMarcaTitulo', { n }))}">${escapar(t('bandejaMarca', { n }))}</small>` : '';
}

/**
 * El 4 (DISENO_BANDEJA_PV4, «El 4»): arriba, la bandeja entera del libro, primero lo compuesto sobre X. Cada entrada con
 * su resumen, «entra» o su motivo y quitar (no lo que pone la bandeja). Abajo, el total y UN botón de ejecutar; si algo no
 * entra o está a medias, el botón lo dice y no lanza.
 */
export function htmlBandejaDelCuatro(v, X) {
  if (!v?.total) return '';
  const li = (x) => `<li class="bandeja-item${x.puesta ? ' puesta' : ''}${x.entra ? '' : ' no-entra'}"${x.puesta ? ' data-bandeja-puesta' : ''}>`
    + `${x.puesta ? `<small class="bandeja-la-pone" title="${escapar(t('bandejaPuestaTitulo'))}">${escapar(t('bandejaPuesta'))}</small> ` : ''}`
    + `${htmlResumen(x.resumen, { largo: true }) || `<b class="bandeja-nace">${escapar(x.nombre)}</b>`} ${estadoDe(x)}`
    + `${x.puesta ? '' : ` <button type="button" class="bandeja-quitar" data-nodo="control" data-bandeja-quitar="${escapar(x.id)}" title="${escapar(t('bandejaQuitarTitulo'))}">${escapar(t('bandejaQuitar'))}</button>`}</li>`;
  const lista = ordenDelCuatro(v, X);
  const aqui = lista.filter((x) => x.donde.X === X).length;
  const motivos = v.motivos.length ? `<ul class="motivos" role="alert">${v.motivos.map((m) => `<li>${escapar(m)}</li>`).join('')}</ul>` : '';
  const boton = v.ok
    ? `<button type="button" class="bandeja-ejecutar" data-nodo="accion" data-bandeja-ejecutar${v.ocupado ? ' disabled' : ''}>${escapar(t(v.ocupado ? 'bandejaEjecutando' : 'bandejaEjecutar', { n: v.items.length }))}</button>`
    : `<button type="button" class="bandeja-ejecutar no-lanza" data-nodo="accion" data-bandeja-ejecutar data-no-lanza aria-disabled="true">${escapar(t('bandejaNoSeLanza', { n: v.noEntran }))}</button>`;
  return `<section class="bandeja-cuatro" data-bandeja-cuatro data-x="${escapar(X)}" aria-label="${escapar(t('bandejaTitulo'))}"><h3>${escapar(t('bandejaTitulo'))}</h3>`
    + `${aqui && aqui < lista.length ? `<small class="bandeja-aqui">${escapar(t('bandejaPrimeroAqui', { n: aqui }))}</small>` : ''}`
    + `<ol class="bandeja-lista">${lista.map(li).join('')}</ol>${motivos}`
    + `<footer><p class="bandeja-total">${escapar(t('bandejaTotal', { t: textoDeT(v.cuesta) }))}</p>${boton}</footer></section>`;
}

/**
 * El estado de la entrada dentro de su formulario (se repinta solo, sin tocar los campos: data-bandeja-estado). `e`:
 * { modo: 'bandeja' | 'ahora', vista (la de vistaDeLaBandeja de esa sola entrada o del borrador), id (la entrada, o null
 * si aún no se ha tocado nada) }.
 */
export function htmlEstadoDeLaEntrada(e) {
  if (!e) return '<div class="bandeja-estado" data-bandeja-estado></div>';
  if (e.probando && !e.vista) return `<div class="bandeja-estado" data-bandeja-estado><small>${escapar(t('bandejaProbando'))}</small></div>`;
  if (e.modo === 'bandeja' && !e.id) return `<div class="bandeja-estado" data-bandeja-estado><small>${escapar(t('bandejaSinEntrada'))}</small></div>`;
  const items = e.modo === 'ahora' ? e.vista?.items ?? [] : (e.vista?.items ?? []).filter((x) => x.id === e.id || x.para === e.id);
  if (!items.length) return `<div class="bandeja-estado" data-bandeja-estado>${(e.vista?.motivos ?? []).map((m) => `<p class="bandeja-no-entra">${escapar(m)}</p>`).join('')}</div>`;
  const li = (x) => `<li class="bandeja-item${x.puesta ? ' puesta' : ''}${x.entra ? '' : ' no-entra'}">${x.puesta ? `<small class="bandeja-la-pone">${escapar(t('bandejaPuesta'))}</small> ` : ''}${htmlResumen(x.resumen, { largo: e.modo === 'ahora' }) || `<b>${escapar(x.nombre)}</b>`} ${estadoDe(x)}</li>`;
  const titulo = e.modo === 'ahora' ? `<h3>${escapar(t('ahoraResumen'))}</h3>` : `<small class="bandeja-en">${escapar(t('bandejaEnLaBandeja'))}</small>`;
  const motivos = e.modo === 'ahora' && e.vista?.motivos?.length ? `<ul class="motivos" role="alert">${e.vista.motivos.map((m) => `<li>${escapar(m)}</li>`).join('')}</ul>` : '';
  return `<div class="bandeja-estado" data-bandeja-estado role="status">${titulo}<ul class="bandeja-lista">${items.map(li).join('')}</ul>${motivos}</div>`;
}

/**
 * El pie del formulario de una acción que va por la bandeja: el estado de su entrada y sus botones. En la bandeja (lanzada
 * desde un punto de vista): «listo» (cierra) y «quitar» (si ya hay entrada); no hay botón que escriba. En el aro: un solo
 * «ejecutar ahora» (submit), con el resumen encima.
 */
export function htmlPieDeLaBandeja(e) {
  if (!e) return '';
  const botones = e.modo === 'ahora'
    ? `<button type="submit" class="ejecutar-ahora" data-ejecutar-ahora${e.ocupado ? ' disabled' : ''}>${escapar(t(e.ocupado ? 'bandejaEjecutando' : 'ahoraEjecutar'))}</button>`
    : `<button type="button" class="bandeja-listo" data-nodo="control" data-bandeja-listo title="${escapar(t('bandejaListoTitulo'))}">${escapar(t('bandejaListo'))}</button>${e.id ? `<button type="button" class="bandeja-quitar" data-nodo="control" data-bandeja-quitar="${escapar(e.id)}" title="${escapar(t('bandejaQuitarTitulo'))}">${escapar(t('bandejaQuitar'))}</button>` : ''}`;
  // Un parámetro de archivo (la faceta ref de la base file): el aparato elige el archivo; su referencia y su formato los
  // pone la app en los campos, y el desplegable del campo ofrece los ya elegidos (contrato.opciones con opcionesDelAparato).
  const archivos = (e.archivos ?? []).map((c) => `<button type="button" class="bandeja-archivo" data-nodo="control" data-bandeja-archivo="${escapar(c.nombre)}" title="${escapar(t('bandejaElegirArchivoTitulo', { campo: c.etiqueta ?? c.nombre }))}">${escapar(t('bandejaElegirArchivo'))}</button>`).join('');
  return `<div class="bandeja-pie" data-bandeja-pie>${archivos ? `<div class="bandeja-archivos">${archivos}</div>` : ''}${htmlEstadoDeLaEntrada(e)}<div class="bandeja-botones">${botones}</div></div>`;
}

/**
 * Pone al día lo de la bandeja que hay en pantalla sin repintar la carta (A33, VG: «un formulario a medio rellenar ya es
 * un borrador» y lo compuesto se ve donde se compuso): mientras se escribe en un formulario no se repinta todo (se perdería
 * el foco), así que aquí se cambian solo la tira o la marca tras cada cabecera de acciones, la marca de pendiente de cada
 * ficha, la bandeja del 4 y la cuenta del marco. `raiz`: el contenedor de la carta (querySelector, querySelectorAll).
 */
export function ponerAlDiaEnPantalla(raiz, v) {
  if (!raiz?.querySelectorAll) return;
  for (const cabecera of raiz.querySelectorAll('.pv-acciones[data-pv-acciones]')) {
    const X = cabecera.dataset.x;
    const pv = Number(cabecera.dataset.pvAcciones);
    while (cabecera.nextElementSibling?.matches?.('.bandeja-tira, .bandeja-marca')) cabecera.nextElementSibling.remove();
    if (cabecera.classList.contains('marca')) {
      // Comprimida (una fila cerrada): la marca va dentro de la cabecera, en su misma línea.
      for (const vieja of cabecera.querySelectorAll('.bandeja-marca')) vieja.remove();
      const marca = htmlMarcaDeLaBandeja(v, X, pv);
      if (marca) cabecera.insertAdjacentHTML('beforeend', marca);
    } else {
      const tira = htmlTiraDeLaBandeja(v, X, pv);
      if (tira) cabecera.insertAdjacentHTML('afterend', tira);
    }
    for (const boton of cabecera.querySelectorAll('[data-lanzar]')) boton.classList.toggle('pendiente', tienePendiente(v, X, boton.dataset.lanzar));
  }
  for (const cuatro of raiz.querySelectorAll('[data-bandeja-cuatro]')) {
    const nuevo = htmlBandejaDelCuatro(v, cuatro.dataset.x);
    if (nuevo) cuatro.outerHTML = nuevo;
    else cuatro.remove();
  }
  raiz.querySelector('[data-bandeja-ir]')?.remove();
  const cuenta = htmlCuentaDeLaBandeja(v);
  if (cuenta) raiz.querySelector('.carta')?.insertAdjacentHTML('afterbegin', cuenta);
}
