// El pintado de la carta: convierte el árbol de carta/carta.js en HTML. Aquí no se decide nada: cada nodo trae ya
// su etiqueta, su tamaño, su representación, sus ocupantes, su pieza, y todo texto que viene de la época llega ya en
// el idioma de quien mira (contrato.texto, contrato.legible). Solo se escribe el marcado con los atributos data-*
// que carta/gestos.js lee; los textos propios de la interfaz (botones, títulos) salen de carta/textos.js. Sobrio por
// defecto: formas y texto; en animado, las piezas con recurso van como <img> (svg, imagen) o como un contenedor
// Lottie que trasPintar() rellena con lottie-web si está cargado. El arte animado tiene dos sitios (VG 14-11, #94): el
// fondo del mundo detrás de todo y, a pantalla completa, el marco alrededor del bloque de campos (htmlEscena); nunca
// más de N animaciones a la vez (data-animaciones, un dato de la configuración), primero lo nuevo y lo enfocado; las
// que salen de pantalla se pausan.

import { NIVEL, LATERALES, ANIMAR, GEOMETRIA } from './carta.js';
import { t, PREFIJO_DE_LA_CARTA } from './textos.js';
import { cssSeguro } from '../src/contrato.js';

export const escapar = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const corto = (id) => String(id ?? '').slice(0, 8);
const attr = (s) => escapar(s).replace(/'/g, '&#39;');

/**
 * El modo «retocar textos» (A20 escalón 1, docs/notas/RETOQUES.md): con él encendido (el árbol trae `retocar`: { idioma },
 * solo para quien puede retocar en este libro), cada texto cuya clave se sabe (`k`: { clave, idioma }, de contrato.conClaves)
 * va en un <span class="retocable" data-retocar="<clave>" data-retocar-idioma="<idioma>"> (un subrayado de puntos):
 * tocarlo abre su retoque y no hace lo suyo (gestos.js). Apagado, el texto escapado y nada más: el mismo HTML de siempre.
 * El texto es un dato: siempre escapado.
 */
let retocando = null;
const retocable = (texto, k, modo = retocando) => (modo && k?.clave
  ? `<span class="retocable" data-retocar="${attr(k.clave)}" data-retocar-idioma="${attr(k.idioma ?? modo.idioma ?? '')}">${escapar(texto)}</span>`
  : escapar(texto));
/** Un texto propio de la carta (t), retocable por su clave «carta <clave>» en el idioma de quien mira. */
const tr = (clave, partes, modo = retocando) => retocable(t(clave, partes), modo ? { clave: PREFIJO_DE_LA_CARTA + clave, idioma: modo.idioma } : null, modo);

/**
 * Los atributos de clasificación de un elemento (para el botón «opinar», carta/opinar.js clasificar): data-nodo es el
 * tipo (carta, sitio, control, foco, pv, ocupante, campo, aro, hueco, accion, camino, paso, roseton, diario,
 * formulario, configuracion, copia) y data-nodo-* lo que lo sitúa y aún no dicen los data-* de la carta (data-x,
 * data-pv, data-centro, data-roseton): x0 (el texto del 0 del registro), d (la posición de un campo), tam (oculto,
 * comprimido, tarjeta, bloque o foco), rep (la representación elegida), cara, modo, ancho, alto. Solo se escriben
 * los que hay.
 */
const NOMBRE_NIVEL = Object.freeze(Object.fromEntries(Object.entries(NIVEL).map(([k, v]) => [v, k])));
const repDe = (r) => (r ? `${r.recurso ? 'imagen' : 'texto'}${r.formato ? ':' + r.formato : ''}${r.tamano !== undefined ? '@' + r.tamano : ''}` : 'ninguna');
const nodo = (tipo, campos = {}) => ` data-nodo="${tipo}"` + Object.entries(campos).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => ` data-nodo-${k}="${attr(v)}"`).join('');

/** Quién convierte un adjunto «archivo:<sha256>» en su URL (#22, #25): lo instala la app (resolverArchivos); sin él, null. */
let resolverDeArchivos = null;
/** La app instala aquí cómo se sirve un adjunto por su hash (la función `archivos` con la clave del eje que tiene en local). */
export function resolverArchivos(fn) {
  resolverDeArchivos = typeof fn === 'function' ? fn : null;
}
const RE_ARCHIVO = /^archivo:[0-9a-f]{64}$/;
/** Un SVG del arte saneado y servido como data: (modelos.svgComoDatos). Del eje nunca llega un data: (modelos.recursoAdmitido). */
const RE_SVG_DATOS = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/;
/**
 * La dirección con que se pide el recurso de una pieza: una URL http(s) tal cual (las del eje ya pasaron la lista blanca
 * de la época, modelos.recursoAdmitido), un adjunto «archivo:<sha256>» por el resolutor de la app (sin él, null: no se
 * pinta), un SVG del arte ya saneado como data: (SEG-15) y una ruta del repositorio relativa a la página.
 * Un adjunto SVG lo da el resolutor como data:image/svg+xml;base64 (carta/archivos.js, SEG-15: un blob sería del mismo
 * origen que la carta): ese data: solo vale con `imagen` (lo que se pone como src de un <img>, donde un SVG no ejecuta
 * nada); para todo lo demás (un Lottie, un fondo CSS, un marco) y cualquier otro data:, null.
 */
export function srcDeRecurso(recurso, { imagen = false } = {}) {
  if (typeof recurso !== 'string' || !recurso) return null;
  if (RE_ARCHIVO.test(recurso)) {
    const url = resolverDeArchivos?.(recurso.slice('archivo:'.length));
    if (typeof url !== 'string') return null;
    if (/^(https?:|blob:)/.test(url)) return url;
    return imagen && RE_SVG_DATOS.test(url) ? url : null;
  }
  if (/^https?:\/\//.test(recurso)) return recurso;
  if (RE_SVG_DATOS.test(recurso)) return recurso; // un SVG del arte, ya saneado (modelos.svgComoDatos, SEG-15): en <img>, nunca en línea
  return './' + recurso;
}

/**
 * La pieza de un modelo como HTML: en sobrio una forma (una clase), en animado un <img> o un hueco Lottie fijado en
 * su fotograma. `animar`: no (parada en su fotograma), bucle, o una vez (ANIMAR; true vale por bucle); `prioridad`
 * ordena quién se reproduce cuando hay más de las que caben (0 lo nuevo, 1 lo enfocado, 2 el resto); `clase`, el
 * papel de la pieza (fondo, marco, personaje, dibujo de un subelemento); `oculta`, que al acabar oculte la pieza real
 * a la que se superpone.
 */
export function htmlPieza(pieza, { paso, animar = false, alt = '', clase = '', prioridad = 2, oculta = false } = {}) {
  if (!pieza) return '';
  const clases = ['pieza', ...(clase ? [clase] : [])];
  if (pieza.recurso && pieza.formato) {
    // Un Lottie no va en <img>: su recurso se baja como JSON (trasPintar); solo la imagen admite un adjunto SVG en data:.
    const src = srcDeRecurso(pieza.recurso, { imagen: !(pieza.animado || pieza.bucle) });
    if (!src) return ''; // un adjunto sin resolutor (o sin red): no se pinta
    const fotogramas = pieza.fotogramas ?? 0;
    const k = paso && typeof paso.k === 'number' && paso.de ? Math.min(paso.k, paso.de) : 0;
    const de = paso && paso.de ? paso.de : 10;
    const fotograma = fotogramas ? Math.round((k * fotogramas) / de) : 0;
    if (pieza.animado || pieza.bucle) {
      const modo = animar === true ? ANIMAR.bucle : animar || ANIMAR.no;
      const bucle = modo === ANIMAR.una ? 0 : modo === ANIMAR.bucle ? 1 : pieza.bucle ? 1 : 0;
      return `<div class="${clases.concat('pieza-lottie').join(' ')}" data-lottie="${attr(pieza.recurso)}" data-fotograma="${fotograma}" data-animar="${modo === ANIMAR.no ? 0 : 1}" data-bucle="${bucle}" data-prioridad="${prioridad}"${oculta ? ' data-oculta="1"' : ''} role="img" aria-label="${attr(alt || pieza.tipo)}"></div>`;
    }
    return `<img class="${clases.concat('pieza-imagen').join(' ')}" src="${attr(src)}" alt="${attr(alt || pieza.tipo)}" loading="lazy" decoding="async">`;
  }
  return `<span class="${clases.concat('forma', 'forma-' + attr(pieza.forma ?? 'texto')).join(' ')}" aria-hidden="true"></span>`;
}

// ---------- El arte en sus dos sitios: el fondo y el marco (VG 14-11, #94) ----------
// «El arte animado tiene DOS sitios y nada más.» El FONDO del mundo, detrás de todo (una capa absoluta). El MARCO, a
// pantalla completa: la escena (.arte-escena) envuelve el bloque de campos del sobrio, intacto (su contenido y su orden), y el
// dibujo lo rodea por sus huecos declarados (arte/general/marco-fondo.json): el bloque en el suyo, el personaje en el
// suyo y los subelementos en los suyos, cada uno con su rótulo debajo. El dibujo de un marco fijo se recorta por el
// bloque y por los rótulos (clip-path) y el de uno estirable es solo un borde: ningún trazo queda bajo un texto. Todo
// nodo de arte lleva la clase `capa`; dónde va cada uno lo calcula estilo.css con los números del dibujo (carta.colocarEscena).

/** Una pieza como capa: la de htmlPieza con la clase `capa` y la de su papel. */
const capaPieza = (pieza, { clase = '', ...op } = {}) => (pieza?.recurso ? htmlPieza(pieza, { alt: '', ...op, clase: 'capa ' + clase }) : '');

/** El fondo del mundo: detrás de todo, cubriendo la superficie (una escena) o contenido en ella (una figura). */
const htmlFondo = (f) => capaPieza(f, { clase: `pieza-fondo capa-fondo ajuste-${attr(f?.ajuste ?? 'cubrir')}` });

/** Un número de un dibujo para un estilo: finito (redondeado a milésimas) o 0. */
const num = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0);
/** Un rectángulo del lienzo como variables CSS (las coordenadas del dibujo; estilo.css las lleva a % del lienzo). */
const varsDe = (r) => `--x:${num(r.x)};--y:${num(r.y)};--an:${num(r.ancho)};--al:${num(r.alto)}`;
/** La banda del rótulo de un subelemento, debajo de su hueco. */
const bandaDe = (h, alto) => ({ x: h.x, y: h.y + h.alto, ancho: h.ancho, alto });

/**
 * El recorte del dibujo de un marco fijo: el lienzo entero menos el hueco del bloque y las bandas de los rótulos, como un
 * solo polígono (evenodd, en % del lienzo; cada agujero se recorre desde la esquina y se vuelve a ella).
 */
function recorteDelMarco(lienzo, agujeros) {
  const p = (x, y) => `${num((x / lienzo.ancho) * 100)}% ${num((y / lienzo.alto) * 100)}%`;
  const agujero = (r) => [p(r.x, r.y), p(r.x + r.ancho, r.y), p(r.x + r.ancho, r.y + r.alto), p(r.x, r.y + r.alto), p(r.x, r.y), '0% 0%'];
  return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${agujeros.flatMap(agujero).join(', ')})`;
}

/** El personaje del mundo en su hueco del marco; detrás, su dibujo quieto por si Lottie no carga; pulsarlo abre su sitio (#38). */
function htmlPersonajeDelMarco(p) {
  if (!p?.pieza?.recurso) return '';
  const quieto = p.pieza.animado && p.respaldo?.recurso ? htmlPieza(p.respaldo, { clase: 'respaldo', alt: p.rol ?? '' }) : '';
  const vivo = htmlPieza(p.pieza, { animar: p.animar, clase: 'pieza-personaje accion-' + attr(p.accion), prioridad: p.animar === ANIMAR.una ? 0 : 1, alt: p.rol ?? p.accion });
  const sitio = p.sitio?.X ? ` data-sitio="${attr(p.sitio.lugar)}" data-sitio-x="${attr(p.sitio.X)}" title="${attr(t('sitioTitulo', { lugar: p.sitio.lugar }))}"` : '';
  return `<div class="capa capa-personaje" style="${varsDe(p.hueco)}"${sitio}>${quieto}${vivo}</div>`;
}

/**
 * La escena de un elemento a pantalla completa: el marco alrededor de su `bloque` (el HTML del sobrio). Sin marco, el
 * bloque tal cual. Uno estirable, un borde (sus esquinas fijas, sus bordes lisos alargados) con el bloque dentro; uno
 * fijo, el dibujo entero en su lienzo con el bloque en su hueco, el personaje en el suyo y cada subelemento en el suyo,
 * con su dibujo y su rótulo (el «+n» de los que no caben, en el rótulo del último).
 */
function htmlEscena(e, bloque) {
  const m = e?.marco;
  const src = m ? srcDeRecurso(m.recurso) : null;
  if (!src) return bloque;
  const { ancho: lw, alto: lh } = m.lienzo;
  const b = m.bloque;
  const vars = `--lw:${num(lw)};--lh:${num(lh)};--bx:${num(b.x)};--by:${num(b.y)};--bw:${num(b.ancho)};--bh:${num(b.alto)}`;
  if (m.ajuste === 'estirable') {
    const cortes = `--ct:${num(b.y)};--cr:${num(lw - b.x - b.ancho)};--cb:${num(lh - b.y - b.alto)};--cl:${num(b.x)};--s:${num(m.escala)}`;
    // la fuente del borde va en el estilo del propio nodo: una url() relativa se resuelve contra la página, no contra estilo.css
    return `<div class="arte-escena" data-ajuste="estirable" data-dibujo="${attr(m.dibujo)}" style="${vars};${cortes}"><div class="capa capa-marco" aria-hidden="true" style="border-image-source:url('${attr(src)}')"></div><div class="arte-bloque">${bloque}</div></div>`;
  }
  const subs = m.subelementos ?? [];
  const rotulos = subs.map((s) => ({ s, banda: bandaDe(s.hueco, m.rotulo) }));
  const recorte = recorteDelMarco(m.lienzo, [b, ...rotulos.map((r) => r.banda)]);
  const dibujo = `<img class="capa capa-marco pieza-imagen" src="${attr(src)}" alt="" decoding="async" style="clip-path:${recorte}">`;
  const huecos = subs.map((s) => `<div class="capa capa-sub" data-orden="${s.orden}"${s.pv !== null && s.pv !== undefined ? ` data-pv="${s.pv}"` : ''} style="${varsDe(s.hueco)}" aria-hidden="true">${s.dibujo?.recurso ? htmlPieza(s.dibujo, { clase: 'sub-dibujo', alt: '' }) : ''}</div>`).join('');
  const textos = rotulos.map(({ s, banda }) => {
    const texto = s.mas ? '+' + s.mas : s.rotulo ?? '';
    return `<span class="capa capa-rotulo${s.mas ? ' rotulo-mas' : ''}" data-orden="${s.orden}" style="${varsDe(banda)}" title="${attr(texto)}">${escapar(texto)}</span>`;
  }).join('');
  return `<div class="arte-escena" data-ajuste="fijo" data-dibujo="${attr(m.dibujo)}" style="${vars}"><div class="arte-lienzo">${dibujo}${htmlPersonajeDelMarco(m.personaje)}${huecos}${textos}<div class="arte-bloque">${bloque}</div></div></div>`;
}

/**
 * Lo que la app sabe de los archivos adjuntos de esta pestaña (extra.archivo: id → { estado, texto?, url?, motivo? },
 * carta/archivos.js); html() lo fija en cada pintado. Sin él, un archivo se pinta como «no disponible».
 */
let archivoDe = () => null;

/**
 * La política que lleva delante el HTML aislado (además del sandbox): nada se pide fuera (sin red, sin referer), solo
 * lo incrustado (data:) y los estilos propios. Va tras el doctype, si lo hay, para no cambiar el modo del documento.
 */
const POLITICA_AISLADA = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; media-src data:">`;
const conPolitica = (html) => {
  const m = /^\uFEFF?\s*<!doctype[^>]*>/i.exec(html);
  return m ? m[0] + POLITICA_AISLADA + html.slice(m[0].length) : POLITICA_AISLADA + html;
};

/**
 * Una representación que se pinta aislada (rep.aislada: el HTML adjunto, issue #21, SEG-14): SOLO dentro de un
 * <iframe sandbox=""> (sin allow-scripts ni allow-same-origin: no ejecuta nada, origen opaco, sin formularios ni
 * ventanas), sin referer, con su contenido en srcdoc escapado como atributo y la política de arriba; la carta no lo lee
 * ni lo cambia. Mientras llega, o si no está (o pasa del tope), un hueco con su estado.
 */
function htmlAislada(rep, clase, nombre = null) {
  const a = rep.archivo ? archivoDe(rep.archivo) : null;
  if (typeof a?.texto === 'string') {
    return `<iframe class="${clase} rep-aislada" sandbox="" referrerpolicy="no-referrer" title="${attr(t('archivoTitulo', { que: nombre ?? rep.texto ?? '' }))}" data-archivo="${attr(rep.archivo)}" srcdoc="${attr(conPolitica(a.texto))}"></iframe>`;
  }
  const estado = a?.estado === 'cargando' ? t('archivoCargando') : a?.motivo ?? t('archivoNoDisponible');
  return `<span class="${clase} rep-aislada rep-pendiente" data-archivo="${attr(rep.archivo ?? '')}" role="status">${escapar(estado)}</span>`;
}

/**
 * La cara con sus zonas (DISENO_ZONAS_GUIA §4; contrato.zonas): el dibujo de siempre (el html en su <iframe sandbox>, la
 * pieza o el texto) y, encima, una capa de la carta que lo cubre entero, con un botón por zona. El botón es de la carta
 * (su borde y su letra): su texto es la etiqueta de quien escribió la zona, escapada; su caja va en milésimas de la cara
 * como variables CSS (enteros de 0 a 1000, pasados por cssSeguro). Tocarlo solo navega (app.js zona): nunca firma,
 * escribe, lanza ni pide nada a la red.
 */
function htmlCaraConZonas(cara, c) {
  const entero = (n) => Math.max(0, Math.min(1000, Math.trunc(Number(n)) || 0));
  const botones = c.zonas.map((z) => {
    const [x = 0, y = 0, ancho = 0, alto = 0] = (Array.isArray(z.caja) ? z.caja : []).map(entero);
    const estilo = cssSeguro(`--zx:${x};--zy:${y};--zan:${ancho};--zal:${alto}`);
    return `<button type="button" class="zona"${nodo('control')} data-zona="${attr(z.id)}" data-x="${attr(c.X)}" style="${attr(estilo)}" title="${attr(t('zonaTitulo', { que: z.etiqueta }))}">${escapar(z.etiqueta)}</button>`;
  }).join('');
  return `<span class="cara-con-zonas">${cara}<span class="zonas-capa" role="group" aria-label="${attr(t('zonasDeLaCara'))}">${botones}</span></span>`;
}

/**
 * La ficha de detalle de un registro (contrato.notaDeDetalle, §12.9; la escribe el volcado): en qué se basa, sus pasos
 * (qué hace, el comando con «Copiar», la ruta y qué se verá), el detalle, a quién preguntar, de qué depende (solo texto)
 * y, al pie, quién la escribió. Todo como texto escapado, nunca HTML de la nota. Una línea que traía caracteres que
 * engañan sale sin ellos y marcada; un comando así no se ofrece para copiar. «Copiar» copia lo que se ve (app.js copiar).
 */
export function htmlFicha(f) {
  if (!f) return '';
  const marcadas = new Set(f.enganosas ?? []);
  const sinCopiar = new Set(f.sinCopiar ?? []);
  const marca = (sitio) => (marcadas.has(sitio) ? ` <small class="ficha-enganosa" title="${attr(t('fichaEnganosaTitulo'))}">${t('fichaEnganosa')}</small>` : '');
  const base = f.base ? `<section class="ficha-base"><h4>${t('fichaBase')}</h4><p>${escapar(f.base)}${marca('base')}</p></section>` : '';
  const paso = (p, i) => {
    const n = i + 1;
    const comando = p.comando ? `<div class="ficha-comando-fila"><code class="ficha-comando">${escapar(p.comando)}</code>${sinCopiar.has(n) ? '' : `<button type="button" class="ficha-copiar"${nodo('control')} data-copiar title="${attr(t('fichaCopiarTitulo'))}">${t('fichaCopiar')}</button>`}${marca('paso ' + n + ' comando')}</div>` : '';
    const ruta = p.ruta ? `<div class="ficha-ruta-fila"><code class="ficha-ruta">${escapar(p.ruta)}</code>${marca('paso ' + n + ' ruta')}</div>` : '';
    const ve = p.ve ? `<p class="ficha-ve">${escapar(t('fichaVeras', { que: p.ve }))}${marca('paso ' + n + ' ve')}</p>` : '';
    return `<li class="ficha-paso"><p class="ficha-hace">${escapar(p.hace ?? '')}${marca('paso ' + n)}</p>${comando}${ruta}${ve}</li>`;
  };
  const pasos = f.pasos?.length ? `<section class="ficha-pasos"><h4>${t('fichaPasos')}</h4><ol>${f.pasos.map(paso).join('')}</ol></section>` : '';
  const detalle = f.detalle?.length ? `<section class="ficha-detalle">${f.detalle.map((d, i) => `<p>${escapar(d)}${marca('detalle ' + (i + 1))}</p>`).join('')}</section>` : '';
  const quien = f.quien ? `<p class="ficha-quien">${escapar(t('fichaPregunta', { quien: f.quien }))}${marca('quien')}</p>` : '';
  const depende = f.depende?.length ? `<section class="ficha-depende"><h4>${t('fichaDepende')}</h4><ul>${f.depende.map((d) => `<li><code>${escapar(d.id)}</code> ${escapar(d.texto ?? '')}${marca('depende ' + d.id)}</li>`).join('')}</ul></section>` : '';
  const pie = f.autor ? `<footer class="ficha-pie"><small>${escapar(t('fichaEscrita', { autor: f.autor }))}</small></footer>` : '';
  return `<section class="ficha"${nodo('ficha')} aria-label="${attr(t('fichaTitulo'))}">${base}${pasos}${detalle}${quien}${depende}${pie}</section>`;
}

/** Una representación del 0 como HTML: texto, la imagen que cabe (solo llega con recurso en animado), la de un archivo adjunto (su URL local) o el HTML aislado. */
function htmlRepresentacion(rep, { clase = 'rep', nombre = null } = {}) {
  if (!rep) return `<span class="${clase} rep-vacia">—</span>`;
  if (rep.aislada) return htmlAislada(rep, clase, nombre);
  if (rep.archivo) {
    const url = archivoDe(rep.archivo)?.url;
    return typeof url === 'string' && url.startsWith('blob:')
      ? `<img class="${clase} rep-imagen" src="${attr(url)}" alt="${attr(rep.texto ?? '')}" loading="lazy">`
      : `<span class="${clase} rep-pendiente" data-archivo="${attr(rep.archivo)}">${escapar(rep.texto ?? t('archivoNoDisponible'))}</span>`;
  }
  if (rep.recurso && typeof rep.recurso === 'string') return `<img class="${clase} rep-imagen" src="./${attr(rep.recurso)}" alt="${attr(rep.texto ?? '')}" loading="lazy">`;
  return `<span class="${clase}">${escapar(rep.texto ?? '—')}</span>`;
}

/**
 * Los colores de la época como variables CSS: --pv-N (el hex) y --pv-N-rgb («r g b», para los navegadores sin
 * color-mix, que mezclan con rgb(var(--pv-N-rgb) / alfa)). Nada de hex en las hojas de estilo: salen de epoch.9.5.4.
 */
export function variablesDeColor(colores = {}) {
  const fuera = {};
  for (const [pv, hex] of Object.entries(colores)) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) continue;
    fuera[`--pv-${pv}`] = hex;
    fuera[`--pv-${pv}-rgb`] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(' ');
  }
  return fuera;
}

/**
 * Un ocupante: una hoja, su texto; una referencia, un botón que entra en el registro; una décupla, sus hojas. Igual en
 * sobrio y en animado: el arte no va junto al texto (VG 14-11, #94), sino en el fondo y en el marco.
 */
function htmlOcupante(o) {
  const dentro = o.anidados?.length ? o.anidados.map((g) => `<ul class="ocupantes anidados" data-anidado="${g.pv}">${g.lista.map((x) => `<li>${htmlOcupante(x)}</li>`).join('')}</ul>`).join('') : '';
  return htmlOcupanteSolo(o) + dentro;
}

/**
 * El arte propio de un ocupante (#25), pequeño junto a su texto: una capa más (clase `capa`: quitarla da el sobrio), la misma
 * pieza <img> con data: saneado que va en el hueco del marco. Con marco general, el marco ya lo enseña en su hueco y aquí
 * se esconde (estilo.css); sin él (otro modelo, el pintado «propio», un mundo que solo trae fondo), es el que se ve.
 */
const htmlIconoPropio = (o) => (o.icono ? capaPieza(o.icono, { clase: 'capa-icono' }) : '');

/** El data-id de un ocupante que es un registro con estilo (el de la rejilla): a él se aplica `[data-id="…"]` (htmlEstilos). */
const dataId = (o) => (o?.estilo && o.X ? ` data-id="${attr(o.X)}"` : '');

function htmlOcupanteSolo(o) {
  if (o.tipo === 'referencia' && o.X) {
    const rep = o.representacion?.recurso ? htmlRepresentacion(o.representacion, { clase: 'rep-mini' }) : '';
    return `<button type="button" class="ocupante ocupante-ref"${nodo('ocupante', { x0: o.texto, rep: repDe(o.representacion) })}${o.pv !== null && o.pv !== undefined ? ` data-pv="${o.pv}"` : ''}${dataId(o)} data-abrir="${o.X}" data-x="${o.X}" title="${attr(t('entrarEn', { que: o.texto }))}">${htmlIconoPropio(o)}${rep}<span class="texto">${escapar(o.texto)}</span>${o.autor ? `<small class="quien">${escapar(o.autor)}</small>` : ''}</button>`;
  }
  if (o.tipo === 'decupla') return `<span class="ocupante ocupante-decupla"${nodo('ocupante')}>${o.hojas.map((h) => `<span class="hoja">${escapar(h)}</span>`).join('')}</span>`;
  return `<span class="ocupante ocupante-hoja"${nodo('ocupante')}>${escapar(o.texto)}</span>`;
}

/** En Mapped, sin scroll: la página que se ve de un PV, con «anterior» y «siguiente» (data-pagina, data-delta). */
function htmlPagina(p, pv) {
  if (!p || p.de <= 1) return '';
  const boton = (delta, simbolo, titulo, apagado) => `<button type="button"${nodo('control')} data-pagina="${pv}" data-delta="${delta}" title="${attr(t(titulo))}" aria-label="${attr(t(titulo))}"${apagado ? ' disabled' : ''}>${simbolo}</button>`;
  return `<li class="pagina">${boton(-1, '‹', 'paginaAnterior', p.actual <= 1)}<small>${escapar(t('pagina', p))}</small>${boton(1, '›', 'paginaSiguiente', p.actual >= p.de)}</li>`;
}

/** La medida de una carta, pequeña y en su fila de arriba: el paso propio del PV (el ciclo en el 4) o la madurez. */
const htmlMedida = (m) => (m ? `<span class="medida" title="${attr(m.nombre)} ${attr(m.k)}${m.de ? ' / ' + attr(m.de) : ''}">${escapar(m.nombre)} ${escapar(m.k)}${m.de ? `<small>/${escapar(m.de)}</small>` : ''}</span>` : '');

/** Un elemento de una banda: un ocupante (como siempre) o una entrada del diario (su hora y lo que movió). */
function htmlElementoDeBanda(o) {
  if (o.arriba) return htmlCuenta(o); // el hilo hacia arriba del 6 (#45), con su marca, también sin franja
  if (o.tipo !== 'entrada') return htmlOcupanteSolo(o);
  return `<button type="button" class="ocupante ocupante-ref ocupante-entrada"${nodo('ocupante')} data-pv="${o.pv}" data-abrir="${attr(o.ref)}" data-x="${attr(o.ref)}" title="${attr(o.t)}"><span class="texto">${escapar(o.texto)}</span><small class="quien">${escapar(o.t.replace('T', ' ').replace('Z', ''))}</small></button>`;
}

/** Un ocupante de una celda de la rejilla: si se puede entrar, un clic baja un nivel (data-celda) y un botoncito abre el registro. */
function htmlOcupanteDeCelda(o) {
  if (o.entra) {
    return `<button type="button" class="ocupante ocupante-ref ocupante-celda"${nodo('ocupante', { x0: o.texto })} data-pv="${o.pv}"${dataId(o)} data-celda="${o.X}" data-x="${o.X}" title="${attr(t('entrarEnCelda', { que: o.texto }))}">${htmlIconoPropio(o)}<span class="texto">${escapar(o.texto)}</span>${o.autor ? `<small class="quien">${escapar(o.autor)}</small>` : ''}</button><button type="button" class="celda-abrir"${nodo('control')} data-abrir="${o.X}" data-x="${o.X}" title="${attr(t('abrirEnCelda', { que: o.texto }))}" aria-label="${attr(t('abrirEnCelda', { que: o.texto }))}">↗</button>`;
  }
  return htmlOcupanteSolo(o);
}

/** Una hora del libro en corto: «2026-11-07 13:30». */
const fecha = (s) => String(s ?? '').replace('T', ' ').replace(/(:\d\d)?(\.\d+)?Z$/, '');

/**
 * Un hueco vacío donde se puede crear un elemento (issue #22): la posición `pv` de R. Mantenerlo pulsado abre el aro
 * con un input nuevo (gestos.js, data-hueco-x y data-hueco-pv). En la rejilla, el registro que se divide va en el
 * contenedor (data-hueco-x) y la posición es el dígito de cada hijo (su data-pv); a pantalla completa, el espacio libre
 * del contenedor es el propio mundo (data-hueco-pv).
 */
const htmlHueco = (R, pv) => (R && Number.isInteger(pv) ? ` data-hueco-x="${attr(R)}" data-hueco-pv="${pv}" title="${attr(t('huecoVacioTitulo'))}"` : '');

/** El paso del camino de un hueco vacío (la regla del vacío): «escribir aquí · <acción por defecto de su PV>»; `antes`, lo que va delante («vacía»). */
const htmlEscribir = (e, antes = '') => `<span class="hijo-vacio">${escapar((antes ? antes + ' · ' : '') + (e?.nombre ? t('escribirAquiAccion', { accion: e.nombre }) : t('escribirAqui')))}</span>`;

/** Una fila de la tabla de una esquina de la cruceta: una décupla, una columna por hoja; lo demás, el ocupante en una celda. */
function htmlFilaDeTabla(o) {
  if (o.tipo === 'decupla') return `<tr${nodo('ocupante')}${marcaDerivado(o)}>${o.hojas.map((h) => `<td>${escapar(h)}</td>`).join('')}</tr>`;
  return `<tr${marcaDerivado(o)}><td colspan="10">${htmlOcupanteDeCelda(o)}</td></tr>`;
}

/** Lo derivado del libro en una celda (encargo «lecturas»): solo una clase y el porqué en el title, sin cambiar la forma; con su relación (VG 12-11: directo, heredado o del hilo), otra clase y su texto. */
const RELACION_DERIVADA = Object.freeze({ arriba: 'derivadoArriba', directo: 'derivadoDirecto', heredado: 'derivadoHeredado' });
const marcaDerivado = (o) => (o?.derivado ? ` class="derivado${RELACION_DERIVADA[o.relacion] ? ' ' + o.relacion : ''}" title="${attr([t('derivadoPor', { por: o.por ?? '' }), RELACION_DERIVADA[o.relacion] ? t(RELACION_DERIVADA[o.relacion]) : ''].filter(Boolean).join(' · '))}"` : '');

/** Un mensaje de la conversación: el ocupante con su autor y su hora (como una entrada del diario, ocupante-entrada); si se puede entrar, baja un nivel. */
function htmlMensaje(o) {
  const pie = [o.autor, o.t ? fecha(o.t) : ''].filter(Boolean).join(' · ');
  const estado = o.estado ? `<small class="paquete" data-estado="${attr(o.estado)}">${escapar(t('paquete' + o.estado.charAt(0).toUpperCase() + o.estado.slice(1)))}</small>` : '';
  const quien = (pie ? `<small class="quien">${escapar(pie)}</small>` : '') + estado;
  if (o.tipo === 'referencia' && o.X) {
    const accion = o.entra ? `data-celda="${o.X}" title="${attr(t('entrarEnCelda', { que: o.texto }))}"` : `data-abrir="${o.X}" title="${attr(t('entrarEn', { que: o.texto }))}"`;
    return `<button type="button" class="ocupante ocupante-ref ocupante-entrada mensaje"${nodo('ocupante', { x0: o.texto })} data-pv="${o.pv}"${dataId(o)} ${accion} data-x="${o.X}"><span class="texto">${escapar(o.texto)}</span>${quien}</button>`;
  }
  return `<span class="ocupante ocupante-hoja ocupante-entrada mensaje"${nodo('ocupante')}><span class="texto">${escapar(o.texto)}</span></span>`;
}

/** El nivel siguiente dentro de una columna del 2: por cada ocupante que es un registro, sus hijos (nombre y cuántos; los vacíos, con su paso del camino). */
function htmlSiguiente(s) {
  if (!s?.length) return '';
  const hijo = (h, X) => `<li class="siguiente-hijo${h.vacio ? ' vacia' : ''}" data-color="${h.digito}"${h.vacio ? ' data-vacio' + htmlHueco(X, h.digito) : ''}><span class="numero">${h.digito}</span><span class="siguiente-nombre">${escapar(h.nombre ?? '')}</span>${h.vacio ? htmlEscribir(h.escribir) : `<span class="siguiente-cifra">${escapar(h.total)}</span>`}</li>`;
  return `<div class="siguiente"><h5 class="siguiente-titulo">${t('siguienteNivel')}</h5>${s.map((r) => `<div class="siguiente-de" data-x="${attr(r.X)}"><span class="siguiente-texto">${escapar(r.texto)}</span><ol class="siguiente-hijos">${r.hijos.map((h) => hijo(h, r.X)).join('')}</ol></div>`).join('')}</div>`;
}

/** Lo de dentro de un hijo con ocupantes, según la forma de su mundo: la tabla de la cruceta, la conversación, la lista (con el nivel siguiente en las columnas). */
function cuerpoDeHijo(c, forma) {
  const lista = [...(c.ocupantes ?? (c.ocupante ? [c.ocupante] : [])), ...(c.derivados ?? [])];
  if (!lista.length && Number.isInteger(c.capaDelTres)) return `<span class="hijo-vacio">${escapar(t('capaVacia'))}</span>`; // una capa de la conversación del 3 (encargo pv3): nada que escribir ahí
  if (!lista.length) return c.vacio ? htmlEscribir(c.escribir) : '';
  if (forma === 'cruceta') return `<table class="hijo-tabla"><tbody>${lista.map(htmlFilaDeTabla).join('')}</tbody></table>`;
  if (forma === 'conversacion') return `<ol class="conversacion">${lista.map((o) => `<li${marcaDerivado(o)}>${htmlMensaje(o)}</li>`).join('')}</ol>`;
  return `<ul class="hijo-lista">${lista.map((o) => `<li${marcaDerivado(o)}>${htmlOcupanteDeCelda(o)}</li>`).join('')}</ul>${forma === 'columnas' ? htmlSiguiente(c.siguiente) : ''}`;
}

/**
 * Una celda de la rejilla de un mundo: la de un hijo (su dígito en data-pv, de él el color), con los ganchos del
 * animado: `.hijo-nombre`, `.hijo-cifra` (cuántos tiene) y `.hijo-cuerpo` (lo de dentro, según la forma). Un hijo sin
 * ocupantes lleva data-vacio: el nombre apagado, el paso del camino que lo llenaría y nada que entrar. En la escalera,
 * cada peldaño su escalón (--peldano).
 */
function htmlCeldaDeRejilla(c, forma) {
  if (c.personas) return htmlCajaDelTres(c);
  const lista = [...(c.ocupantes ?? (c.ocupante ? [c.ocupante] : [])), ...(c.derivados ?? [])];
  const peldano = forma === 'escalera' ? ` style="--peldano:${c.fila}"` : '';
  const cifra = c.vacio || c.total === undefined ? '' : escapar(c.total + (c.totalDerivados ?? 0));
  return `<div class="rejilla-celda hijo${lista.length ? '' : ' vacia'}" data-color="${c.pv}" data-pv="${c.pv}" data-fila="${c.fila}" data-columna="${c.columna}"${c.vacio ? ' data-vacio' : ''}${peldano}><header class="hijo-cabeza"><span class="numero">${c.pv}</span><span class="hijo-nombre" title="${attr(c.nombre ?? '')}">${escapar(c.nombre ?? '')}</span><span class="hijo-cifra">${cifra}</span>${htmlInterrogante(c.sitio)}</header><div class="hijo-cuerpo">${cuerpoDeHijo(c, forma)}</div>${htmlMedidaDeHijo(c)}${Number.isInteger(c.bajar) ? `<button type="button" class="bajar"${nodo('control')} data-bajar="${c.bajar}" title="${attr(t('bajarTitulo', { d: c.bajar }))}" aria-label="${attr(t('bajarTitulo', { d: c.bajar }))}">↘</button>` : ''}</div>`;
}

/**
 * El personaje de un sitio (VG, 12-11, issue #38): el interrogante en sobrio y, en animado, el muñeco en el MISMO botón
 * (una capa: quitarla da el sobrio exacto); pulsarlo abre la cruceta del propio nodo X.<lugar> como menú de configuración
 * (data-sitio, data-sitio-x). El del 0 de mi alta (`general`, data-sitio-general) lleva además las opciones de lo que era la barra.
 */
function htmlInterrogante(s, { clase = '' } = {}) {
  if (!s?.X) return '';
  const titulo = attr(s.general ? t('sitioCero') : t('sitioTitulo', { lugar: s.lugar }));
  const muneco = s.personaje?.pieza?.recurso
    ? `<span class="capa capa-sitio" aria-hidden="true">${htmlPieza(s.personaje.pieza, { animar: ANIMAR.no, clase: 'pieza-sitio accion-' + attr(s.personaje.accion), prioridad: 2, alt: s.personaje.rol ?? '' })}</span>`
    : '';
  return `<button type="button" class="sitio-interrogante${clase ? ' ' + clase : ''}"${nodo('control')} data-sitio="${attr(s.lugar)}" data-sitio-x="${attr(s.X)}"${s.general ? ' data-sitio-general' : ''} title="${titulo}" aria-label="${titulo}">?${muneco}</button>`;
}

/**
 * Una persona en una caja del 3 (encargo pv3): su nombre y el marcador pequeño del canal de R (doy: la R mía que tiene;
 * recibo: la suya que tengo yo). Un clic entra en su conversación (data-celda, su alta); mantener abre el aro de su alta;
 * arrastrarla a otra caja la reclasifica (data-persona, data-caja: gestos.js).
 */
function htmlPersona(p) {
  const marca = (clase, n, titulo) => (n > 0 ? `<small class="${clase}" title="${attr(t(titulo, { n }))}">${escapar(n)}</small>` : '');
  const marcador = `<span class="marcador">${marca('doy', p.doy, 'marcadorDoy')}${marca('recibo', p.recibo, 'marcadorRecibo')}</span>`;
  const entrar = p.entra ? ` data-celda="${attr(p.X)}"` : '';
  const titulo = t(p.cae ? 'personaCae' : 'personaTitulo', { que: p.texto });
  return `<button type="button" class="ocupante persona"${nodo('ocupante', { x0: p.texto })} data-persona="${attr(p.identidad)}" data-caja="${p.caja}" data-pv="${p.caja}"${p.X ? ` data-x="${attr(p.X)}"` : ''}${entrar} data-porque="${attr(p.porque ?? '')}" title="${attr(titulo)}"><span class="texto">${escapar(p.texto)}</span>${marcador}</button>`;
}

/**
 * Una caja del 3 por tema (encargo pv3): su número y su grupo, cuántos tiene, el botón que cicla doy / recibo / todos
 * (data-filtro-caja) y el interrogante de su nodo; dentro, sus personas; al pie, sus mínimos y cuántos cayeron al 0. Es
 * donde se suelta a alguien al arrastrarlo (data-caja).
 */
function htmlCajaDelTres(c) {
  const filtro = `<button type="button" class="filtro-caja"${nodo('control')} data-filtro-caja="${c.caja}" data-filtro="${attr(c.filtro)}" title="${attr(t('filtroTitulo'))}">${escapar(t('filtro_' + c.filtro))}</button>`;
  // Una caja vacía dice qué la llena (VG 14-11, #88: la frase de su grupo en la época), no solo «nadie».
  const cuerpo = c.personas.length ? `<ul class="personas">${c.personas.map((p) => `<li>${htmlPersona(p)}</li>`).join('')}</ul>` : `<span class="hijo-vacio">${escapar(c.total ? t('cajaFiltrada') : c.llena ?? t('cajaVacia'))}</span>`;
  const m = c.minimo ?? {};
  const pie = [
    typeof m.cantidad === 'number' ? t('cajaMinimo', { n: m.cantidad }) : '',
    m.rango ? t(c.rangoPendiente ? 'cajaRangoPendiente' : 'cajaRango', { rango: m.rango }) : '',
    c.fuera ? t('cajaFuera', { n: c.fuera }) : '',
  ].filter(Boolean);
  return `<div class="rejilla-celda hijo caja-tres${c.total ? '' : ' vacia'}" data-color="${c.pv}" data-pv="${c.pv}"${c.sitio?.lugar ? ` data-hueco-ruta="${attr(c.sitio.lugar)}" data-hueco-nombre="${attr(c.nombre ?? '')}"` : ''} data-caja="${c.caja}" data-fila="${c.fila}" data-columna="${c.columna}"${c.vacio ? ' data-vacio' : ''}><header class="hijo-cabeza"><span class="numero">${c.pv}</span><span class="hijo-nombre" title="${attr(c.nombre ?? '')}">${escapar(c.nombre ?? '')}</span><span class="hijo-cifra">${c.total ? escapar(c.total) : ''}</span>${filtro}${htmlInterrogante(c.sitio)}</header><div class="hijo-cuerpo">${cuerpo}</div>${pie.length ? `<footer class="hijo-pie"><p class="hijo-minimo">${escapar(pie.join(' · '))}</p></footer>` : ''}</div>`;
}

/**
 * La cruceta del propio nodo de un sitio (encargo pv3, #38): sus diez posiciones en la geometría de la cruz (1-4 las
 * esquinas, 6-9 la cruz, 0 y 5 en el centro), cada una con su nombre, su valor y, si quien mira es el dueño, el botón
 * de la acción que la pone (data-sitio-lanzar, con los parámetros del sitio en data-valores: el formulario del aro).
 */
function htmlSitio(s, arbol = null, extra = {}) {
  if (!s) return '';
  const controles = s.general && arbol ? controlesDelCero(arbol, extra) : {};
  const celdas = new Map();
  for (const p of s.posiciones) {
    const k = p.celda.join(',');
    celdas.set(k, [...(celdas.get(k) ?? []), p]);
  }
  // VG 14-11, #85: la celda enseña el 0 de su nodo (su término) y su valor; tocarla es configurar esa posición (no hay un botón
  // repetido); las opciones propias del 0 de mi alta se muestran con su nombre en su celda (y, con ellas, la celda no es un botón).
  const posicion = (p) => {
    const con = controles[p.posicion];
    const texto = `<span class="nombre">${escapar(p.nombre ?? '')}</span>${p.valor || !con ? `<span class="valor${p.valor ? '' : ' sin-configurar'}">${escapar(p.valor || t('sinConfigurar'))}</span>` : ''}`;
    const tocar = p.accion && !con
      ? `<button type="button" class="sitio-tocar"${nodo('accion')} data-sitio-lanzar="${attr(p.accion.id)}" data-x="${attr(s.X)}" data-valores="${attr(JSON.stringify(p.accion.valores ?? {}))}" title="${attr(t('sitioConfigurarTitulo', { que: p.nombre ?? '', accion: p.accion.etiqueta }))}">${texto}</button>`
      : texto;
    return `<div class="sitio-posicion${p.accion && !con ? ' tocable' : ''}" data-posicion="${p.posicion}" data-color="${p.posicion}"><span class="numero">${p.posicion}</span>${tocar}${con ? `<div class="sitio-controles"${nodo('sitio-controles', { posicion: p.posicion })}>${con}</div>` : ''}</div>`;
  };
  const cuerpo = [...celdas.entries()].map(([k, ps]) => { const [f, c] = k.split(','); return `<li class="sitio-celda" style="--fila:${Number(f) + 1};--columna:${Number(c) + 1}">${ps.map(posicion).join('')}</li>`; }).join('');
  return `<div class="sitio-fondo" data-cerrar><div class="sitio-cruceta"${nodo('sitio', { lugar: s.lugar })} data-x="${attr(s.X)}" data-sitio-de="${attr(s.lugar)}"${s.general ? ' data-sitio-general' : ''} role="dialog" aria-label="${attr(t('sitioDe', { lugar: s.lugar, que: s.texto }))}"><header><h2><span class="sitio-icono" aria-hidden="true">?</span> ${escapar(t(s.general ? 'sitioCeroDe' : 'sitioDe', { lugar: s.lugar, que: s.texto }))}</h2><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>${s.general ? htmlEntradasDelElemento(s.X, extra, { miAlta: s.miAlta, foco: s.foco }) : ''}<ol class="sitio-posiciones">${cuerpo}</ol></div></div>`;
}

/**
 * En la configuración de un elemento (la cruceta de su 0): «Ajustes de este elemento» y, en el génesis del libro con
 * gobierno, «Reglas del libro» (A21; carta/reglas.js). La app dice si el libro tiene gobierno y cuál es su génesis. En la
 * cruceta general (la del 0 de mi alta, #38) la entrada dice que es la de mi alta (`miAlta`) y, si el foco es otro
 * elemento (`foco`: { X, texto }), lleva otra para él que lo nombra: las dos abren la misma vista (data-ajustes-elemento).
 */
function htmlEntradasDelElemento(X, extra = {}, { miAlta = false, foco = null } = {}) {
  const reglas = extra.entradaReglas && extra.genesisId === X ? ` <button type="button"${nodo('control')} data-reglas-abrir title="${attr(t('reglasAbrirTitulo'))}">${escapar(t('reglasAbrir'))}</button>` : '';
  const propia = miAlta
    ? `<button type="button"${nodo('control')} data-ajustes-elemento="${attr(X)}" title="${attr(t('ajustesDeMiAltaTitulo'))}">${escapar(t('ajustesDeMiAlta'))}</button>`
    : `<button type="button"${nodo('control')} data-ajustes-elemento="${attr(X)}" title="${attr(t('ajustesElementoTitulo'))}">${escapar(t('ajustesElemento'))}</button>`;
  const delFoco = foco?.X ? ` <button type="button"${nodo('control')} data-ajustes-elemento="${attr(foco.X)}" data-ajustes-del-foco title="${attr(t('ajustesDelFocoTitulo', { que: foco.texto }))}">${escapar(t('ajustesDelFoco', { que: foco.texto }))}</button>` : '';
  return `<p class="sitio-entradas">${propia}${delFoco}${reglas}</p>`;
}

/** Una fracción entre 0 y 1 con tres decimales, para una variable de CSS (solo un número: nada del dato llega al estilo). */
const fraccionCss = (x) => (Number.isFinite(x) ? Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000 : 0);

/**
 * Lo que el núcleo mide de un hijo, pequeño, debajo de su cuerpo (encargo «datos», issue #11): en el 2, la línea
 * «umbral n · faltan m» (si el criterio del dueño dice esa mirada) y los votos (P comprometido y reposicionable sobre
 * esa mirada), con una barra: hacia el umbral si lo hay; si no, la parte comprometida de los votos. En el 3, el grupo de
 * atención y su precio.
 */
function htmlMedidaDeHijo(c) {
  const partes = [];
  if (c.meta) partes.push(t('hijoUmbral', { umbral: c.meta.umbral, faltan: c.meta.faltan }));
  if (c.votos) partes.push(t('hijoVotos', { comprometidos: c.votos.comprometidos, reposicionables: c.votos.reposicionables }));
  let barra = '';
  if (c.meta && c.meta.umbral > 0) barra = `<span class="hijo-barra" data-de="umbral"${c.meta.pasa ? ' data-pasa' : ''} style="--lleno:${fraccionCss(c.meta.valor / c.meta.umbral)}" title="${attr(t('hijoBarraUmbral', { valor: c.meta.valor, umbral: c.meta.umbral }))}"><span></span></span>`;
  else if (c.votos) barra = `<span class="hijo-barra" data-de="votos" style="--lleno:${fraccionCss(c.votos.comprometidos / (c.votos.comprometidos + c.votos.reposicionables))}" title="${attr(partes[partes.length - 1])}"><span></span></span>`;
  const medida = partes.length ? `<p class="hijo-medida">${escapar(partes.join(' · '))}</p>${barra}` : '';
  const precio = c.precio ? `<p class="hijo-precio" data-zona="${escapar(c.precio.zona)}"><b>${escapar(c.precio.grupo ?? '')}</b> · ${escapar(c.precio.texto ?? '')}</p>` : '';
  const recursos = htmlRecursosDeHijo(c);
  return medida || precio || recursos ? `<footer class="hijo-pie">${medida}${precio}${recursos}</footer>` : '';
}

/** Cuántas series caben en la tabla pequeña del pie de un hijo del 1; las demás, contadas. */
const SERIES_EN_EL_PIE = 4;

/**
 * Lo que el núcleo mide de un hijo del 1 (encargo «datos2», issue #11): el coste («coste EUR 12»), la capacidad con la
 * barra «disponible / capacidad» (y lo comprometido y su franja en el title) y una tabla pequeña de lo que entra y sale
 * por serie (las primeras; las demás, contadas).
 */
function htmlRecursosDeHijo(c) {
  const coste = c.coste ? `<p class="hijo-coste">${escapar(t('hijoCoste', { coste: c.coste.texto }))}</p>` : '';
  let capacidad = '';
  if (c.capacidad) {
    const k = c.capacidad;
    const titulo = t(k.franja ? 'hijoCapacidadFranja' : 'hijoCapacidadTitulo', { disponible: k.disponible, capacidad: k.capacidad, comprometido: k.comprometido, franja: k.franja });
    capacidad = `<p class="hijo-capacidad">${escapar(t('hijoDisponible', { disponible: k.disponible, capacidad: k.capacidad }))}</p><span class="hijo-barra" data-de="capacidad"${k.disponible > 0 ? '' : ' data-agotada'} style="--lleno:${fraccionCss(k.capacidad > 0 ? k.disponible / k.capacidad : 0)}" title="${attr(titulo)}"><span></span></span>`;
  }
  let flujo = '';
  if (c.flujo?.length) {
    const filas = c.flujo.slice(0, SERIES_EN_EL_PIE).map((f) => `<tr><th scope="row" title="${attr(f.texto)}">${escapar(f.texto)}</th><td>${f.entra ? escapar(f.entra) : ''}</td><td>${f.sale ? escapar(f.sale) : ''}</td></tr>`).join('');
    const mas = c.flujo.length > SERIES_EN_EL_PIE ? `<tr class="hijo-flujo-mas"><td colspan="3">${escapar(t('hijoFlujoMas', { n: c.flujo.length - SERIES_EN_EL_PIE }))}</td></tr>` : '';
    flujo = `<table class="hijo-flujo"><thead><tr><th scope="col">${escapar(t('hijoFlujoSerie'))}</th><th scope="col">${escapar(t('hijoFlujoEntra'))}</th><th scope="col">${escapar(t('hijoFlujoSale'))}</th></tr></thead><tbody>${filas}${mas}</tbody></table>`;
  }
  return coste + capacidad + flujo;
}

/** La tarjeta central flotante de la cruceta: cara 0 (nombre, medida y su barra si tiene «de») y cara 5 (plantilla, ancla, pasos); ↻ la gira (data-girar). */
function htmlFlotante(f) {
  if (!f) return '';
  const girar = `<button type="button" class="girar"${nodo('control')} data-girar title="${attr(t('girarTitulo'))}" aria-label="${attr(t('girar'))}">↻</button>`;
  const cabeza = (n) => `<header class="flotante-cabeza"><span class="numero">${f.pv}</span>${n === 0 ? htmlIconoPropio(f) : ''}<span class="etiqueta">${escapar(f.etiqueta ?? '')}</span><small class="cara-n">${escapar(t('cara', { n }))}</small>${girar}</header>`;
  const m = f.medida;
  const lleno = m && typeof m.de === 'number' && m.de > 0 ? Math.min(1, Math.max(0, m.k / m.de)) : null;
  const medida = m ? `<p class="flotante-cifra"><b>${escapar(m.k)}</b>${m.de ? `<small>/${escapar(m.de)}</small>` : ''} <span>${escapar(m.nombre)}</span></p>${lleno !== null ? `<span class="flotante-barra" style="--lleno:${Math.round(lleno * 1000) / 1000}" title="${attr(m.k + ' / ' + m.de)}"><span></span></span>` : ''}` : '';
  const ancla = f.ancla ? `<p class="ancla">${t('sobre')} <button type="button" class="enlace" data-abrir="${attr(f.ancla.sobre ?? '')}"${f.ancla.sobre ? '' : ' disabled'}>${escapar(f.ancla.sobreTexto ?? t('laRaiz'))}</button>${f.ancla.en ? ` · ${t('en')} ${escapar(f.ancla.en)}` : ''}</p>` : '';
  const pasos = f.pasos?.length ? `<ul class="pasos">${f.pasos.map((p) => `<li><b>${escapar(p.nombre)}</b> ${p.k === null || p.k === undefined ? '—' : escapar(p.k)}${p.de ? `<small>/${escapar(p.de)}</small>` : ''}</li>`).join('')}</ul>` : '';
  return `<div class="centro-flotante" data-color="${f.pv}" data-x="${attr(f.X)}"><div class="flotante-giro">`
    + `<section class="flotante-cara cara-0">${cabeza(0)}<p class="flotante-nombre">${escapar(f.texto ?? '')}</p>${medida}</section>`
    + `<section class="flotante-cara cara-5" aria-hidden="true">${cabeza(5)}<p class="tipo">${f.plantilla ? `${t('plantilla')} <b>${escapar(f.plantilla)}</b>` : t('sinPlantilla')}</p>${ancla}${pasos}</section>`
    + `</div></div>`;
}

/** Las ejecuciones que se ven en una celda de la matriz; las demás, contadas («+n»). */
const EJECUCIONES_EN_CELDA = 3;

/** El nombre de una estación de la fábrica (propuesta, autorizada, ejecutada, verificada: «en firme»), en el idioma de la interfaz. */
const textoEstacion = (estado) => t({ verificada: 'estadoVerificada', ejecutada: 'estadoEjecutada', autorizada: 'estadoAutorizada' }[estado] ?? 'estadoPropuesta');

/** El texto de la marca de verificado: «verificado», «verificado · N confirmaciones» si se conoce la profundidad, «en firme» si ya las tiene todas. */
const textoVerificado = (o) => (o.enFirme ? t('enFirme') : o.confirmaciones === 1 ? t('verificadoUnaConfirmacion') : o.confirmaciones > 1 ? t('verificadoConfirmaciones', { n: o.confirmaciones }) : t('verificado'));
const tituloVerificado = (o) => (o.enFirme ? t('enFirmeTitulo', { n: o.confirmaciones, minimas: o.minimas }) : t('verificadoTitulo'));
const htmlVerificado = (o) => `<small class="verificado"${o.enFirme ? ' data-en-firme' : ''}${o.confirmaciones ? ` data-confirmaciones="${attr(o.confirmaciones)}"` : ''} title="${attr(tituloVerificado(o))}">◆ ${escapar(textoVerificado(o))}</small>`;
/** Los textos del estado del pago de un registro (carta.js pagoDelRegistro). */
const TEXTO_PAGO = Object.freeze({ pagado: 'pagado', pendiente: 'pagoPendiente', noVale: 'pagoNoVale' });
/**
 * El pago de un registro en su reverso (encargo «carta: pagos»): «pagado», «pago pendiente de bloque» o «el recibo de pago
 * no vale», y el botón «buscar su recibo de pago» (con «pay url»; no si ya está pagado). '' sin nada que enseñar.
 */
function htmlPago(p, X) {
  if (!p || (!p.estado && !p.buscar)) return '';
  const marca = p.estado ? `<small class="pago" data-pago="${attr(p.estado)}" title="${attr(t(TEXTO_PAGO[p.estado] + 'Titulo'))}">${escapar(t(TEXTO_PAGO[p.estado]))}</small>` : '';
  const boton = p.buscar && p.estado !== 'pagado' ? `<button type="button" class="enlace buscar-pago" data-buscar-pago data-x="${attr(X)}" title="${attr(t('buscarPagoTitulo'))}">${escapar(t('buscarPago'))}</button>` : '';
  return `<p class="verificado-linea pago-linea">${[marca, boton].filter(Boolean).join(' ')}</p>`;
}

/** «pendiente de segundo factor» (VG 12/13-11, #66, #70): movido, pero espera la autorización del titular; su title, el motivo del núcleo si lo hay. */
const htmlPendienteDeSegundoFactor = (o) => `<small class="pendiente-segundo-factor" title="${attr(o?.motivoSegundoFactor || t('pendienteDeSegundoFactorTitulo'))}">${escapar(t('pendienteDeSegundoFactor'))}</small>`;
const marcaVerificado = (o) => (o?.verificado ? htmlVerificado(o) : '') + (o?.pendienteDeSegundoFactor ? htmlPendienteDeSegundoFactor(o) : '');

/** El nombre de un nivel del sello en cascada (un número de la época, VG 16-11) en el idioma de la interfaz: nivel_<n>; si no lo hay, «nivel n». */
const textoCapa = (nivel) => (t('nivel_' + nivel) === 'nivel_' + nivel ? t('nivelSinTexto', { n: nivel }) : t('nivel_' + nivel));
/** El grado de un eslabón (su nombre en la época, VG 17-11: local, shared, provider): grado_<valor> si la carta lo tiene; si no, «grado <valor>». Su red, igual: red_<valor> o «red <valor>». */
const textoGrado = (g) => (t('grado_' + g) === 'grado_' + g ? t('gradoSinTexto', { g }) : t('grado_' + g));
const textoRed = (r) => (t('red_' + r) === 'red_' + r ? t('redSinTexto', { r }) : t('red_' + r));
/** La palabra de resumen de la firmeza: en duda, en firme, o se puede usar sin estar aún en firme. */
const resumenFirmeza = (f) => (f.enDuda ? 'enDuda' : f.firme ? 'firme' : 'usable');
const TEXTO_RESUMEN = Object.freeze({ enDuda: 'firmezaEnDuda', firme: 'firmezaFirme', usable: 'firmezaUsable' });
const TEXTO_ESTADO_CAPA = Object.freeze({ alcanzada: 'capaAlcanzada', pendiente: 'capaPendiente', saltada: 'capaSaltada' });
const TEXTO_ESTADO_PEDIDO = Object.freeze({ 'a tiempo': 'pedidoATiempo', pendiente: 'pedidoPendiente', 'fuera de plazo': 'pedidoFueraDePlazo' });

/**
 * Lo pedido que apunta a un nivel (encargo A18, T el sistema de las anclas): una fila sobria por pedido en su estación, con
 * «pedido», la fecha límite y el estado (a tiempo, pendiente, fuera de plazo) y, si es colgado o el suelo, de quién viene.
 * Todo sale de contrato.firmeza (pedidos); aquí no se decide nada. '' si no hay ninguno.
 */
function htmlPedidosDeNivel(f, nivel) {
  return (f?.pedidos ?? []).filter((p) => p.nivel === nivel).map((p) => {
    const de = p.origen === 'colgado' ? t('pedidoColgado', { por: p.por }) : p.origen === 'suelo' ? t('pedidoSuelo', { clase: textoClase(p.por) }) : '';
    const fila = [t('pedido'), t('pedidoHasta', { fecha: fecha(p.plazo) }), t(TEXTO_ESTADO_PEDIDO[p.estado] ?? p.estado), de].filter(Boolean).join(' · ');
    const titulo = t('pedidoTitulo', { escala: t('escala_' + p.escala), desde: fecha(p.desde) }) + (p.llegada ? ' · ' + t('pedidoLlegada', { fecha: fecha(p.llegada) }) : '');
    return ` <small class="estacion-firmeza-pedido" data-origen="${attr(p.origen)}" data-plazo="${attr(String(p.estado).replace(/ /g, '-'))}" title="${attr(titulo)}">${escapar(fila)}</small>`;
  }).join('');
}

/**
 * Las estaciones de firmeza del reverso (encargo «firmeza», VG 16-11): una por nivel de la época (data-nivel), en su orden,
 * con su ritmo detrás del nombre («nivel 4 · día»), su estado (data-estado: alcanzada, pendiente, saltada), su grado y su red
 * cuando lo alcanza un eslabón («con proveedor · red de pruebas»: los nombres de la época, VG 17-11),
 * la que exige el registro señalada (data-exigida) y, en la última, lo de hoy (las confirmaciones y «en firme» con
 * las del ajuste: htmlVerificado); detrás, la palabra de resumen. Todo sale de contrato.firmeza; aquí no se decide nada.
 * '' sin firmeza.
 */
function htmlFirmeza(f) {
  if (!f?.capas?.length) return '';
  const ultima = f.capas.length - 1;
  const estaciones = f.capas.map((c, k) => {
    const exigida = c.nivel === f.exigida;
    const grado = c.grado !== undefined && c.grado !== null ? textoGrado(c.grado) + (c.red !== undefined && c.red !== null ? ' · ' + textoRed(c.red) : '') : '';
    // El nombre del nivel y, detrás, su ritmo (VG 17-11: «el nivel es el ritmo»): «nivel 4 · día».
    const nombre = textoCapa(c.nivel) + (c.ritmo ? ' · ' + t('escalaUna_' + c.ritmo) : '');
    const titulo = nombre + ': ' + t(TEXTO_ESTADO_CAPA[c.estado] ?? c.estado) + (grado ? ' · ' + grado : '') + (exigida ? ' · ' + t('capaExigida') : '');
    const bitcoin = k === ultima && c.estado === 'alcanzada' && f.confirmaciones ? ' ' + htmlVerificado({ confirmaciones: f.confirmaciones, enFirme: f.enFirme, minimas: f.minimas }) : '';
    return `<li class="estacion-firmeza" data-nivel="${attr(c.nivel)}" data-estado="${attr(c.estado)}"${exigida ? ' data-exigida' : ''} title="${attr(titulo)}"><span class="estacion-firmeza-nombre">${escapar(nombre)}</span>${grado ? ` · <small class="estacion-firmeza-grado">${escapar(grado)}</small>` : ''}${bitcoin}${htmlPedidosDeNivel(f, c.nivel)}</li>`;
  }).join('');
  const r = resumenFirmeza(f);
  return `<div class="firmeza" data-resumen="${r}" aria-label="${attr(t('firmezaTitulo'))}"><ol class="estaciones-firmeza">${estaciones}</ol><small class="firmeza-resumen" title="${attr(t(TEXTO_RESUMEN[r] + 'Titulo', { exigida: f.exigida !== null && f.exigida !== undefined ? textoCapa(f.exigida) : '' }))}">${escapar(t(TEXTO_RESUMEN[r]))}</small></div>`;
}

/** Lo que hace un padre, en palabras: «guarda una copia», «sella» o «guarda y sella». */
const textoHacePadre = (p) => t(p.guarda && p.sella ? 'custodiaGuardaYSella' : p.sella ? 'custodiaSella' : 'custodiaGuarda');
/** La clase del dueño (epoch.7.5): clase_<valor> si la carta lo tiene; si no, el valor tal cual. */
const textoClase = (k) => (t('clase_' + k) === 'clase_' + k ? String(k) : t('clase_' + k));

/** Si un padre puede leerlo en esa rama y, si no lo dice su registro, de dónde sale (encargo «puede leer»): de contrato.custodia. */
const htmlLeePadre = (p) => (typeof p.lee !== 'boolean' ? '' : ` <span class="custodia-lee">${escapar(t(p.lee ? 'custodiaLee' : 'custodiaNoLee'))}</span>${p.leeDe === 'elemento' || p.leeDe === 'epoca' ? ` <small class="custodia-lee-de">${escapar(t(p.leeDe === 'elemento' ? 'custodiaLeeDeElemento' : 'custodiaLeeDeEpoca'))}</small>` : ''}`);

/** Los padres de una rama: cada uno con su nombre, lo que hace, su nivel y su grado si los declara, y si puede leerlo. */
const htmlPadresDeRama = (padres) => `<ul class="custodia-padres">${padres.map((p) => {
  const extra = [p.nivel !== null && p.nivel !== undefined ? textoCapa(p.nivel) : '', p.grado !== null && p.grado !== undefined ? textoGrado(p.grado) : ''].filter(Boolean).join(' · ');
  return `<li class="custodia-padre" data-guarda="${p.guarda ? 1 : 0}" data-sella="${p.sella ? 1 : 0}"${typeof p.lee === 'boolean' ? ` data-lee="${p.lee ? 1 : 0}"` : ''}><b>${escapar(p.nombre)}</b> <span>${escapar(textoHacePadre(p))}</span>${extra ? ` <small>${escapar(extra)}</small>` : ''}${htmlLeePadre(p)}</li>`;
}).join('')}</ul>`;

/**
 * «Quién guarda esto» en el reverso (encargo «padres y copias», A19; en la raíz del libro, «este libro»): cada padre con su
 * nombre, lo que hace y, si los declara, su nivel y su grado, y si puede leerlo (encargo «puede leer», V11: «puede leerlo»
 * o «no puede leerlo» y, si no lo dice su registro, «por defecto aquí» o «por defecto de la época»); «heredado de …» cuando
 * la configuración viene de arriba; si el registro enlaza otros elementos y va a sus padres (V7), una fila por rama, «también
 * lo guardan, por <elemento>: …», con lo que cada padre lee en ESA rama; el plazo por defecto y su clase; sin padres, «sin
 * padres: nadie más lo guarda ni lo sella»; con nodo, que el nodo lo ve en claro. Todo sale de contrato.custodia y
 * contrato.quienGuarda; aquí no se decide nada. En «este libro», con más de una rama, cada padre con las ramas en que guarda,
 * sella y lee (contrato.ramasDelLibro). '' sin custodia. Hermana de htmlFirmeza.
 */
function htmlCustodia(c) {
  if (!c) return '';
  const padres = c.padres?.length ? htmlPadresDeRama(c.padres) : `<p class="custodia-sin">${escapar(t('custodiaSinPadres'))}</p>`;
  const heredado = c.heredado ? `<small class="custodia-heredado">${escapar(t('custodiaHeredado', { de: c.deTexto ?? '' }))}</small>` : '';
  const ramas = (c.enlazadas ?? []).map((r) => `<div class="custodia-rama"><small class="custodia-rama-por">${escapar(t('custodiaTambien', { por: r.porTexto ?? '' }))}</small>${htmlPadresDeRama(r.padres)}</div>`).join('');
  const plazo = c.plazo ? `<small class="custodia-plazo">${escapar(t('custodiaPlazo', { plazo: c.plazoEscala ? t('custodiaUna', { escala: t('escalaUna_' + c.plazoEscala) }) : t('custodiaSegundos', { n: c.plazo.segundos }), clase: textoClase(c.clase) }))}</small>` : '';
  const nodo = c.nodo ? `<small class="custodia-nodo">${escapar(t('custodiaNodo'))}</small>` : '';
  // Una línea por libro privado que cuelga de aquí (encargo «abrir aquí un libro privado»): que existe y quién lo abrió; el id,
  // en corto. Con varios libros (A24, §4.5): «Entrar» en los míos, «no recíproco» si el enlace no lo dicen los dos lados, mis
  // libros aún sin anunciar; en el génesis de un libro pequeño, de qué cuelga y «Volver»; y «abrir aquí un libro privado».
  const privados = (c.privados ?? []).map(htmlLineaPrivado).join('') + htmlCuelgaDe(c.cuelga) + htmlAbrirPrivado(c.abrirPrivado);
  return `<div class="custodia" data-padres="${c.padres?.length ?? 0}"${c.heredado ? ' data-heredado' : ''}><h4>${escapar(t(c.libro ? 'custodiaLibro' : 'custodiaTitulo'))}</h4>${padres}${heredado}${ramas}${plazo}${nodo}${privados}${htmlPorPadre(c.porPadre)}</div>`;
}

// ---------- varios libros (A24; carta/libros.js, agram-equipo/DISENO_CARTA_VARIOS_LIBROS.md §4.3 a §4.5) ----------

/** «Entrar» en uno de mis libros con un foco de llegada (data-libro-entrar: su alta; data-foco: el registro donde se llega). */
const botonEntrar = (alta, foco) => `<button type="button" class="enlace"${nodo('control')} data-libro-entrar="${attr(alta)}" data-foco="${attr(foco ?? '')}" title="${attr(t('libroEntrarTitulo'))}">${escapar(t('libroEntrar'))}</button>`;

/**
 * Una línea de libro privado en «quién guarda esto»: la de siempre (que existe y quién lo abrió, sin enlace) o, si es uno
 * de mis libros, con «Entrar» (si el enlace es recíproco) o con el aviso de que no lo es; un libro mío que aún no se anuncia
 * aquí, su propia línea con «Entrar».
 */
function htmlLineaPrivado(l) {
  if (l.sinAnunciar) return `<small class="custodia-privado" data-mio data-sin-anunciar>${escapar(t('libroMioSinAnunciar', { nombre: l.nombre ?? corto(l.libro) }))} ${botonEntrar(l.entrar, l.libro)}</small>`;
  const linea = escapar(t('custodiaLibroPrivado', { libro: corto(l.libro), quien: l.quien ?? '' }));
  if (l.entrar) return `<small class="custodia-privado" data-mio>${linea} ${botonEntrar(l.entrar, l.libro)}${botonPuente()}</small>`;
  if (l.noReciproco) return `<small class="custodia-privado" data-mio data-no-reciproco>${linea} · ${escapar(t('libroNoReciproco'))}</small>`;
  return `<small class="custodia-privado">${linea}</small>`;
}

/**
 * En el génesis de un libro que cuelga de otro: «este libro cuelga de «elemento», en «libro»», con «Volver» si tengo el
 * grande en este dispositivo; si no consta anunciado en el grande (y es mío), se dice llano y, si se puede, «Anunciarlo en
 * el libro grande» (lleva al elemento del grande y abre el anuncio).
 */
function htmlCuelgaDe(c) {
  if (!c) return '';
  const volver = c.volver ? ` <button type="button" class="enlace"${nodo('control')} data-libro-volver="${attr(c.volver)}" data-foco="${attr(c.elemento)}" title="${attr(t('libroVolverTitulo'))}">${escapar(t('libroVolver'))}</button>` : '';
  const anunciar = c.anunciar ? ` <button type="button" class="enlace"${nodo('control')} data-libro-anunciar="${attr(c.volver)}" data-foco="${attr(c.elemento)}">${escapar(t('libroAnunciar'))}</button>` : '';
  const sinAnunciar = !c.anunciado && c.autor ? `<small class="custodia-cuelga-anuncio">${escapar(t(c.anunciar ? 'libroSinAnunciar' : 'libroSinSellador'))}${anunciar}</small>` : '';
  return `<p class="custodia-cuelga" data-cuelga="${attr(c.libro)}">${escapar(t('libroCuelgaDe', { elemento: c.elementoNombre ?? corto(c.elemento), libro: c.libroNombre ?? corto(c.libro) }))}${volver}${c.volver ? botonPuente() : ''}</p>${sinAnunciar}`;
}

/** «Abrir aquí un libro privado» (§4.4): un gesto sobre el elemento X (data-libro-privado). */
const htmlAbrirPrivado = (X) => (typeof X === 'string' && X
  ? `<p class="custodia-abrir"><button type="button"${nodo('accion')} data-libro-privado="${attr(X)}" title="${attr(t('libroPrivadoTitulo'))}">${escapar(t('libroPrivadoAbrir'))}</button></p>`
  : '');

/**
 * «Tus libros» (§4.3), en la cabecera de la carta: un desplegable con los libros de mi clave (el abierto, marcado), debajo de
 * cada uno los que cuelgan de él con el nombre del elemento, «solo en este dispositivo» en los que no tienen destino de
 * sincronía, aparte «otras personas en este dispositivo», y al final «Abrir otro libro» (la pantalla de arranque). Tocar
 * uno cambia de libro (data-libro). `l`: lo que da libros.tusLibros. Sin ella (un ejemplo), nada.
 */
export function htmlTusLibros(l) {
  if (!l) return '';
  const boton = (f, extra = '') => `<button type="button" data-libro="${attr(f.alta)}"${f.abierto ? ' aria-current="true" disabled' : ''}>${escapar(f.etiqueta)}</button>${extra}${f.soloAqui ? ` <small class="solo-aqui">${escapar(t('libroSoloAqui'))}</small>` : ''}`;
  const cuelgaDe = (elemento) => ` <small class="cuelga-de">${escapar(t('libroCuelgaDeElemento', { elemento }))}</small>`;
  const colgados = (f) => (f.colgados?.length ? `<ul class="tus-libros-colgados">${f.colgados.map((h) => `<li>${boton(h, cuelgaDe(h.elemento))}</li>`).join('')}</ul>` : '');
  const propios = (l.propios ?? []).map((f) => `<li>${boton(f, f.cuelga ? cuelgaDe(f.cuelga.elemento) : '')}${colgados(f)}</li>`).join('');
  const otras = l.otras?.length ? `<p class="tus-libros-otras">${escapar(t('libroOtrasPersonas'))}</p><ul class="tus-libros-lista" data-otras>${l.otras.map((f) => `<li>${boton(f)}</li>`).join('')}</ul>` : '';
  const abierto = [...(l.propios ?? []), ...(l.propios ?? []).flatMap((f) => f.colgados ?? []), ...(l.otras ?? [])].find((f) => f.abierto);
  return `<details class="tus-libros"${nodo('control')} data-tus-libros><summary>${escapar(t('tusLibros'))}${abierto ? ` · <b>${escapar(abierto.etiqueta)}</b>` : ''}</summary>
    <ul class="tus-libros-lista" data-propios>${propios}</ul>${otras}
    <p class="tus-libros-otro"><button type="button" data-libro-otro>${escapar(t('libroAbrirOtro'))}</button></p>
  </details>`;
}

/**
 * El diálogo «Abrir aquí un libro privado» (§4.4). `p`: { X, elemento, nombre, fase: 'pedir' | 'anunciar' | 'hecho', cuelga
 * (el coste de escribir de qué cuelga), anuncio (el del anuncio, con las claves que dio el anfitrión), claves (cuántas),
 * guardian, entrar (el alta del libro creado), libro, anunciado, sinClaves, falta, aviso, motivos, ocupado }. Cada registro,
 * con su coste a la vista antes de confirmar; lo que falte, dicho llano.
 */
export function htmlLibroPrivado(p) {
  if (!p) return '';
  const motivos = p.motivos?.length ? `<ul class="motivos" role="alert">${p.motivos.map((m) => `<li>${escapar(m.mensaje ?? m)}</li>`).join('')}</ul>` : '';
  const aviso = p.aviso ? `<p class="aviso" role="alert">${escapar(p.aviso)}</p>` : '';
  const coste = (c) => (c ? t('reglasCoste', { t: textoDeSegundos(c.exigido), paga: textoDePiezas(c.denominacion) }) : t('libroPrivadoSinCoste'));
  const guardianLinea = p.guardian ? `<p class="ayuda">${escapar(t('libroPrivadoGuardian'))}</p>` : '';
  let cuerpo;
  if (p.fase === 'anunciar') {
    cuerpo = `<p class="exito" role="status">${escapar(t('libroPrivadoCreado', { nombre: p.nombre }))}</p>
      <p data-coste-anuncio>${escapar(t('libroPrivadoAnunciarCoste', { elemento: p.elemento, claves: p.claves, coste: coste(p.anuncio) }))}</p>
      ${guardianLinea}${aviso}${motivos}
      <footer><button type="button" data-libro-privado-anunciar ${p.ocupado ? 'disabled' : ''}>${escapar(t(p.ocupado ? 'libroPrivadoAnunciando' : 'libroPrivadoAnunciarAqui'))}</button> <button type="button" data-cerrar>${escapar(t('libroPrivadoAhoraNo'))}</button></footer>`;
  } else if (p.fase === 'hecho') {
    const falta = p.falta === 'cuelga' ? t('libroPrivadoFaltaCuelga') : p.falta === 'anuncio' ? t('libroPrivadoFaltaAnuncio') : p.sinClaves ? t('libroPrivadoSinClaves') : '';
    cuerpo = `<p class="exito" role="status">${escapar(t(p.anunciado ? 'libroPrivadoAnunciado' : 'libroPrivadoCreado', { nombre: p.nombre, elemento: p.elemento }))}</p>
      ${falta ? `<p class="aviso" data-falta>${escapar(falta)}</p>` : ''}${aviso}${motivos}
      <footer>${p.entrar ? botonEntrar(p.entrar, p.libro) : ''} <button type="button" data-cerrar>${escapar(t('cerrar'))}</button></footer>`;
  } else {
    cuerpo = `<p class="ayuda">${escapar(t('libroPrivadoAyuda', { elemento: p.elemento }))}</p>
      <div class="campo"><label for="libro-privado-nombre">${escapar(t('libroPrivadoNombre'))}</label><input id="libro-privado-nombre" name="nombre" type="text" value="${attr(p.nombre ?? '')}" required autocomplete="off"></div>
      <ol class="libro-privado-pasos">
        <li>${escapar(t('libroPrivadoPaso1'))}</li>
        <li data-coste-cuelga>${escapar(t('libroPrivadoPaso2', { coste: coste(p.cuelga) }))}</li>
        <li>${escapar(t('libroPrivadoPaso3', { elemento: p.elemento }))}</li>
      </ol>
      ${guardianLinea}${aviso}${motivos}
      <footer><button type="submit" ${p.ocupado ? 'disabled' : ''}>${escapar(t(p.ocupado ? 'libroPrivadoCreando' : 'libroPrivadoCrear'))}</button></footer>`;
  }
  return `<div class="formulario-fondo" data-cerrar><form class="formulario libro-privado"${nodo('formulario')} data-libro-privado-form data-x="${attr(p.X)}" data-fase="${attr(p.fase ?? 'pedir')}" aria-label="${attr(t('libroPrivadoAbrir'))}">
    <header><h2>${escapar(t('libroPrivadoAbrir'))}</h2><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    ${cuerpo}
  </form></div>`;
}

/** En «este libro», con más de una rama: cada padre con las ramas en que guarda, sella y lee (contrato.ramasDelLibro, por carta.js). */
const htmlPorPadre = (porPadre) => (porPadre?.length
  ? `<ul class="custodia-libro">${porPadre.map((p) => `<li><b>${escapar(p.nombre)}</b> <span>${escapar([
    p.guarda.length ? t('custodiaGuardaEn', { ramas: p.guarda.join(', ') }) : '',
    p.sella.length ? t('custodiaSellaEn', { ramas: p.sella.join(', ') }) : '',
    p.lee.length ? t('custodiaLeeEn', { ramas: p.lee.join(', ') }) : t('custodiaNoLeeEnNinguna'),
  ].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>`
  : '');

/** Una lista en palabras: «a», «a y b», «a, b y c». */
const enLista = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(', ') + t('quienGuardaY') + xs[xs.length - 1] : xs[0] ?? '');

/**
 * La línea de antes de firmar (encargo «padres y copias», N2: «transparente no es invisible»), junto al botón: quién
 * guardará lo que se escribe, de contrato.quienGuarda. «Lo guardarán: tú, el nodo <nombre> y <n> padres (<nombres>)», o
 * «Solo lo guardas tú, en este dispositivo» sin nodo ni padres. Con padres (encargo «puede leer»), quién puede leerlo: el
 * nodo, si lo hay, y los padres que leen en alguna de sus ramas («Pueden leerlo: el nodo y trabajo.»); si va también a las
 * ramas de lo que enlaza, cuántas son. Los padres son los de todas sus ramas (`todos`), sin repetir. Sin panel ni pasos.
 * '' sin línea.
 */
function htmlQuienGuarda(q) {
  if (!q) return '';
  const padres = q.todos ?? q.padres ?? [];
  const n = padres.length;
  if (!q.nodo && !n) return `<p class="quien-guarda" data-solo>${escapar(t('quienGuardaSolo'))}</p>`;
  const partes = [t('quienGuardaTu')];
  if (q.nodo) partes.push(t('quienGuardaNodo', { nombre: q.nodo }));
  if (n) partes.push(t(n === 1 ? 'quienGuardaUnPadre' : 'quienGuardaPadres', { n, nombres: padres.map((p) => p.nombre).join(', ') }) + (q.enlazadas ? t('quienGuardaRamas', { n: q.enlazadas + (q.de ? 1 : 0) }) : ''));
  let linea = t('quienGuarda', { quienes: enLista(partes) });
  if (n) {
    const leen = [...(q.nodo ? [t('quienGuardaElNodo')] : []), ...padres.filter((p) => p.lee === true).map((p) => p.nombre)];
    linea += t('quienGuardaPuntoLeen', { quienes: leen.length ? enLista(leen) : t('quienGuardaSoloTu') });
  }
  return `<p class="quien-guarda">${escapar(linea)}</p>`;
}

/**
 * Lo de dentro de una celda de la matriz (encargo «datos2», issue #11: la celda es la lista de ejecuciones): cada una
 * con su estación si la tiene (su color y, si está ejecutada, su sello), las primeras y las demás contadas.
 */
function htmlEjecuciones(lista) {
  if (!lista.length) return '';
  const items = lista.slice(0, EJECUCIONES_EN_CELDA).map((o) => `<li class="ejecucion"${o.estado ? ` data-estado="${attr(o.estado)}" title="${attr(textoEstacion(o.estado))}"` : ''}>${htmlOcupanteDeCelda(o)}${o.estado ? `<small class="estacion-nombre">${escapar(textoEstacion(o.estado))}</small>` : ''}${marcaVerificado(o)}</li>`).join('');
  const mas = lista.length > EJECUCIONES_EN_CELDA ? `<li class="ejecucion-mas">${escapar(t('matrizMas', { n: lista.length - EJECUCIONES_EN_CELDA }))}</li>` : '';
  return `<ul class="ejecuciones">${items}${mas}</ul>`;
}

/** La fila aparte de la matriz: lo que el núcleo no sabe colocar (sin tipo de interacción o sin posición), sin inventar celda. */
function htmlSinPosicion(r) {
  if (!r.sinPosicion?.length) return '';
  const items = r.sinPosicion.map((o) => `<li class="ejecucion"${o.estado ? ` data-estado="${attr(o.estado)}"` : ''}>${htmlOcupanteDeCelda(o)}</li>`).join('');
  return `<div class="matriz-sin-posicion" title="${attr(t('matrizSinPosicionTitulo'))}"><span class="matriz-eje">${escapar(t('matrizSinPosicion'))}</span><ul class="ejecuciones en-fila">${items}</ul></div>`;
}

/** La cifra de una celda de la matriz: su estación si todas dicen la misma; si no, cuántas ejecuciones tiene. */
const cifraDeCelda = (c) => (c.estado ? textoEstacion(c.estado) : (c.ocupantes?.length ?? 0) > 1 ? String(c.ocupantes.length) : '');

/** El rótulo de un peldaño de la escalera dulce en su celda de la matriz del 4 (encargo «el4»): «3.2». */
const htmlEscalon = (e) => (e ? `<small class="matriz-escalon" title="${attr(t('matrizEscalonTitulo', { nivel: `${e.nivel}.${e.grado}`, nombre: e.nombre ?? '', direccion: e.direccion ?? '' }))}">${escapar(`${e.nivel}.${e.grado}`)}</small>` : '');

/**
 * La celda abierta de la matriz del 4 (encargo «el4», VG 12-11, #49.8): encima de la matriz, su oficio y su ejecución
 * (y su peldaño si es de la escalera), la lista de sus movimientos hasta diez, cada uno con el color de su estación y su
 * nombre, y cuántos más; ✕ (o pulsar la celda otra vez, o Esc) la cierra.
 */
function htmlCeldaAbierta(a) {
  if (!a) return '';
  const titulo = t('matrizCelda', { oficio: a.oficio ?? a.fila, ejecucion: a.ejecucion ?? a.columna });
  const items = a.lista.map((o) => `<li class="ejecucion"${o.estado ? ` data-estado="${attr(o.estado)}" title="${attr(textoEstacion(o.estado))}"` : ''}>${htmlOcupanteSolo(o)}${o.estado ? `<small class="estacion-nombre">${escapar(textoEstacion(o.estado))}</small>` : ''}${marcaVerificado(o)}</li>`).join('');
  const mas = a.mas ? `<li class="ejecucion-mas">${escapar(t('matrizMas', { n: a.mas }))}</li>` : '';
  return `<section class="matriz-abierta" data-color="${a.columna}" data-fila="${a.fila}" data-columna="${a.columna}" role="dialog" aria-label="${attr(titulo)}"><header class="matriz-abierta-cabeza"><b>${escapar(titulo)}</b>${htmlEscalon(a.escalon)}<button type="button" class="cerrar"${nodo('control')} data-celda-matriz-cerrar title="${attr(t('cerrar'))}" aria-label="${attr(t('cerrar'))}">✕</button></header>${htmlValorDeCelda(a.valor)}<ol class="ejecuciones abiertas">${items}${mas}</ol>${htmlEjecutarEnCelda(a)}</section>`;
}

// ---------- ejecutar desde el 4 (VG 12-11, decisión 7 de #49) ----------

/** Una cantidad de T en segundos, por escalas, como se lee («1 h 11 min»; «0 min» si nada). */
function textoDeSegundos(segundos) {
  const escalas = [['dia', 86400], ['hora', 3600], ['minuto', 60], ['segundo', 1]];
  let resto = Math.max(0, Math.round(Number(segundos) || 0));
  const partes = [];
  for (const [escala, s] of escalas) {
    const n = Math.floor(resto / s);
    if (n > 0) { partes.push(t('tPieza_' + escala, { n })); resto -= n * s; }
  }
  return partes.length ? partes.join(' ') : t('tPieza_minuto', { n: 0 });
}
/** Las piezas de una denominación ([{ escala, cantidad }]) como se leen: «1 h 11 min». */
const textoDePiezas = (piezas) => (piezas?.length ? piezas.map((p) => t('tPieza_' + p.escala, { n: p.cantidad })).join(' ') : t('tPieza_minuto', { n: 0 }));

/** La suma de una celda abierta del 4 (contrato.valorDeCelda): el valor de sus registros crece con sus transacciones. */
function htmlValorDeCelda(v) {
  if (!v) return '';
  return `<p class="celda-valor" data-segundos="${Number(v.segundos) || 0}" title="${attr(t('celdaValorTitulo'))}">${escapar(t('celdaValor', { t: textoDeSegundos(v.segundos), n: v.transacciones }))}</p>`;
}

/** Los estados del botón de ejecutar por el rango (contrato.botonDeEjecutar): la clase, el data-boton y su título. */
function atributosDelBoton(b) {
  const estado = b?.estado ?? 'apagado';
  const rango = b && b.nivel !== null && b.nivel !== undefined ? `${b.nivel}.${b.grado}` : '-';
  return ` class="ejecutar boton-${attr(estado)}" data-boton="${attr(estado)}"${b?.peldano !== null && b?.peldano !== undefined ? ` data-peldano="${b.peldano}"` : ''}${b?.subida ? ` data-subida="${b.subida}"` : ''} title="${attr(t('botonEjecutar_' + estado, { rango }))}"`;
}

/** Lo que se ejecuta desde una celda abierta: las plantillas de su oficio, cada una abre el formulario en modo ejecutar. */
function htmlEjecutarEnCelda(a) {
  if (!a.ejecutar?.length) return '';
  const botones = a.ejecutar.map((x) => `<button type="button"${nodo('control')}${atributosDelBoton(a.boton)} data-lanzar="${attr(x.id)}" data-ejecutar>${escapar(x.nombre)}</button>`).join('');
  return `<div class="celda-ejecutar"><small>${escapar(t('celdaEjecutar'))}</small>${botones}</div>`;
}

/** Lo que pide la escala con que se paga (encargo A18): «con minutos pides el nivel 2 en un minuto», con las palabras de los niveles (nivel_<n>). */
const htmlPideLaEscala = (p) => (p ? `<p class="pide-la-escala" data-nivel="${attr(p.nivel)}"><small>${escapar(t('pideLaEscala', { escala: t('escala_' + p.escala), nivel: textoCapa(p.nivel), plazo: t('plazoEscala_' + p.escala) }))}</small></p>` : '');

/**
 * Ejecutar en el formulario, la cara que ve quien decide (VG 12-11, decisión 7; VG 14-11, #89 y #70): lo exigido en total, la
 * denominación propuesta o la que sale de la escala elegida (el desplegable: las escalas del calendario), una línea por cosa
 * que autoriza («5 min a cartera, que autoriza»), el aviso del segundo factor y los avisos que el núcleo da sin bloquear. El
 * desglose por partes, con el nombre de la regla, va al reverso (htmlEjecucionReverso).
 */
function htmlEjecucion(e) {
  if (!e) return '';
  const opciones = e.escalas.map((x) => `<option value="${attr(x)}"${x === e.escala ? ' selected' : ''}>${escapar(t('escala_' + x))}${x === e.propuesta.desde ? ' ' + escapar(t('escalaPropuesta')) : ''}</option>`).join('');
  const autoriza = e.autorizacion?.length
    ? `<ul class="autoriza">${e.autorizacion.map((x) => `<li data-autoriza="${attr(x.cosa)}">${escapar(t('autorizaLinea', { t: textoDeSegundos(x.segundos), cosa: x.cosaTexto }))}</li>`).join('')}</ul>` : '';
  // El segundo factor (VG 12/13-11, #66, #70): lo que movería alcanza un criterio de quien ejecuta; se avisa antes de ejecutar.
  const segundo = e.segundoFactor ? `<p class="aviso-segundo-factor" role="note">${escapar(t('avisoSegundoFactor', { titulares: e.segundoFactor.titulares.join(', ') }))}</p>` : '';
  const delNucleo = (e.motivos ?? []).map((m) => `<small class="aviso${m.estado === 'PENDIENTE' ? ' desbordado' : ''}" role="note"${m.estado === 'PENDIENTE' ? ' data-desbordado' : ''}>${escapar(m.mensaje)}</small>`).join('');
  const avisos = (e.incompleto ? `<small class="aviso">${escapar(t('exigidoIncompleto'))}</small>` : '') + (e.cubre ? '' : `<small class="aviso">${escapar(t('denominacionNoCubre'))}</small>`) + (e.alcanza ? '' : `<small class="aviso">${escapar(t('denominacionNoAlcanza'))}</small>`)
    // La propuesta sube de escala porque hoy no alcanza la que bastaba (Core State, 17-11): se dice antes de firmar, con lo que se quema de más.
    + (!e.elegida && e.propuesta?.subeDe ? `<small class="aviso" data-sube-de="${attr(e.propuesta.subeDe)}">${escapar(t('denominacionSube', { de: t('escala_' + e.propuesta.subeDe), a: t('escala_' + e.propuesta.desde), paga: textoDePiezas(e.denominacion), exigido: textoDeSegundos(e.coste) }))}</small>` : '');
  return `<section class="ejecucion-t" aria-label="${attr(t('ejecucionTitulo'))}"><h3>${escapar(t('ejecucionTitulo'))}</h3><p class="exigido-total"><b>${escapar(t('exigidoTotal', { t: textoDeSegundos(e.exigido) }))}</b></p>
      <p class="denominacion"><label>${escapar(t(e.elegida ? 'denominacionElegida' : 'denominacionPropuesta'))} <select data-denominacion aria-label="${attr(t('denominacionEscala'))}">${opciones}</select></label> <b class="piezas" data-piezas="${attr(JSON.stringify(e.denominacion))}">${escapar(textoDePiezas(e.denominacion))}</b>${avisos}</p>${htmlPideLaEscala(e.pide)}${autoriza}${segundo}${delNucleo}</section>`;
}

/** Con el botón de ejecutar apagado, una línea arriba dice qué le falta al registro: el rango en que está y el que lo marca (contrato.botonDeEjecutar). */
function htmlBotonApagado(e) {
  const b = e?.boton;
  if (!b || b.estado !== 'apagado' || !b.marca) return '';
  const marca = `${b.marca.nivel}.${b.marca.grado}`;
  const texto = b.nombre ? t('ejecutarApagado', { nombre: b.nombre, rango: `${b.nivel}.${b.grado}`, marca }) : t('ejecutarApagadoSinRango', { marca });
  return `<p class="boton-apagado-motivo" role="status">${escapar(texto)}</p>`;
}

/** Lo exigido en T por partes, con el nombre de la regla y de la plantilla: el reverso del formulario de ejecutar. */
function htmlEjecucionReverso(e) {
  if (!e) return '';
  const [coste, plantilla] = e.partes;
  const autorizacion = e.partes.find((p) => p.parte === 'autorizacion');
  const partes = [`<li data-parte="coste">${escapar(t('exigidoCoste', { n: coste.posiciones, t: textoDeSegundos(coste.segundos) }))} <code>${escapar(coste.regla ?? '')}</code></li>`]
    .concat(autorizacion ? [`<li data-parte="autorizacion">${escapar(t('exigidoAutorizacion', { n: autorizacion.elementos, t: textoDeSegundos(autorizacion.segundos) }))}</li>`] : [])
    .concat(plantilla?.segundos > 0 ? [`<li data-parte="plantilla">${escapar(t('exigidoPlantilla', { t: textoDeSegundos(plantilla.segundos) }))} <code>${escapar(plantilla.plantilla ?? '')}</code></li>`] : [])
    .concat(plantilla?.anunciado > 0 ? [`<li data-parte="anunciado">${escapar(t('exigidoAnunciado', { t: textoDeSegundos(plantilla.anunciado) }))}</li>`] : [])
    .concat([`<li data-parte="total"><b>${escapar(t('exigidoTotal', { t: textoDeSegundos(e.exigido) }))}</b></li>`]);
  return `<h4>${escapar(t('reversoDesglose'))}</h4><ul class="exigido">${partes.join('')}</ul>`;
}

/** La matriz del 4: la esquina, la ejecución arriba (o los diez tipos de interacción), y cada fila con su oficio (o su posición) delante; la diagonal (la escalera) marcada con su peldaño; cada celda con ocupante, una estación con su estado (y su sello si está ejecutada, solo CSS), que se abre al pulsarla; encima, la abierta; debajo, lo que no tiene celda. */
function htmlMatriz(r) {
  const celda = (c) => `<div class="rejilla-celda hijo${c.ocupante ? ' estacion' : ' vacia'}${c.diagonal ? ' diagonal' : ''}${r.abierta && r.abierta.fila === c.fila && r.abierta.columna === c.columna ? ' abierta' : ''}" data-color="${c.pv}" data-pv="${c.pv}" data-fila="${c.fila}" data-columna="${c.columna}"${c.estado ? ` data-estado="${attr(c.estado)}"` : ''}${c.abrir ? ` data-celda-matriz="${attr(c.abrir)}" title="${attr(t('matrizAbrir'))}"` : ''}${c.escalon ? ` data-peldano="${c.escalon.peldano}"` : ''}><span class="hijo-nombre">${htmlEscalon(c.escalon)}</span><span class="hijo-cifra">${escapar(cifraDeCelda(c))}</span><div class="hijo-cuerpo">${htmlEjecuciones(c.ocupantes ?? (c.ocupante ? [c.ocupante] : []))}</div></div>`;
  const ejes = r.ejes ?? { columnas: [], filas: [] };
  const esquina = ejes.oficios ? ['matrizEsquinaOficios', 'matrizEjesTituloOficios'] : ['matrizEsquina', 'matrizEjesTitulo'];
  const cabeza = `<span class="matriz-esquina" title="${attr(t(esquina[1]))}">${escapar(t(esquina[0]))}</span>` + ejes.columnas.map((c) => `<span class="matriz-eje matriz-columna" data-color="${c.pv}" title="${attr(c.pv + ' · ' + (c.etiqueta ?? ''))}"><b>${c.pv}</b> ${escapar(c.etiqueta ?? '')}</span>`).join('');
  // las filas en el orden de los ejes (0 … 9); las columnas de cada una, en el de los ejes (1 … 9 y el 0 al final): las celdas ya vienen en ese orden
  const filas = Array.from({ length: r.filas }, (_, i) => {
    const f = ejes.filas[i];
    return `<span class="matriz-eje matriz-fila" title="${attr(f ? f.digito + ' · ' + (f.nombre ?? '') : '')}">${f ? `<b>${f.digito}</b> ${escapar(f.nombre ?? '')}` : ''}</span>` + r.celdas.filter((c) => c.fila === (f ? f.digito : i)).map(celda).join('');
  }).join('');
  return `<div class="rejilla-celdas rejilla-matriz${ejes.oficios ? ' por-oficios' : ''}" style="--columnas:${r.columnas};--filas:${r.filas}">${cabeza}${filas}</div>${htmlCeldaAbierta(r.abierta)}${htmlSinPosicion(r)}`;
}

/**
 * La matriz del 4 cuando no cabe a lo ancho (Sequenced): las celdas con algo, una debajo de otra, cada una con sus dos
 * ejes (el tipo de interacción y la posición que modifica) y su estado, y lo que no tiene celda aparte; sin nada, el
 * paso del camino que la llenaría.
 */
function htmlMatrizEnColumna(r) {
  const ejes = r.ejes ?? { columnas: [], filas: [] };
  const llenas = r.celdas.filter((c) => c.ocupante);
  if (!llenas.length && !r.sinPosicion?.length) return `<div class="rejilla-celdas rejilla-matriz-columna vacia">${htmlEscribir(r.escribir, t('vacia'))}</div>`;
  const celda = (c) => {
    const col = ejes.columnas.find((k) => k.pv === c.columna);
    const fila = ejes.filas.find((k) => k.digito === c.fila);
    const nombre = [col ? `${col.pv} ${col.etiqueta ?? ''}` : '', fila ? `${fila.digito} ${fila.nombre ?? ''}` : ''].filter(Boolean).join(' · ');
    return `<div class="rejilla-celda hijo estacion${c.diagonal ? ' diagonal' : ''}" data-color="${c.pv}" data-pv="${c.pv}" data-fila="${c.fila}" data-columna="${c.columna}"${c.estado ? ` data-estado="${attr(c.estado)}"` : ''}><header class="hijo-cabeza"><span class="hijo-nombre">${escapar(nombre)}</span><span class="hijo-cifra">${escapar(cifraDeCelda(c))}</span></header><div class="hijo-cuerpo">${htmlEjecuciones(c.ocupantes ?? [c.ocupante])}</div></div>`;
  };
  return `<div class="rejilla-celdas rejilla-matriz-columna" style="--columnas:1;--filas:${Math.max(1, llenas.length)}">${llenas.map(celda).join('')}</div>${htmlSinPosicion(r)}`;
}

/** Una cuenta ensartada en un hilo (un ocupante o una entrada del diario): la bola con el color del hilo, la fecha y el nombre; los dos, también en el title. */
function htmlCuenta(o) {
  const cuando = o.t ? fecha(o.t) : '';
  const destino = o.tipo === 'entrada' ? o.ref : o.X;
  const estado = o.estado ? t(ESTADOS_DE_CUENTA[o.estado.tipo] ?? 'estadoPrevisto', { fecha: o.estado.fecha ? fecha(o.estado.fecha) : '' }) : '';
  const rara = o.rara ? t('cuentaRara') : '';
  const titulo = [o.texto, cuando, estado, rara, o.hiloSupuesto ? t('hiloSupuesto') : '', o.arriba ? t('derivadoArriba') : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="ocupante cuenta${o.hiloSupuesto ? ' supuesta' : ''}${o.rara ? ' cuenta-rara' : ''}${o.arriba ? ' cuenta-arriba' : ''}"${nodo('ocupante', { x0: o.texto })}${o.hilo !== null && o.hilo !== undefined ? ` data-color="${o.hilo}"` : ''}${o.estado ? ` data-estado="${attr(o.estado.tipo)}"` : ''}${dataId(o)}${destino ? ` data-abrir="${attr(destino)}" data-x="${attr(destino)}"` : ''} title="${attr(titulo)}"><span class="cuenta-bola" aria-hidden="true"></span><span class="cuenta-texto">${estado ? `<small class="cuenta-estado">${escapar(estado)}</small> ` : cuando ? `<small>${escapar(cuando)}</small> ` : ''}${escapar(o.texto)}</span></button>`;
}

/** El texto de cada estado del futuro de una cuenta (contrato.estadoDeEntrada), por su nombre. */
const ESTADOS_DE_CUENTA = Object.freeze({ previsto: 'estadoPrevisto', bloqueado: 'estadoBloqueado', liberado: 'estadoLiberado', caduca: 'estadoCaduca', caducado: 'estadoCaducado' });

/**
 * Las franjas del 6 y el 7: una franja vertical por escala (la más cercana a ahora, más ancha) y los hilos horizontales
 * que las atraviesan; en cada cruce, sus cuentas y, si no caben, una cuenta mayor con el número. Franjas, hilos y
 * cruces comparten la misma rejilla (los hilos pasan por encima de las franjas, las cuentas encima de los hilos).
 */
function htmlFranjas(r) {
  const n = r.bandas.length;
  const hilos = r.hilos?.length ? r.hilos : [{ pv: null, etiqueta: '' }];
  const ahora = Math.max(0, r.bandas.findIndex((b) => b.ahora));
  const peso = (i) => (n > 1 ? Math.round((1 + (n - 1 - Math.abs(i - ahora)) / (n - 1)) * 100) / 100 : 1);
  const columnas = `var(--ancho-hilo) ${r.bandas.map((_, i) => `minmax(0,${peso(i)}fr)`).join(' ')}`;
  const cuantas = (b) => b.items.length + (b.mas ?? 0);
  const franjas = r.bandas.map((b, i) => `<div class="rejilla-banda hijo franja-tiempo${b.ahora ? ' ahora' : ''}${cuantas(b) ? '' : ' vacia'}" data-banda="${b.indice}" style="grid-column:${i + 2};grid-row:1 / -1"><header class="hijo-cabeza"><span class="hijo-nombre banda-nombre">${escapar(b.nombre ?? '')}</span><span class="hijo-cifra">${cuantas(b) || ''}</span></header><div class="hijo-cuerpo"></div></div>`).join('');
  const lineas = hilos.map((h, j) => `<div class="hilo" data-hilo="${h.pv ?? ''}"${h.pv !== null ? ` data-color="${h.pv}"` : ''} style="grid-column:1 / -1;grid-row:${j + 2}"><span class="hilo-nombre">${h.pv !== null ? `<b>${h.pv}</b> ` : ''}${escapar(h.etiqueta ?? '')}</span></div>`).join('');
  const cruces = r.bandas.map((b, i) => (b.cruces ?? []).map((c, j) => (c.items.length || c.mas
    ? `<div class="cruce" data-banda="${b.indice}" data-hilo="${c.hilo ?? ''}" style="grid-column:${i + 2};grid-row:${j + 2}">${c.items.map(htmlCuenta).join('')}${c.mas ? `<span class="cuenta cuenta-mayor"${c.hilo !== null ? ` data-color="${c.hilo}"` : ''} title="${attr(t('masEnCruce', { n: c.mas }))}">${c.mas}</span>` : ''}</div>`
    : '')).join('')).join('');
  return `<div class="rejilla-bandas rejilla-franjas" style="--franjas:${n};--hilos:${hilos.length};grid-template-columns:${columnas};grid-template-rows:var(--cabeza-franja) repeat(${hilos.length},minmax(0,1fr))">${franjas}${lineas}${cruces}</div>`;
}

/** Una caja nivel.grado (el cielo del 8 y las posiciones del camino del 9): su rótulo y su nombre arriba; dentro, `cuerpo`. */
const htmlCaja = (b, clase, cuerpo, cifra = '', dibujo = '', atributos = '') => `<div class="rejilla-banda hijo ${clase}" data-banda="${b.indice}" data-nivel="${b.nivel}" data-grado="${b.grado}"${b.direccion ? ` data-direccion="${attr(b.direccion)}"` : ''}${atributos} style="--nivel:${Number(b.nivel) || 0}"><header class="hijo-cabeza"><span class="hijo-nombre"><b class="rotulo">${escapar(b.nivel + '.' + b.grado)}</b> ${escapar(b.nombre ?? '')}</span><span class="hijo-cifra">${cifra}</span></header><div class="hijo-cuerpo">${cuerpo}${dibujo}</div></div>`;

/** Un comparable en el cielo: su estrella (intensidad por el nivel de la caja, borde con el grado 2, halo con el 3: solo CSS) y su nombre. */
function htmlEstrella(o) {
  const destino = o.tipo === 'entrada' ? o.ref : o.X;
  return `<button type="button" class="ocupante estrella${o.foco ? ' foco' : ''}"${nodo('ocupante', { x0: o.texto })}${dataId(o)}${destino ? ` data-abrir="${attr(destino)}" data-x="${attr(destino)}"` : ''}${typeof o.rango === 'number' ? ` data-rango="${o.rango}"` : ''} title="${attr(o.texto)}"><span class="estrella-forma" aria-hidden="true">★</span><span class="texto">${escapar(o.texto)}</span></button>`;
}

/**
 * El cielo del 8: el panel pequeño (el del astrónomo: la cohorte, con su selector si hay más de una, quién escribió la
 * base o «sin base escrita», la cuota del foco y las posiciones que tiene escritas) y las diez cajas en dos filas; la
 * vacía, apagada con su paso del camino. Sin base escrita, el cielo lleva el borde discontinuo (`sin-base`).
 */
function htmlCielo(r) {
  const cajaDe = (k) => r.bandas.find((b) => (b.escala ?? b.indice) === k);
  const partes = [];
  if (r.cohorte) {
    const elegir = r.cohorte.opciones?.length
      ? `<span class="cohortes" role="group" aria-label="${attr(t('cohorte'))}">${r.cohorte.opciones.map((o) => `<button type="button" class="cohorte${o.actual ? ' actual' : ''}"${nodo('control')} data-cohorte="${attr(o.valor)}" aria-pressed="${o.actual ? 'true' : 'false'}" title="${attr(t('cohorteElegir', { cohorte: o.texto }) + (o.valor === r.cohorte.elegida ? ' · ' + t('cohorteDelDueno') : ''))}">${escapar(o.texto)}</button>`).join('')}</span>`
      : `<b class="cohorte actual">${escapar(r.cohorte.texto ?? r.cohorte.valor)}</b>`;
    partes.push(`${escapar(t('cohorte'))} ${elegir}`);
  } else partes.push(escapar(t('sinCohorte')));
  if (r.base) partes.push(`<span class="cielo-base">${escapar(r.base.escrita ? t('baseEscritaPor', { autor: r.base.autor ?? '', cuando: r.base.t ? fecha(r.base.t) : '' }) : t('sinBaseEscrita'))}</span>`);
  if (r.rango) partes.push(`<b class="cielo-rango">${escapar(t('rangoDelFoco', { nivel: `${r.rango.nivel}.${r.rango.grado}`, nombre: r.rango.nombre ?? '' }))}</b>`);
  if (r.cuota) { const c = cajaDe(r.cuota.k); partes.push(escapar(t('cieloCuota', { paso: r.cuota.nombre, k: c ? `${c.nivel}.${c.grado}` : r.cuota.k }))); }
  if (r.enElFoco?.length) partes.push(escapar(t('enElFoco', { posiciones: r.enElFoco.join(' ') })));
  const panel = partes.length ? `<p class="cielo-panel">${partes.join(' · ')}</p>` : '';
  const cajas = r.bandas.map((b) => {
    const llena = b.items.length || b.mas;
    const cuerpo = llena ? b.items.map(htmlEstrella).join('') + (b.mas ? `<span class="estrella estrella-mas" title="${attr(t('masEnBanda', { n: b.mas }))}">${escapar(t('masEnBanda', { n: b.mas }))}</span>` : '') : b.foco ? `<span class="cielo-foco">${escapar(t('cieloFoco'))}</span>` : htmlEscribir(b.escribir, t('vacia'));
    return htmlCaja(b, `caja-cielo${llena || b.foco ? '' : ' vacia'}${b.foco ? ' foco' : ''}`, cuerpo, llena ? b.items.length + b.mas : '', '');
  }).join('');
  return `${panel}<div class="rejilla-bandas rejilla-cielo${r.base && !r.base.escrita ? ' sin-base' : ''}" style="--columnas:${r.columnas};--filas:${r.filas}">${cajas}</div>`;
}

/**
 * El camino del 9: primero las diez posiciones nivel.grado para situarse (sin ocupantes: apagadas, con el paso del
 * camino), con la madurez del foco encima; debajo, a pantalla completa, los pasos del camino y la guía, plegables
 * (los de siempre: htmlCamino y htmlGuia, reorganizados aquí).
 */
function htmlCaminoDeRejilla(r, arbol) {
  // Encargo «el4» (#39): el rango del foco (el del 8) y, en cada posición, si la deja disponible (y cuál es la suya).
  const rango = r.rango ? `<span class="camino-rango">${escapar(t('rangoDelFoco', { nivel: `${r.rango.nivel}.${r.rango.grado}`, nombre: r.rango.nombre ?? '' }))} · ${escapar(t('caminoDisponibles', { n: r.rango.disponibles.length }))}</span>` : '';
  const madurez = r.madurez || rango ? `<p class="camino-madurez">${r.madurez ? escapar(t('madurezDelFoco', r.madurez)) : ''}${r.madurez && rango ? ' · ' : ''}${rango}</p>` : '';
  const marca = (b) => (b.disponible === undefined ? '' : b.actual ? ' disponible actual' : b.disponible ? ' disponible' : ' no-disponible');
  const atributos = (b) => (b.disponible === undefined ? '' : ` data-disponible="${b.disponible ? 'si' : 'no'}"${b.actual ? ` data-actual title="${attr(t('caminoActual'))}"` : ''}`);
  const posiciones = r.bandas.map((b) => htmlCaja(b, `posicion${b.items.length ? '' : ' vacia'}${marca(b)}`, b.items.length ? b.items.map(htmlElementoDeBanda).join('') : b.actual ? `<span class="camino-aqui">${escapar(t('caminoActual'))}</span>` : htmlEscribir(b.escribir), '', '', atributos(b))).join('');
  const mensajes = arbol
    ? `<div class="camino-mensajes"><details class="plegable" open><summary>${escapar(t('caminoPasos', { n: arbol.camino?.pasos?.length ?? 0 }))}</summary>${htmlCamino(arbol.camino, { X: arbol.X })}</details>${arbol.guia ? `<details class="plegable" open><summary>${t('guia')}</summary>${htmlGuia(arbol.guia)}</details>` : ''}</div>`
    : '';
  return `${madurez}<div class="rejilla-bandas rejilla-posiciones" style="--columnas:${r.columnas};--filas:${r.filas}" aria-label="${attr(t('caminoPosiciones'))}">${posiciones}</div>${mensajes}`;
}

/** Una banda de una forma sin pintor propio: su nombre y lo que cae en ella. */
function htmlBandaDeRejilla(b) {
  const nombre = b.nombre ?? String(b.indice);
  const cuerpo = (b.items ?? []).map(htmlElementoDeBanda).join('') + (b.mas ? `<small class="mas-banda">${escapar(t('masEnBanda', { n: b.mas }))}</small>` : '');
  return `<div class="rejilla-banda hijo${b.items?.length ? '' : ' vacia'}" data-banda="${b.indice}"><span class="hijo-nombre banda-nombre">${escapar(nombre)}</span><div class="hijo-cuerpo banda-cuerpo">${cuerpo}</div></div>`;
}

/**
 * La rejilla de un mundo (epoch.8.7) en su forma sobria (VG, mockup del segundo nivel v3): la cruceta con la tarjeta
 * central flotante, la escalera, las columnas con el nivel siguiente dentro, la rejilla 3 × 2, la conversación, la
 * matriz con sus ejes, las franjas con sus hilos, el cielo y el camino. Con niveles de profundidad, la cabecera dice
 * dónde se está y «subir» vuelve un nivel; la matriz pagina («‹ n de m ›»). El contenedor (`.rejilla-completa`,
 * data-forma, posicionado y aislado para que el animado añada capas detrás y alrededor) lleva data-id (el registro que
 * se divide) y cada hijo la clase `hijo`: a ellos se aplican los dos estilos del registro (htmlEstilos); los huecos
 * entre hijos salen de `--hueco`. En un bloque, la misma rejilla sin cabecera, sin tarjeta flotante y sin la guía.
 */
function htmlRejilla(r, { completa = false, arbol = null, apilada = false } = {}) {
  if (!r) return '';
  const cabeza = (completa || apilada) && r.niveles > 1 ? `<div class="rejilla-cabeza"><span class="nivel-rejilla">${escapar(t('rejillaNivel', { nivel: r.nivel, niveles: r.niveles }))}</span>${r.ruta.length ? htmlInterrogante(r.sitio) : ''}${r.persona ? `<span class="ruta-rejilla persona-rejilla">${escapar(t('conversacionCon', { que: r.persona.texto, caja: r.persona.caja, grupo: r.persona.nombre ?? '' }))}</span>${r.persona.agenteDe ? `<span class="ruta-rejilla persona-agente" data-agente-de>${escapar(t('hablasConAgente', { que: r.persona.agenteDe.texto }))}</span>` : ''}` : r.texto ? `<span class="ruta-rejilla">${escapar(r.texto)}</span>` : ''}${r.direccion && r.nivel > 1 ? `<span class="direccion-rejilla">${escapar(r.direccion)}</span>` : ''}${r.ruta.length ? `<button type="button" class="subir"${nodo('control')} data-subir="${r.pv}" title="${attr(t('subirTitulo'))}">↑ ${t('subir')}</button>` : ''}</div>` : '';
  const sin = r.sinBanda?.length ? `<div class="rejilla-sin" title="${attr(t('sinBandaTitulo'))}">${r.sinBanda.map(htmlElementoDeBanda).join('')}</div>` : '';
  let cuerpo;
  if (r.forma === 'franjas' && r.bandas) cuerpo = htmlFranjas(r) + sin;
  else if (r.forma === 'cielo' && r.bandas) cuerpo = htmlCielo(r) + sin;
  else if (r.forma === 'camino' && r.bandas) cuerpo = htmlCaminoDeRejilla(r, completa ? arbol : null);
  else if (r.forma === 'matriz' && r.celdas) cuerpo = apilada && r.enColumna ? htmlMatrizEnColumna(r) : htmlMatriz(r);
  else if (r.bandas) cuerpo = `<div class="rejilla-bandas" style="--filas:${r.bandas.length}">${r.bandas.map(htmlBandaDeRejilla).join('')}</div>${sin}`;
  else if (apilada) cuerpo = `${htmlFlotante(r.flotante)}<div class="rejilla-celdas rejilla-${attr(r.forma ?? '')}" style="--columnas:${r.enColumna ? 1 : r.columnas};--filas:${r.enColumna ? r.celdas.length : r.filas}">${r.celdas.map((c) => htmlCeldaDeRejilla(c, r.forma)).join('')}</div>`; // Sequenced: la tarjeta del elemento pulsado arriba, sin flotar
  else cuerpo = `<div class="rejilla-celdas rejilla-${attr(r.forma ?? '')}" style="--columnas:${r.columnas};--filas:${r.filas}">${r.celdas.map((c) => htmlCeldaDeRejilla(c, r.forma)).join('')}${completa ? htmlFlotante(r.flotante) : ''}</div>`;
  const paginas = r.pagina && r.pagina.de > 1 ? `<ul class="ocupantes rejilla-paginas">${htmlPagina(r.pagina, r.pv)}</ul>` : '';
  // En animado y a pantalla completa, los dos sitios del arte (r.escena, #94): el fondo del mundo debajo de todo y el marco alrededor del bloque (htmlEscena).
  const e = completa ? r.escena : null;
  return `<div class="rejilla${completa ? ' rejilla-completa' : ''}${apilada ? ' rejilla-apilada' : ''}${apilada && r.enColumna ? ' en-columna' : ''}" data-rejilla="${r.pv}" data-forma="${attr(r.forma ?? '')}" data-nivel="${r.nivel}" data-niveles="${r.niveles}" data-columnas="${r.columnas}" data-filas="${r.filas}"${r.estilo && r.X ? ` data-id="${attr(r.X)}"` : ''}${r.vacia ? ' data-vacia' : ''}${r.X ? ` data-hueco-x="${attr(r.X)}"${completa ? ` data-hueco-pv="${r.pv}"` : ''}${r.base?.length ? ` data-hueco-en="${r.base.join('.')}"` : ''}` : ''}>${htmlFondo(e?.fondo)}${cabeza}${htmlEscena(e, cuerpo + paginas)}</div>`;
}

/** La lista o la matriz de ocupantes de un PV, con «cargar más» al final si hay más. */
function htmlOcupantes(oc, { pv, disposicion } = {}) {
  if (!oc) return '';
  const lista = oc.lista.length ? oc.lista.map((o) => `<li>${htmlOcupante(o)}</li>`).join('') : `<li class="nada">${t('nada')}</li>`;
  const mas = oc.cargarMas ? `<li class="cargar-mas"><button type="button"${nodo('control')} data-cargar-mas="${pv}">${escapar(t('cargarMas', { cuantos: oc.total - oc.lista.length }))}</button></li>` : htmlPagina(oc.pagina, pv);
  return `<ul class="ocupantes ${disposicion ? 'disposicion-' + attr(disposicion) : ''}" data-total="${oc.total}">${lista}${mas}</ul>`;
}

/** El diario (lo llegado bajo X), como lista. */
function htmlDiario(d) {
  if (!d) return '';
  const filas = d.entradas.map((e) => `<li><time datetime="${attr(e.t)}">${escapar(e.t.replace('T', ' ').replace('Z', ''))}</time> · <b>${escapar(e.autor)}</b> · <button type="button" class="enlace" data-abrir="${e.id}">${corto(e.id)}</button><small>${escapar(e.movimientos.join(', '))}</small></li>`).join('');
  return `<section class="diario"${nodo('diario')}><h4>${d.total} ${t(d.total === 1 ? 'transaccion' : 'transacciones')}</h4><ol>${filas || `<li class="nada">${t('nada')}</li>`}</ol></section>`;
}

/**
 * Una propuesta importada (carta/externa.js) como paso de la tercera fuente: lo que propone, su «porque», si ahora pasa
 * las reglas y los tres botones (aceptar: lanzarla; modificar: el formulario con los parámetros; rechazar: descartarla).
 * Una que no se entiende sale como inválida, con su motivo y solo «rechazar».
 */
function htmlPropuesta(p) {
  const id = attr(p.propuesta);
  const porque = p.porque ? `<span class="porque"><b>${t('propuestaPorque')}</b> ${escapar(p.porque)}</span>` : '';
  const rechazar = `<button type="button"${nodo('control')} data-propuesta-rechazar="${id}" title="${attr(t('propuestaRechazarTitulo'))}">${t('propuestaRechazar')}</button>`;
  if (p.invalida) {
    return `<li class="paso propuesta invalida"${nodo('paso')} data-propuesta="${id}"><span class="fuente">${escapar(p.fuente)}</span> <b>${t('propuestaInvalida')}</b> <span class="falta">${escapar(p.falta ?? '')}</span> <span class="motivo">${escapar(p.invalida)}</span> ${porque}<span class="propuesta-botones">${rechazar}</span></li>`;
  }
  const noPasa = p.pasa === false && p.motivos?.length ? `<small class="motivos" role="status">${escapar(t('propuestaNoPasa', { motivos: p.motivos.map((m) => m.mensaje).join('; ') }))}</small>` : '';
  return `<li class="paso propuesta mio${p.pasa === false ? ' no-pasa' : ''}"${nodo('paso')} data-propuesta="${id}"><button type="button" class="propuesta-nombre" data-propuesta-modificar="${id}" title="${attr(t('propuestaModificarTitulo'))}">${escapar(p.hacer?.nombre ?? '')}</button> <span class="fuente">${escapar(p.fuente)}</span> ${porque}${noPasa}
    <span class="propuesta-botones"><button type="button"${nodo('control')} data-propuesta-aceptar="${id}" title="${attr(t('propuestaAceptarTitulo'))}">${t('propuestaAceptar')}</button><button type="button"${nodo('control')} data-propuesta-modificar="${id}" title="${attr(t('propuestaModificarTitulo'))}">${t('propuestaModificar')}</button>${rechazar}</span></li>`;
}

/**
 * Un paso de una de mis guías en el camino de este registro (la tercera fuente, src/guia-libro.js): su acción en llano
 * (el nombre de la época), la guía de la que viene y su porqué (texto de quien escribió la guía, escapado), hecho o no,
 * y si ahora no pasa, por qué. Tocarlo abre el formulario de la acción con sus parámetros rellenos (app.js guiaPaso):
 * lanzar es el gesto de siempre. Uno inválido sale con su motivo, sin botón.
 */
function htmlPasoDeGuia(p) {
  const id = attr(p.propuesta ?? '');
  const deLaGuia = `<span class="fuente">${escapar(t('guiaPasoDe', { guia: p.guia }))}</span>`;
  const porque = p.porque ? ` <span class="porque"><b>${t('propuestaPorque')}</b> ${escapar(p.porque)}</span>` : '';
  if (p.invalida) return `<li class="paso guia-paso invalida"${nodo('paso')} data-guia-paso-id="${id}"><b>${t('guiaPasoInvalido')}</b> <span class="falta">${escapar(p.falta ?? '')}</span> <span class="motivo">${escapar(p.invalida)}</span> ${deLaGuia}${porque}</li>`;
  if (p.hecho) return `<li class="paso guia-paso hecho"${nodo('paso')} data-guia-paso-id="${id}"><span class="falta">${escapar(p.hacer?.nombre ?? p.falta ?? '')}</span> <span class="marca">${t('hecho')}</span> ${deLaGuia}${porque}</li>`;
  const noPasa = p.pasa === false && p.motivos?.length ? `<small class="motivos" role="status">${escapar(t('propuestaNoPasa', { motivos: p.motivos.map((m) => m.mensaje).join('; ') }))}</small>` : '';
  return `<li class="paso guia-paso mio${p.pasa === false ? ' no-pasa' : ''}"${nodo('paso')} data-guia-paso-id="${id}"><button type="button"${nodo('control')} data-guia-paso="${id}" title="${attr(t('guiaPasoTitulo'))}">${escapar(p.hacer?.nombre ?? '')}</button> ${deLaGuia}${porque}${noPasa}</li>`;
}

/**
 * El camino de una guía en su libro: todos sus pasos (su título y su porqué, de quien escribió la guía, escapados), en
 * qué libro se hacen y su estado leído en ese libro, si está en este dispositivo. Tocar uno lleva a hacerlo (app.js
 * guiaSeguir: el libro, el registro y el formulario relleno).
 */
function htmlPasosDeLaGuia(lista) {
  if (!lista?.length) return '';
  const estado = (g) => (g.estado === 'hecho' ? `<span class="marca">${t('hecho')}</span>`
    : g.estado === 'noEsta' ? `<span class="motivo">${t('guiaLibroNoEsta')}</span>`
      : g.estado === 'invalido' ? `<span class="motivo">${escapar(t('guiaPasoInvalidoPor', { motivo: g.motivo ?? '' }))}</span>`
        : `<span class="marca">${t('guiaPendiente')}</span>`);
  const filas = lista.map((g) => {
    const donde = g.libro ? ` <small class="libro">${escapar(t('guiaEnLibro', { libro: g.libro }))}</small>` : '';
    const titulo = g.estado === 'noEsta' || g.estado === 'invalido'
      ? `<b class="de-la-guia">${escapar(g.titulo)}</b>`
      : `<button type="button" class="de-la-guia"${nodo('control')} data-guia-seguir="${attr(g.id)}" title="${attr(t('guiaSeguirTitulo', { accion: g.accionNombre ?? g.accion }))}">${escapar(g.titulo)}</button>`;
    return `<li class="paso guia-paso ${attr(g.estado)}"${nodo('paso')}>${titulo}${donde} ${estado(g)}${g.porque ? ` <span class="porque"><b>${t('propuestaPorque')}</b> ${escapar(g.porque)}</span>` : ''}</li>`;
  }).join('');
  return `<section class="guia-pasos"${nodo('guia')}><h5>${t('guiaSusPasos')}</h5><ol>${filas}</ol></section>`;
}

/** Lo que daría un paso previsualizado (carta.previsualizar): si pasaría y con qué movimientos, o por qué no. */
function htmlPrevia(v) {
  const texto = v.ok ? (v.frase || t('previaPasaSinMovimientos')) : t('previaNoPasa', { motivos: (v.motivos ?? []).map((m) => m.mensaje).join('; ') });
  return `<small class="previa${v.ok ? ' pasa' : ' no-pasa'}" role="status">${escapar(texto)}</small>`;
}

/** El camino: cada paso, mío (lanzable, por el id de su plantilla, y con «previsualizar»), de espera (marcado) o hecho; los niveles si la madurez es 0; «seguir». */
/**
 * La parte que repiten los pasos del camino: lo que va antes del primer « · » de su texto (p. ej. el «stage: lo que el
 * registro anunció…» de cada estación), si lo comparten al menos dos pasos. Se enseña una vez, no una por paso (repaso beta #2).
 */
export function prefijoComunDePasos(pasos) {
  const cuenta = new Map();
  for (const p of pasos ?? []) {
    if (p.propuesta !== null && p.propuesta !== undefined) continue;
    const i = typeof p.falta === 'string' ? p.falta.indexOf(' · ') : -1;
    if (i > 0) cuenta.set(p.falta.slice(0, i), (cuenta.get(p.falta.slice(0, i)) ?? 0) + 1);
  }
  let mejor = null;
  for (const [prefijo, n] of cuenta) if (n >= 2 && (!mejor || n > mejor[1])) mejor = [prefijo, n];
  return mejor?.[0] ?? '';
}

export function htmlCamino(c, { X } = {}) {
  if (!c) return '';
  const comun = prefijoComunDePasos(c.pasos);
  const pasos = c.pasos.map((p, i) => {
    if (p.guia) return htmlPasoDeGuia(p);
    if (p.propuesta !== null && p.propuesta !== undefined) return htmlPropuesta(p);
    const clase = p.hecho ? 'hecho' : p.espera ? 'espera' : p.mio ? 'mio' : 'otro';
    const falta = comun && typeof p.falta === 'string' && p.falta.startsWith(comun + ' · ') ? p.falta.slice(comun.length + 3) : (p.falta ?? '');
    const marca = p.hecho ? `<span class="marca">${t('hecho')}</span>` : p.espera ? `<span class="marca">${escapar(t('esperaA', { quien: p.espera }))}</span>` : '';
    // Un paso mío tiene una sola acción visible, la del paso, con el nombre de su plantilla en llano (VG 14-11, #90). Mantenerlo
    // pulsado enseña lo que haría (una frase, sin escribir nada: gestos.js → previsualizar); la fuente y la regla, al reverso.
    const previa = c.previa?.paso === i ? htmlPrevia(c.previa) : '';
    const reverso = `<span class="paso-reverso" hidden><small>${escapar(t('pasoDeDonde'))}: <code>${escapar(p.fuente ?? '')}</code></small>${p.regla ? ` <small>${escapar(t('pasoRegla'))}: <code>${escapar(p.regla)}</code></small>` : ''}${p.porque ? ` <small>${escapar(t('pasoPorque'))}: ${escapar(p.porque)}</small>` : ''}</span>`;
    const voltear = `<button type="button" class="voltear-paso"${nodo('control')} data-voltear-paso aria-pressed="false" aria-label="${attr(t('pasoVoltear'))}" title="${attr(t('pasoVoltear'))}">↻</button>`;
    const accion = p.hacer && !p.hacer.lectura ? ` data-previsualizar="${i}"` : '';
    return p.mio
      ? `<li class="paso ${clase}"${nodo('paso')}><button type="button" data-paso="${i}" data-x="${attr(p.hacer?.X ?? X ?? '')}" data-lanzar="${attr(p.hacer.id)}" data-accion="${attr(p.hacer.id)}"${accion} title="${attr(t('pasoTitulo', { nombre: p.hacer.nombre }))}">${escapar(p.hacer.nombre)}</button> <span class="falta">${escapar(falta)}</span> ${voltear}${reverso}${previa}</li>`
      : `<li class="paso ${clase}"${nodo('paso')}><span class="falta">${escapar(falta)}</span> ${marca} ${voltear}${reverso}</li>`;
  }).join('');
  const niveles = c.niveles ? `<p class="niveles">${t('paraUbicarse')} ${c.niveles.map((n) => `<span>${escapar(n)}</span>`).join(' → ')}</p>` : '';
  const seguir = c.pasos.some((p) => p.mio && !p.hacer?.lectura && (p.propuesta === null || p.propuesta === undefined)) ? `<button type="button" class="seguir" data-seguir>${t('seguir')}</button>` : '';
  const compartido = comun ? `<p class="camino-comun">${escapar(comun)}</p>` : '';
  return `<section class="camino"${nodo('camino')} aria-label="${attr(t('camino'))}">${niveles}${compartido}<ol>${pasos || `<li class="nada">${t('nadaQueHacerAqui')}</li>`}</ol>${seguir}${htmlPasosDeLaGuia(c.guia)}</section>`;
}

/**
 * Las propuestas importadas que no están en el camino de este registro: las que tratan de otro (con «ir al registro») y
 * las que no se entienden (con su motivo); cada una se puede rechazar. `p`: { fuera: [evaluación de carta/externa.js],
 * aqui } o nada.
 */
function htmlPropuestasFuera(p) {
  if (!p || (!p.fuera.length && !p.aqui)) return '';
  const fila = (e) => `<li class="propuesta${e.valida ? '' : ' invalida'}"${nodo('paso')} data-propuesta="${attr(e.id)}"><b>${escapar(e.valida ? e.nombre : t('propuestaInvalida'))}</b> ${e.valida ? `<small>${escapar(t('propuestaSobre', { sobre: e.sobreTexto ?? corto(e.sobre) }))}</small>` : `<span class="falta">${escapar(e.accion)}</span> <span class="motivo">${escapar(e.motivo)}</span>`}${e.porque ? ` <span class="porque"><b>${t('propuestaPorque')}</b> ${escapar(e.porque)}</span>` : ''}
    <span class="propuesta-botones">${e.valida ? `<button type="button"${nodo('control')} data-abrir="${attr(e.sobre)}">${t('propuestaAbrir')}</button>` : ''}<button type="button"${nodo('control')} data-propuesta-rechazar="${attr(e.id)}" title="${attr(t('propuestaRechazarTitulo'))}">${t('propuestaRechazar')}</button></span></li>`;
  return `<div class="propuestas"${nodo('propuestas')}><h5>${t('propuestasPendientes', { cuantas: p.fuera.length + p.aqui })}</h5>${p.aqui ? `<small class="ayuda">${t('propuestaAqui', { cuantas: p.aqui })}</small>` : ''}<ul>${p.fuera.map(fila).join('')}</ul></div>`;
}

/**
 * El anfitrión (carta/anfitrion.js; extra.anfitrion: si la carta va dentro de una app que firma) y los registros que se
 * están autorizando ahora (extra.autorizando: un Set de ids, su botón inactivo); html() los fija en cada pintado.
 */
let conAnfitrion = false;
let autorizando = new Set();

/**
 * «autorizar» al final de una línea de lo por autorizar (encargo «anfitrión»): solo con anfitrión, en las líneas que me toca
 * autorizar (`titular`) con alguna cosa mía que falta y que no están desbordadas; mientras firma, inactivo («autorizando…»).
 */
function htmlAutorizar(x) {
  if (!conAnfitrion || !x.titular || x.desbordado || !x.cosas?.length) return '';
  const ya = autorizando.has(x.id);
  return ` <button type="button" class="enlace autorizar" data-autorizar="${attr(x.id)}" title="${attr(t('autorizarTitulo'))}"${ya ? ' disabled aria-busy="true"' : ''}>${escapar(t(ya ? 'autorizando' : 'autorizar'))}</button>`;
}

/** Lo por autorizar de mi alta (VG 14-11, #70): una línea por registro, «por autorizar: <su 0> · <qué falta>» (y, con anfitrión, «autorizar»). */
function htmlPorAutorizar(l) {
  if (!l?.length) return '';
  const filas = l.map((x) => `<li class="por-autorizar-linea${x.desbordado ? ' desbordado' : ''}" data-por-autorizar="${attr(x.id)}"${x.desbordado ? ' data-desbordado' : ''}><button type="button" class="enlace" data-abrir="${attr(x.id)}">${escapar(t('porAutorizar'))}: ${escapar(x.que)}</button> · ${x.desbordado ? `<b class="marca-desbordado">${escapar(t('porAutorizarDesbordado'))}</b> · ` : ''}<small>${escapar(x.falta ?? '')}</small>${htmlAutorizar(x)}</li>`).join('');
  return `<section class="por-autorizar"${nodo('por-autorizar')} title="${attr(t('porAutorizarTitulo'))}"><ul>${filas}</ul></section>`;
}

/** Las opiniones ancladas en un registro (el proyecto donde yo las ancla), con cuántas respuestas lleva cada una. */
function htmlOpiniones(o) {
  if (!o?.length) return '';
  const filas = o.map((x) => `<li><time datetime="${attr(x.t)}">${escapar(x.t.replace('T', ' ').replace('Z', ''))}</time> · <b>${escapar(x.autor)}</b> · <button type="button" class="enlace" data-abrir="${x.id}">${corto(x.id)}</button> ${escapar(x.texto)}<small>${escapar(x.clasificacion.join(' · '))}${x.respuestas ? ' · ' + escapar(t('opinionesRespuestas', { cuantas: x.respuestas })) : ''}</small></li>`).join('');
  return `<section class="opiniones"${nodo('opiniones')}><h4>${t('opiniones')} · ${o.length}</h4><ol>${filas}</ol></section>`;
}

/**
 * La guía del PV9 (carta/guia.js; solo lectura): la conversación guardada, «pensando…» mientras contesta, el error tal
 * cual, las preguntas hechas de la época como botones, el campo de pregunta y «preguntar». `g`: { historial, pensando,
 * pendiente, error, borrador, preguntas, via }; sin `g` (no hay eje) no se pinta. La app repinta solo esta sección.
 */
/**
 * «Entrar en el libro del roadmap» (el ensayo del servidor de retoques), en el panel Core y en la bienvenida: `e` { entrando,
 * error } o null (no hay ensayo, o esta pantalla ya tiene esa cuenta: nada). Mientras entra, apagado y «entrando…»; si
 * falló, el motivo debajo y el botón otra vez pulsable.
 */
export function htmlBotonEnsayo(e) {
  if (!e) return '';
  const error = e.error && !e.entrando ? `<span class="aviso" role="alert" data-core-ensayo-error>${escapar(t('coreEnsayoFallo', { motivo: e.error }))}</span>` : '';
  return `<p class="core-ensayo"><button type="button"${nodo('control')} data-core-ensayo title="${attr(t('coreEnsayoTitulo'))}"${e.entrando ? ' aria-busy="true" disabled' : ''}>${escapar(t(e.entrando ? 'coreEnsayoEntrando' : 'coreEnsayo'))}</button>${error}</p>`;
}

export function htmlGuia(g) {
  if (!g) return '';
  if (g.core?.con === 'core') return htmlCore(g.core);
  const turnos = g.historial.map((m) => `<li class="guia-${m.role === 'user' ? 'yo' : 'claude'}"><b>${t(m.role === 'user' ? 'guiaYo' : 'guiaClaude')}</b> ${escapar(m.content)}</li>`).join('')
    + (g.pensando ? `<li class="guia-yo"><b>${t('guiaYo')}</b> ${escapar(g.pendiente ?? '')}</li><li class="guia-pensando" role="status">${t('guiaPensando')}</li>` : '');
  const rapidas = g.preguntas.map((q, i) => `<button type="button"${nodo('control')} data-guia-rapida="${i}"${g.pensando ? ' disabled' : ''}>${escapar(q)}</button>`).join('');
  return `<section class="guia"${nodo('guia')} data-guia aria-label="${attr(t('guia'))}">
    <header class="guia-cabeza"><h4>${t('guia')}</h4>${g.core ? htmlConQuien(g.core.con) : ''}<small class="ayuda">${escapar(t(g.via === 'direct' ? 'guiaViaDirecta' : g.ejemplo ? 'guiaViaEjemplo' : 'guiaViaServidor'))}</small>${g.historial.length ? `<button type="button"${nodo('control')} data-guia-vaciar title="${attr(t('guiaVaciarTitulo'))}">${t('guiaVaciar')}</button>` : ''}</header>
    <ol class="guia-historial" aria-live="polite">${turnos || `<li class="nada">${t('guiaVacia')}</li>`}</ol>
    ${g.error ? `<p class="aviso" role="alert">${escapar(g.error)}</p>` : ''}
    <div class="guia-rapidas">${rapidas}</div>
    <div class="guia-externa"><button type="button"${nodo('control')} data-guia-exportar title="${attr(t('exportarContextoTitulo'))}">${t('exportarContexto')}</button><button type="button"${nodo('control')} data-guia-importar title="${attr(t('importarPropuestasTitulo'))}">${t('importarPropuestas')}</button><input type="file" accept=".json,.md,.markdown,.txt,application/json,text/markdown,text/plain" data-guia-archivo hidden aria-label="${attr(t('importarPropuestas'))}"></div>
    ${htmlPropuestasFuera(g.propuestas)}
    <form class="guia-form" data-guia-form><input type="text" name="pregunta" data-guia-pregunta value="${attr(g.borrador ?? '')}" placeholder="${attr(t('guiaPregunta'))}" aria-label="${attr(t('guiaPregunta'))}" autocomplete="off"${g.pensando ? ' disabled' : ''}><button type="submit"${g.pensando ? ' disabled' : ''}>${t('guiaPreguntar')}</button></form>
    <small class="ayuda">${escapar(t('guiaAyuda'))}</small>
  </section>`;
}

/** Con quién se habla en el PV9 cuando está el servidor de retoques (retoques/): la guía, como siempre, o Core. */
function htmlConQuien(con) {
  const boton = (quien, texto) => `<button type="button"${nodo('control')} data-guia-con="${quien}" aria-pressed="${(con === 'core') === (quien === 'core')}">${texto}</button>`;
  return `<span class="guia-con" role="group" aria-label="${attr(t('coreConQuien'))}">${boton('guia', t('guia'))}${boton('core', t('core'))}</span>`;
}

/**
 * El PV9 hablando con Core (el agente de retoques de la carta; carta/guia.js «hablar con Core»): la conversación de este
 * navegador, lo que va contestando y el archivo que toca mientras edita, «señalar» con lo señalado como etiquetas que se
 * quitan, el campo y «mandar»; arriba, plegada, la lista de cambios de fondo (texto de un agente: siempre escapado).
 * `c`: { con, turnos, pensando, error, borrador, senalado: [{ etiqueta }], senalando, fondo, fondoAbierto, ensayo }. Con
 * `ensayo` ({ entrando }: el servidor sirve el libro del roadmap y esta pantalla no tiene esa cuenta), el botón para entrar.
 */
function htmlCore(c) {
  const turno = (m) => {
    if (m.role === 'user') return `<li class="guia-yo"><b>${t('guiaYo')}</b> ${escapar(m.texto)}${(m.senalado ?? []).map((e) => ` <span class="core-etiqueta">${escapar(e)}</span>`).join('')}</li>`;
    const tocando = m.tocando?.ruta ? `<small class="core-tocando" role="status">${escapar(t(m.tocando.edita ? 'coreEditando' : 'coreLeyendo', { archivo: m.tocando.ruta }))}</small>` : '';
    const cambiados = m.archivos?.length ? `<small class="core-cambiados">${escapar(t('coreCambiados', { archivos: m.archivos.join(', ') }))}</small>` : '';
    const pensando = !m.hecho && !m.texto && !tocando ? `<span class="guia-pensando" role="status">${t('guiaPensando')}</span>` : '';
    return `<li class="guia-claude"><b>${t('core')}</b> ${escapar(m.texto ?? '')}${pensando}${tocando}${cambiados}${m.error ? `<span class="aviso" role="alert">${escapar(m.error)}</span>` : ''}</li>`;
  };
  const turnos = (c.turnos ?? []).map(turno).join('');
  const f = c.fondo;
  const entradas = f?.entradas?.length ? `<ol>${f.entradas.map((e) => `<li><b>${escapar(e.titulo)}</b> · ${escapar(e.clase || '—')} · ${escapar(e.estado || '—')}</li>`).join('')}</ol>` : `<p class="nada">${escapar(t('coreFondoVacio'))}</p>`;
  const fondo = f ? `<details class="core-fondo" data-core-fondo${c.fondoAbierto ? ' open' : ''}><summary>${escapar(t('coreFondo', { total: f.total, sin: f.sesionesSinCrecer }))}</summary>${entradas}</details>` : '';
  const ensayo = htmlBotonEnsayo(c.ensayo);
  const senalado = (c.senalado ?? []).map((s, i) => `<span class="core-etiqueta">${escapar(s.etiqueta)}<button type="button"${nodo('control')} data-core-quitar="${i}" title="${attr(t('coreQuitar'))}" aria-label="${attr(t('coreQuitar'))}">×</button></span>`).join('');
  return `<section class="guia guia-core"${nodo('guia')} data-guia aria-label="${attr(t('core'))}">
    <header class="guia-cabeza"><h4>${t('core')}</h4>${htmlConQuien('core')}<small class="ayuda">${escapar(t('coreVia'))}</small>${c.turnos?.length ? `<button type="button"${nodo('control')} data-core-nueva title="${attr(t('coreNuevaTitulo'))}"${c.pensando ? ' disabled' : ''}>${t('coreNueva')}</button>` : ''}</header>
    ${ensayo}${fondo}
    <ol class="guia-historial" aria-live="polite">${turnos || `<li class="nada">${t('coreVacia')}</li>`}</ol>
    ${c.error ? `<p class="aviso" role="alert">${escapar(c.error)}</p>` : ''}
    <div class="core-senalado">${senalado}<button type="button"${nodo('control')} data-core-senalar aria-pressed="${Boolean(c.senalando)}" title="${attr(t('coreSenalarTitulo'))}">${t(c.senalando ? 'coreSenalando' : 'coreSenalar')}</button></div>
    <form class="guia-form" data-core-form><input type="text" name="texto" data-core-texto value="${attr(c.borrador ?? '')}" placeholder="${attr(t('corePide'))}" aria-label="${attr(t('corePide'))}" autocomplete="off"${c.pensando ? ' disabled' : ''}><button type="submit"${c.pensando ? ' disabled' : ''}>${t('coreMandar')}</button></form>
    <small class="ayuda">${escapar(t('coreAyuda'))}</small>
  </section>`;
}

/**
 * Un PV lateral en su nivel: comprimido (un dato), tarjeta (etiqueta y lo que cabe), bloque (la lista o la matriz). En una
 * fila abierta de Sequenced (`enFila`), el bloque sin su cabeza (la lleva la fila) y con la rejilla apilada; sin rejilla
 * ni ocupantes, la regla del vacío («escribir aquí · acción»).
 */
function htmlLateral(n, arbol, { enFila = false } = {}) {
  const clases = ['pv', `pv-${n.pv}`, `grupo-${n.grupo}`, `lado-${n.lado ?? ''}`, `fila-${n.fila ?? ''}`, `nivel-${n.nivel}`].join(' ');
  if (n.nivel === NIVEL.oculto) return `<div class="${clases}"${nodo('pv', { tam: NOMBRE_NIVEL[n.nivel] })} data-pv="${n.pv}" data-x="${n.X}" hidden></div>`;
  const dato = `<span class="dato" title="${attr(n.comprimido.que ?? '')}">${escapar(n.comprimido.dato)}${n.comprimido.de ? `<small>/${escapar(n.comprimido.de)}</small>` : ''}</span>`;
  const cabeza = `<header class="pv-cabeza"><span class="numero">${n.pv}</span><span class="etiqueta">${escapar(n.etiqueta)}</span>${n.medida ? htmlMedida(n.medida) : dato}${enFila ? '' : htmlInterrogante(n.sitio)}</header>`;
  let cuerpo = '';
  if (n.nivel === NIVEL.comprimido) cuerpo = `<div class="comprimido" title="${attr(n.etiqueta)}: ${attr(n.ayuda ?? '')}"><span class="numero">${n.pv}</span>${dato}</div>`;
  else {
    const camino = n.grupo === 'cruz' && n.fila === 'abajo' ? htmlCamino(arbol.camino, { X: n.X }) + (arbol.centro?.pv !== n.pv && (arbol.apilada || n.nivel >= NIVEL.bloque) ? htmlGuia(arbol.guia) : '') : '';
    // En animado, el bloque (en Mapped y en la fila abierta de Sequenced) lleva el primero de los dos sitios del arte (VG
    // 14-11, #94): el fondo del mundo, detrás de todo. El marco, con sus huecos, es de la pantalla completa (htmlEscena).
    const fondo = arbol?.animado ? htmlFondo(n.fondo) : '';
    const lista = n.vacio ? `<p class="vacio-pv"${htmlHueco(n.X, n.pv)}>${htmlEscribir(n.escribir)}</p>` : htmlOcupantes(n.ocupantes, { pv: n.pv, disposicion: n.disposicion });
    cuerpo = fondo + (enFila ? '' : cabeza) + (n.rejilla ? htmlRejilla(n.rejilla, { apilada: enFila }) : lista) + (n.nivel >= NIVEL.tarjeta ? htmlPorAutorizar(n.porAutorizar) : '') + (n.nivel >= NIVEL.bloque ? htmlDiario(n.diario) + htmlOpiniones(n.opiniones) : '') + camino
      + `<footer class="pv-pie"><button type="button" class="entrar" data-foco-pv="${n.pv}" data-x="${n.X}">${t('entrar')}</button><small class="ayuda">${escapar(n.ayuda ?? '')}</small></footer>`;
  }
  return `<section class="${clases}"${nodo('pv', { tam: n.pasoDeTamano?.nombre ?? NOMBRE_NIVEL[n.nivel], rep: repDe(n.representacion) })} data-pv="${n.pv}" data-x="${n.X}" data-nivel="${n.nivel}" aria-label="${attr(n.etiqueta)}" tabindex="0">${cuerpo}</section>`;
}

/**
 * El marcador de un campo de fila: lo que la época espera, salvo una nota interna del corpus («Décupla del corpus V4: …»,
 * que no es un ejemplo para quien escribe); en su lugar, la etiqueta legible del PV (repaso beta #25).
 */
export function marcadorLegible(marcador, etiqueta) {
  const util = (marcador ?? []).filter((m) => !/^décupla del corpus/i.test(String(m).trim()));
  return util.length ? util.join(' · ') : String(etiqueta ?? '');
}

/**
 * Sequenced: las filas de la tarjeta del foco, una por PV en el orden de sus dígitos. Cada una, su cabeza (el número, la
 * etiqueta, cuántos tiene y su medida) que la abre o la cierra (data-fila) y su campo para escribir; abierta, debajo, el
 * segundo nivel del PV (htmlLateral en bloque). Las del hilo (el pasado y el futuro) no se abren: llevan a su zona.
 */
function htmlFilas(arbol, c) {
  const fila = (f) => {
    const campo = c.campos.find((x) => x.pv === f.pv);
    const etiqueta = escapar(f.etiqueta ?? '');
    const input = f.pv === c.pv
      ? `<input class="campo-input" data-campo="${c.pv}" data-x="${c.X}" value="" placeholder="${attr(t('nuevoAquiMarcador', { que: c.textoDelFoco ?? c.representacion?.texto ?? '' }))}" title="${attr(c.ayuda ?? '')}" aria-label="${attr(f.etiqueta ?? '')}" autocomplete="off">`
      : campo ? `<input class="campo-input" data-campo="${f.pv}" data-x="${c.X}" value="${attr(campo.valor)}" placeholder="${attr(marcadorLegible(campo.marcador, f.etiqueta))}" title="${attr(campo.ayuda ?? '')}" aria-label="${attr(f.etiqueta ?? '')}" autocomplete="off">` : '';
    const marca = f.hilo ? (f.hilo === 'antes' ? '↑' : '↓') : f.abierta ? '▾' : '▸';
    const titulo = f.hilo ? t(f.hilo === 'antes' ? 'irAlPasado' : 'irAlFuturo') : t(f.abierta ? 'filaCerrar' : 'filaAbrir', { que: f.etiqueta ?? '' });
    const cabeza = `<button type="button" class="fila-cabeza"${nodo('control')} data-fila="${f.pv}" data-x="${c.X}"${f.hilo ? ` data-hilo="${attr(f.hilo)}"` : ` aria-expanded="${f.abierta}" aria-controls="fila-${f.pv}-contenido"`} title="${attr(titulo)}"><span class="numero">${f.pv}</span><span class="etiqueta">${etiqueta}${f.total ? ` <small>· ${escapar(f.total)}</small>` : ''}</span>${f.medida?.propio ? htmlMedida(f.medida) : ''}<span class="fila-marca" aria-hidden="true">${marca}</span></button>`;
    const contenido = f.abierta && f.nodo ? `<div class="fila-contenido" id="fila-${f.pv}-contenido">${htmlLateral(f.nodo, arbol, { enFila: true })}</div>` : '';
    return `<li class="fila${f.abierta ? ' abierta' : ''}${f.hilo ? ' fila-hilo' : ''}"${nodo('campo', { d: f.pv })} data-color="${f.pv}" data-fila-pv="${f.pv}">${cabeza}${htmlInterrogante(f.sitio, { clase: 'sitio-fila' })}${input}${contenido}</li>`;
  };
  return `<ol class="filas">${arbol.secuencia.filas.map(fila).join('')}</ol>`;
}

/**
 * Sequenced: una zona del hilo, encima (el pasado) o debajo (el futuro) de la tarjeta: lo que pinta su PV en bloque (sus
 * ocupantes y, en el pasado, el diario de lo llegado y las opiniones) como tarjetas apiladas de arriba abajo en el orden
 * que da el núcleo (VG, 11-11, #18: lo más cercano al presente arriba; el orden lo declara la época para cada mundo,
 * epoch.8.7, y aquí no se reordena); «cargar más» al final, por páginas (el paso de la configuración). Vacía, la regla
 * del vacío. En animado (`capa`), el elemento de cada ocupante es una capa, como en las filas.
 */
function htmlHilo(n) {
  if (!n) return '';
  const pasado = n.hilo === 'antes';
  const entrada = (e) => `<li class="hilo-carta hilo-entrada"><time datetime="${attr(e.t)}">${escapar(fecha(e.t))}</time> · <b>${escapar(e.autor)}</b> · <button type="button" class="enlace" data-abrir="${attr(e.id)}">${corto(e.id)}</button><small>${escapar(e.movimientos.join(', '))}</small></li>`;
  const cartas = [...(n.ocupantes?.lista ?? []).map((o) => `<li class="hilo-carta">${htmlOcupante(o)}</li>`), ...(n.diario?.entradas ?? []).map(entrada)];
  const vacio = cartas.length ? '' : `<li class="hilo-vacio"${htmlHueco(n.X, n.pv)}>${htmlEscribir(n.escribir)}</li>`;
  const mas = n.cargarMas ? `<li class="cargar-mas"><button type="button"${nodo('control')} data-cargar-mas="${n.pv}">${escapar(t('cargarMas', { cuantos: n.faltan }))}</button></li>` : '';
  const total = (n.ocupantes?.total ?? 0) + (n.diario?.total ?? 0);
  const cabeza = `<header class="pv-cabeza hilo-cabeza"><span class="numero">${n.pv}</span><span class="etiqueta">${escapar(n.etiqueta)}</span><small>${escapar(t(pasado ? 'hiloPasado' : 'hiloFuturo', { n: total }))}</small></header>`;
  const lista = `<ol class="hilo-cartas">${vacio}${cartas.join('')}${mas}</ol>`;
  const clases = ['pv', `pv-${n.pv}`, 'zona-hilo', `zona-${n.hilo}`, `grupo-${n.grupo}`, `lado-${n.lado ?? ''}`, `nivel-${n.nivel}`].join(' ');
  return `<section class="${clases}"${nodo('pv', { tam: NOMBRE_NIVEL[n.nivel] })} data-pv="${n.pv}" data-x="${n.X}" data-nivel="${n.nivel}" data-hilo-zona="${n.pv}" aria-label="${attr(n.etiqueta)}">${pasado ? htmlPorAutorizar(n.porAutorizar) + htmlOpiniones(n.opiniones) + lista + cabeza : cabeza + lista}</section>`;
}

/** Sequenced: la fila fina y fija de abajo con los diez dígitos en su color; tocar uno lleva a su fila y la abre (los del hilo, a su zona). */
function htmlDigitos(s) {
  if (!s?.digitos?.length) return '';
  return `<nav class="digitos"${nodo('control')} aria-label="${attr(t('digitosTitulo'))}">${s.digitos.map((d) => `<button type="button" class="digito" data-digito="${d.pv}" data-color="${d.pv}" title="${attr(d.pv + ' · ' + (d.etiqueta ?? ''))}" aria-label="${attr(d.pv + ' · ' + (d.etiqueta ?? ''))}">${d.pv}</button>`).join('')}</nav>`;
}

/**
 * El reverso como editor de código (VG, 14-11, #93): el BTML del registro como TEXTO en una <pre><code> de solo lectura, con
 * una línea por fila numerada, sangrada por nivel y un color por tipo de valor (las clases t-*); «formatear» alterna el BTML
 * crudo y el formateado para leer y, formateado, enseña los criterios de formato para que quien mira los establezca. Todo
 * lo que viene del BTML se escapa: nada de él es HTML ni se ejecuta.
 */
function htmlBtml(b) {
  if (!b) return '';
  const lineas = b.lineas.map((l) => `<span class="btml-linea" data-nivel="${l.nivel}"><span class="btml-n" aria-hidden="true">${l.n}</span>${l.trozos.map((z) => `<span class="t-${z.k}">${escapar(z.v)}</span>`).join('')}</span>`).join('\n');
  const criterios = b.criterios.length ? `<fieldset class="btml-criterios"><legend>${t('btmlCriterios')}</legend>${b.criterios.map((c) => `<label class="btml-criterio"><span>${escapar(c.etiqueta)}</span><select data-formato="${attr(c.clave)}">${c.opciones.map((o) => `<option value="${attr(o.valor)}"${o.valor === c.valor ? ' selected' : ''}>${escapar(o.texto)}</option>`).join('')}</select></label>`).join('')}<small class="ayuda">${t('btmlCriteriosAyuda')}</small></fieldset>` : '';
  return `<div class="btml-editor${b.formateado ? ' formateado' : ''}"${nodo('control')}>
    <div class="btml-barra"><span class="btml-titulo">${t('btmlTitulo')}</span><button type="button" class="btml-formatear" data-formatear aria-pressed="${b.formateado}" title="${attr(t('btmlFormatearTitulo'))}">${t('btmlFormatear')}</button></div>
    ${criterios}
    ${b.lineas.length ? `<pre class="btml-codigo" tabindex="0" aria-label="${attr(t('btmlTitulo'))}"><code>${lineas}</code></pre>` : `<p class="ayuda">${t('btmlSinDatos')}</p>`}
  </div>`;
}

/** El centro: el anverso (0), el reverso (5) o un PV abierto como foco. */
function htmlCentro(c, arbol, { leidoTexto } = {}) {
  const voltear = `<button type="button" class="voltear" data-voltear aria-label="${attr(t('voltear'))} (${attr(t(c.cara === 'anverso' ? 'voltearAnverso' : 'voltearReverso'))})" title="${attr(t('voltear'))}">⟲</button>`;
  const leido = `<div class="leido"><button type="button" class="leido-boton" data-leido aria-pressed="${c.leido}" title="${attr(t(c.leido ? 'leidoOcultar' : 'leidoVer'))}">${t('leido')}</button>${c.leido && leidoTexto !== undefined ? `<pre class="leido-texto" tabindex="0">${escapar(leidoTexto)}</pre>` : ''}</div>`;
  const puntos = htmlPuntos(arbol.mapa?.puntos, c.X);
  const madurez = c.madurez?.nombre ? `<span class="madurez medida" title="${attr(t('madurezTitulo', { nivel: c.madurez.nivel, de: c.madurez.de }))}">${escapar(c.madurez.nombre)} <small>${c.madurez.nivel}/${c.madurez.de}</small></span>` : '';
  const quien = `<span class="quien">${escapar(c.autor ?? '')}</span>`;
  // El personaje del centro (VG, 12-11, #38): el del 0 es la configuración general; en Sequenced va arriba de la columna (htmlCeroColumna), no aquí.
  const cero = arbol.apilada && c.cara === 'anverso' ? '' : htmlInterrogante(c.sitio, { clase: 'sitio-centro' });
  if (c.cara === 'anverso') {
    return `<section class="nucleo anverso tamano-${c.tamano?.tamano ?? 1}"${nodo('foco', { tam: 'foco', cara: 'anverso', rep: repDe(c.representacion) })} data-centro="${c.pv}" data-x="${c.X}" aria-label="${attr(c.etiqueta)}">
      <header class="nucleo-cabeza">${htmlIconoPropio(c)}<span class="etiqueta">${escapar(c.etiqueta)}</span>${madurez}${quien}${cero}${voltear}</header>
      ${puntos}
      <h1 class="representacion${c.representacion?.aislada ? ' con-aislada' : ''}${c.zonas?.length ? ' con-zonas' : ''}">${c.zonas?.length ? htmlCaraConZonas(htmlRepresentacion(c.representacion, { nombre: c.textoDelFoco ?? c.etiqueta }), c) : htmlRepresentacion(c.representacion, { nombre: c.textoDelFoco ?? c.etiqueta })}</h1>
      ${htmlFicha(c.ficha)}
      ${htmlCuentaDelBanco(c.cuenta)}
      ${arbol.secuencia ? htmlFilas(arbol, c) : `<label class="campo campo-0 campo-unico"${nodo('campo', { d: 0 })}><span class="etiqueta-0">${escapar(c.etiqueta)}</span><input class="campo-input" data-campo="${c.pv}" data-x="${c.X}" value="" placeholder="${attr(t('nuevoAquiMarcador', { que: c.textoDelFoco ?? c.representacion?.texto ?? '' }))}" title="${attr(c.ayuda ?? '')}" autocomplete="off"></label>`}
      ${leido}
    </section>`;
  }
  if (c.cara === 'reverso') {
    const ancla = c.ancla ? `<p class="ancla">${t('sobre')} <button type="button" class="enlace" data-abrir="${attr(c.ancla.sobre ?? '')}" ${c.ancla.sobre ? '' : 'disabled'}>${escapar(c.ancla.sobreTexto ?? t('laRaiz'))}</button>${c.ancla.en ? ` · ${t('en')} ${escapar(c.ancla.en)}` : ''}</p>` : '';
    // Sin los pasos que no dicen nada (un «cuando —/10»: sin valor no hay paso que contar).
    const pasos = c.pasos ? Object.values(c.pasos.porPv).concat(c.pasos.comun ? [c.pasos.comun] : []).filter((p) => p.k !== null && p.k !== undefined) : [];
    const pasosHtml = pasos.length ? `<ul class="pasos">${pasos.map((p) => `<li><b>${escapar(p.nombre)}</b> ${escapar(p.k)}${p.de ? `<small>/${escapar(p.de)}</small>` : ''}</li>`).join('')}</ul>` : '';
    const validacion = c.validacion?.length ? `<ul class="motivos">${c.validacion.map((v) => `<li>${escapar(v.motivo)}</li>`).join('')}</ul>` : '';
    return `<section class="nucleo reverso tamano-${c.tamano?.tamano ?? 1}"${nodo('foco', { tam: 'foco', cara: 'reverso', rep: repDe(c.representacion) })} data-centro="${c.pv}" data-x="${c.X}" aria-label="${attr(c.etiqueta)}">
      <header class="nucleo-cabeza">${htmlIconoPropio(c)}<span class="etiqueta">${escapar(c.etiqueta)}</span>${madurez}${quien}${cero}${voltear}</header>
      ${puntos}
      <p class="tipo">${c.plantilla ? `${t('plantilla')} <b>${escapar(c.plantilla)}</b>` : t('sinPlantilla')}${c.t ? ` · <time datetime="${attr(c.t)}">${escapar(c.tLegible ?? c.t)}</time>` : ''}</p>
      ${ancla}${htmlFirmeza(c.firmeza)}${htmlCustodia(c.custodia)}${c.pendienteDeSegundoFactor ? `<p class="verificado-linea">${htmlPendienteDeSegundoFactor(c)}</p>` : ''}${htmlPago(c.pago, c.X)}
      ${htmlBtml(c.btml)}
      ${pasosHtml}${validacion}
    </section>`;
  }
  // A pantalla completa, los dos sitios del arte (#94): con rejilla, los pinta la rejilla (htmlRejilla); sin ella, aquí: el
  // fondo detrás de todo y el marco alrededor de la lista de ocupantes (htmlEscena).
  const lista = htmlOcupantes(c.ocupantes, { pv: c.pv, disposicion: c.disposicion });
  return `<section class="nucleo abierto tamano-${c.tamano?.tamano ?? 1}"${nodo('foco', { tam: 'foco', cara: 'abierto', rep: repDe(c.representacion) })} data-centro="${c.pv}" data-x="${c.X}"${c.estilo && !c.rejilla ? ` data-id="${attr(c.X)}"` : ''} aria-label="${attr(c.etiqueta)}">
    <header class="nucleo-cabeza"><span class="numero">${c.pv}</span>${c.rejilla?.flotante ? '' : htmlIconoPropio(c)}<span class="etiqueta">${escapar(c.etiqueta)}</span>${htmlMedida(c.medida)}${quien}${cero}${arbol.mapa?.completa ? `<button type="button" class="volver volver-claro"${nodo('control')} ${c.rejilla?.ruta?.length ? `data-subir="${c.pv}"` : `data-foco-pv="${arbol.mapa.completa.volver}"`} data-x="${c.X}" title="${attr(t('volverTitulo'))}">← ${t('volver')}</button>` : `<button type="button" class="volver" data-foco-pv="0" data-x="${c.X}" title="${attr(t('volverAl0'))}">0</button>`}</header>
    ${c.rejilla ? '' : htmlFondo(c.escena?.fondo)}
    ${htmlPorAutorizar(c.porAutorizar)}${c.rejilla ? htmlRejilla(c.rejilla, { completa: true, arbol }) : htmlEscena(c.escena, lista)}
    <p class="ayuda">${escapar(c.ayuda ?? '')}</p>${GEOMETRIA[c.pv]?.grupo === 'cruz' && GEOMETRIA[c.pv]?.fila === 'abajo' && !c.rejilla?.camino ? htmlGuia(arbol.guia) : ''}
  </section>`;
}

/**
 * La cuenta del banco de un registro (carta.js cuentaDe; encargo «cuenta del banco»): el saldo con su unidad, la fecha y
 * «confirmado por el banco» cuando la fuente lo dice, y el estado del permiso. Sin saldo, lo dice; sin permiso, también.
 * Debajo del permiso (VG 17-11, V6): quién puede proponer pagos, que cada pago lo aprueba el titular en su banco y quién ve
 * el saldo.
 */
function htmlCuentaDelBanco(c) {
  if (!c) return '';
  const s = c.saldo;
  const fuente = s ? (s.confirmado ? `<small class="cuenta-fuente confirmado">${escapar(t('cuentaConfirmado'))}</small>` : s.fuente ? `<small class="cuenta-fuente">${escapar(t('cuentaFuente', { fuente: s.fuente }))}</small>` : '') : '';
  const saldo = s
    ? `<p class="cuenta-saldo"><span class="cuenta-etiqueta">${escapar(t('cuentaSaldo'))}</span> <b class="cuenta-cuanto">${escapar(s.cuanto)}</b> <span class="cuenta-unidad">${escapar(s.unidad ?? '')}</span> <time datetime="${attr(s.t)}">${escapar(s.fecha ?? s.t)}</time> ${fuente}</p>`
    : `<p class="cuenta-saldo vacio">${escapar(t('cuentaSinSaldo'))}</p>`;
  const permiso = `<p class="cuenta-permiso" data-permiso="${attr(c.permiso.estado)}">${escapar(t('cuentaPermiso_' + c.permiso.estado, { vence: c.permiso.vence ?? '' }))}</p>`;
  const p = c.proponen;
  const quienes = p?.nombres?.length ? (p.mas ? t('cuentaProponenMas', { quienes: p.nombres.join(', '), n: p.mas }) : p.nombres.join(', ')) : '';
  const proponen = quienes ? `<p class="cuenta-proponen">${escapar(t('cuentaProponen', { quienes }))}</p>` : '';
  const aprueba = c.titular ? `<p class="cuenta-aprueba">${escapar(t('cuentaAprueba', { titular: c.titular }))}</p>` : '';
  const ven = `<p class="cuenta-ven">${escapar(t('cuentaVenSaldo'))}</p>`;
  return `<div class="cuenta-del-banco" data-cuenta="${attr(c.X)}" title="${attr(t('cuentaTitulo'))}">${c.banco ? `<p class="cuenta-banco">${escapar(c.banco)}</p>` : ''}${saldo}${permiso}${proponen}${aprueba}${ven}</div>`;
}

/** Mis E en el rosetón del 1 (carta.js carteraDe): cada serie con lo que tengo; la de una cuenta, su nombre y su saldo. */
function htmlCartera(cartera) {
  if (!cartera?.length) return '';
  const linea = (x) => (x.cuenta
    ? `<li class="cartera-cuenta" data-cuenta="${attr(x.cuenta.X)}"><span class="cartera-nombre">${escapar(x.cuenta.nombre ?? x.texto)}</span> <b>${escapar(x.cuenta.saldo ? x.cuenta.saldo.cuanto + ' ' + (x.cuenta.saldo.unidad ?? '') : t('cuentaSinSaldo'))}</b></li>`
    : `<li><span class="cartera-nombre">${escapar(x.texto)}</span> <b>${escapar(x.cantidad)}</b></li>`);
  return `<p class="cartera-etiqueta">${escapar(t('cartera'))}</p><ul class="cartera">${cartera.map(linea).join('')}</ul>`;
}

/**
 * Los rosetones de identidad: diez mosaicos muy comprimidos de mi foco, uno por PV (el 0 y el 5 incluidos). En la
 * matriz, una barra fija abajo; apilada (el móvil), dos tiras: arriba el tetraedro de la X con su centro, abajo la cruz
 * con el suyo (las que traza la geometría: la X son los PV 1-4, la cruz 6-9, y el 0 y el 5 el centro de cada una).
 */
function htmlRoseton(r, { enSuSitio = false } = {}) {
  const sitio = enSuSitio && r.sitio ? ` sitio-f${r.sitio.fila} sitio-c${r.sitio.columna}${r.sitio.centro ? ' sitio-centro' : ''}` : '';
  // A pantalla completa (nivel 3) el rosetón se queda comprimido en su sitio: lo grande es la hoja de htmlRosetonPantalla.
  const nivel = r.nivel >= NIVEL.bloque ? NIVEL.comprimido : r.nivel;
  const ampliado = nivel >= NIVEL.tarjeta && r.ocupantes;
  // Su nombre es el 0 de la posición de mi alta, en el idioma de la cuenta (VG, 14-11, #91): no «de mi alta».
  return `<button type="button" class="roseton grupo-${r.grupo} lado-${r.lado ?? ''} fila-${r.fila ?? ''} nivel-${nivel}${sitio}"${nodo('roseton', { tam: NOMBRE_NIVEL[nivel] })} data-roseton="${r.pv}" data-x="${r.X}" title="${attr(t('rosetonTitulo', { que: r.etiqueta }))}" aria-expanded="${r.nivel >= NIVEL.tarjeta}">
    <span class="numero">${r.pv}</span>${r.comprimido.dato ? `<span class="dato">${escapar(r.comprimido.dato)}</span>` : ''}
    ${ampliado ? `<span class="etiqueta">${escapar(r.etiqueta)}</span><ul>${r.ocupantes.lista.slice(0, 4).map((o) => `<li>${escapar(o.texto)}</li>`).join('') || `<li class="nada">${t('nada')}</li>`}</ul>${htmlCartera(r.cartera)}` : ''}
  </button>`;
}
/** El doble toque: la misma vista del rosetón ampliado a pantalla completa, con lo que el núcleo da de esa posición de mi alta. */
function htmlRosetonPantalla(lista, guia = null) {
  const r = lista.find((x) => x.nivel >= NIVEL.bloque && x.ocupantes);
  if (!r) return '';
  // El 9 (la cruz de abajo: el camino) lleva también la guía con su «guía | Core», como su tarjeta a nivel bloque.
  const conGuia = GEOMETRIA[r.pv]?.grupo === 'cruz' && GEOMETRIA[r.pv]?.fila === 'abajo' ? htmlGuia(guia) : '';
  const filas = r.ocupantes.lista.map((o) => `<li>${escapar(o.texto)}</li>`).join('') || `<li class="nada">${t('rosetonVacio')}</li>`;
  return `<section class="roseton-pantalla"${nodo('roseton', { tam: 'pantalla' })} data-roseton-pantalla="${r.pv}" data-color="${r.pv}" role="dialog" aria-label="${attr(r.etiqueta)}">
    <header><span class="numero">${r.pv}</span><span class="etiqueta">${escapar(r.etiqueta)}</span>${r.ocupantes.total ? `<small>${escapar(r.ocupantes.total)}</small>` : ''}<button type="button" class="cerrar" data-roseton-cerrar${nodo('control')} aria-label="${attr(t('rosetonCerrarTitulo', { que: r.etiqueta }))}" title="${attr(t('rosetonCerrarTitulo', { que: r.etiqueta }))}">${t('rosetonCerrar')}</button></header>
    <ul>${filas}</ul>${htmlCartera(r.cartera)}${conGuia}
  </section>`;
}
const nav = (lista, clase, enSuSitio = false) => `<nav class="rosetones ${clase}"${nodo('rosetones')} aria-label="${attr(t('miFoco'))}">${lista.map((r) => htmlRoseton(r, { enSuSitio })).join('')}</nav>`;
const ARRIBA = [1, 2, 0, 3, 4];
function htmlRosetones(lista, { apilada = false, parte, guia = null } = {}) {
  if (!lista?.length) return '';
  // En el ordenador, cada uno en su esquina o lateral, por encima de los bloques (dentro de la escena: htmlMapa).
  if (!apilada) return parte === 'mapa' ? nav(lista, 'rosetones-mapa', true) + htmlRosetonPantalla(lista, guia) : '';
  const mias = lista.filter((r) => (ARRIBA.includes(r.pv) ? 'arriba' : 'abajo') === parte);
  return mias.length ? nav(mias, `rosetones-${parte}`) : '';
}

/** Una lista de valores posibles (contrato.opciones) para escribir en la posición pv de X: cada uno, un botón (data-opcion, data-valor). */
const htmlOpciones = (lista, pv, X, clase = 'opciones') => (lista?.length ? `<ul class="${clase}" data-opciones="${pv}">${lista.map((o) => `<li><button type="button" class="opcion"${nodo('opcion')} data-opcion="${pv}" data-valor="${attr(o.valor)}" data-x="${attr(X)}" title="${attr(o.texto)}">${escapar(o.texto)}</button></li>`).join('')}</ul>` : '');

/**
 * El aro: ocho sitios alrededor del elemento, en la matriz 3 × 3 sin centro (data-fila y data-columna de cada sitio; el CSS los
 * pone en su celda), cada uno en el color de su PV (data-pv) con su acción por defecto (lanzada por el id de su plantilla: un clic).
 * El clic mantenido (o el derecho) sobre un sitio despliega su lista, pegada al chip: las demás acciones y los valores posibles de
 * su posición para escribirlos. Un sitio sin acciones ni valores va apagado y sin lista. El centro es el propio elemento (su 0):
 * un clic entra en él y el clic mantenido lo edita: el input con su valor, la lista del 0 debajo y la del 5 (su reverso) encima.
 * Sin botones extra: Esc o un clic fuera cierra. Dónde cae en la pantalla lo decide la app (carta/app.js), no el árbol.
 */
function htmlAro(aro) {
  if (!aro) return '';
  const huecos = aro.huecos.map((h) => {
    const a = h.accionPorDefecto ?? h.accion;
    const alternativas = h.alternativas ?? h.otras ?? [];
    const opciones = h.opciones ?? [];
    const conLista = alternativas.length > 0 || opciones.length > 0;
    const nombre = a ? `${retocable(a.nombre, a.retocar)}${a.faltan.length ? ` <small>[${escapar(a.faltan.join(', '))}]</small>` : ''}` : '';
    const cuantas = conLista ? ` <small class="cuantas" aria-hidden="true">${alternativas.length + opciones.length}</small>` : '';
    const defecto = a
      ? `<button type="button" class="accion por-defecto"${nodo('accion')} data-lanzar="${attr(a.id)}" data-x="${aro.X}" title="${attr(h.etiqueta)}: ${attr(a.nombre)}"><span class="numero">${h.pv}</span>${h.icono?.recurso ? htmlPieza(h.icono, { alt: h.etiqueta }) : ''}<span class="nombre">${nombre}</span>${cuantas}</button>`
      : `<span class="accion vacia" title="${attr(h.etiqueta)}: ${attr(t(conLista ? 'aroMantenerLista' : 'nadaQueHacer'))}"><span class="numero">${h.pv}</span><span class="nombre">${conLista ? escapar(h.etiqueta) : '—'}</span>${cuantas}</span>`;
    const lista = h.abierto && conLista
      ? `<ul class="otras"><li class="otras-titulo">${escapar(h.etiqueta)}</li>${alternativas.map((x) => `<li><button type="button"${nodo('accion')} data-lanzar="${attr(x.id)}" data-x="${aro.X}">${retocable(x.nombre, x.retocar)}${x.faltan.length ? ` <small>[${escapar(x.faltan.join(', '))}]</small>` : ''}</button></li>`).join('')}${opciones.length ? `<li class="otras-titulo otras-valores">${escapar(t('aroEscribir'))}</li>${opciones.map((o) => `<li><button type="button" class="opcion"${nodo('opcion')} data-opcion="${h.pv}" data-valor="${attr(o.valor)}" data-x="${aro.X}" title="${attr(o.texto)}">${escapar(o.texto)}</button></li>`).join('')}` : ''}</ul>`
      : '';
    return `<li class="hueco hueco-${h.pv} lado-${h.lado ?? ''}${a || conLista ? '' : ' apagado'}${h.abierto ? ' desplegado' : ''}"${nodo('hueco')} data-pv="${h.pv}" data-fila="${h.celda[0]}" data-columna="${h.celda[1]}"${conLista ? ' data-con-lista' : ''}><span class="sitio">${defecto}</span>${lista}</li>`;
  }).join('');
  const c = aro.centro;
  if (c?.nuevo) {
    // Sobre un hueco vacío (issue #22, VG 14-11 #87): en llano qué se crea y dónde, el nombre (el 0 de lo que se crea) y lo que el núcleo ofrece crear ahí.
    const input = `<input class="campo-input campo-nuevo" data-campo="${c.pv}" data-x="${aro.X}" data-nuevo value="" placeholder="${attr(t('aroCrearNombre'))}" title="${attr(t('aroCrearNombreTitulo', { que: c.etiqueta ?? '' }))}" aria-label="${attr(aro.texto)}" autocomplete="off">`;
    const crear = c.crear?.length
      ? `<ul class="opciones opciones-abajo aro-crear" data-crear><li class="aro-crear-con">${escapar(t('aroCrearCon'))}</li>${c.crear.map((a) => `<li><button type="button" class="opcion"${nodo('accion')} data-lanzar="${attr(a.id)}" data-x="${attr(aro.X)}" title="${attr(a.nombre)}">${escapar(a.nombre)}</button></li>`).join('')}</ul>`
      : '';
    return `<div class="aro-fondo" data-cerrar><div class="aro aro-nuevo editando"${nodo('aro', { nuevo: c.pv })} data-x="${aro.X}" data-nuevo="${c.pv}" role="dialog" aria-label="${attr(aro.texto)}"><ul></ul><div class="aro-centro" data-aro-centro data-x="${aro.X}"><b>${escapar(t('aroCrear'))}</b><small class="aro-donde">${escapar(t('aroCrearDonde', { que: c.etiqueta ?? '', de: c.de ?? '' }))}</small><div class="aro-edicion">${input}${crear}</div></div></div></div>`;
  }
  const edicion = c?.editando
    ? `<div class="aro-edicion">${htmlOpciones(c.opciones5, c.pv5, aro.X, 'opciones opciones-arriba')}<input class="campo-input" data-campo="${c.pv}" data-x="${aro.X}" value="${attr(c.valor ?? '')}" aria-label="${attr(c.etiqueta ?? '')}" autocomplete="off">${htmlOpciones(c.opciones0, c.pv, aro.X, 'opciones opciones-abajo')}</div>`
    : '';
  return `<div class="aro-fondo" data-cerrar><div class="aro${c?.editando ? ' editando' : ''}"${nodo('aro')} data-x="${aro.X}" role="dialog" aria-label="${attr(t('aroDe', { que: aro.texto }))}"><ul>${huecos}</ul><div class="aro-centro" data-aro-centro data-x="${aro.X}" title="${attr(t('aroCentroTitulo'))}">${htmlIconoPropio(aro)}<b>${escapar(aro.texto)}</b>${edicion}</div></div></div>`;
}

/** Un valor en crudo como texto de input (una lista o una décupla, en JSON). */
const valorInput = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** El valor que enseña el input de un parámetro: el legible; un instante, en la forma que entiende un input de fecha y hora. */
function valorDeInput(c) {
  if (c.valor === null || c.valor === undefined) return '';
  if (c.tipo === 'instant' && typeof c.valor === 'string') return c.valor.slice(0, 16);
  return c.legible ?? valorInput(c.valor);
}

/**
 * El formulario generado desde la plantilla de transacción: cada parámetro con su etiqueta, ayuda, tipo y validación.
 * El input enseña el valor legible (el crudo va en data-crudo, y en un desplegable «ver en BTML»); al enviar, la app lee
 * lo escrito con contrato.desdeLegible en los tipos simples (data-simple) y, si no se tocó, manda el crudo. Un parámetro con
 * valores posibles (sus `opciones`, de contrato.opciones) lleva delante un <select> con ellos y «otro…»: elegir uno lo pone
 * en el input (oculto); «otro…» lo destapa para escribir (gestos.js, data-otro-de).
 */
function htmlFormulario(f) {
  if (!f) return '';
  // La cara de quien decide: la etiqueta, el desplegable de valores posibles y el input; el tipo, la fórmula de validación y el
  // BTML en crudo van al reverso (VG 14-11, #89), que se abre a propósito.
  const campo = (c) => {
    const id = 'param-' + c.nombre.replace(/\W+/g, '-');
    const tipoInput = c.tipo === 'number' ? 'number' : c.tipo === 'instant' ? 'datetime-local' : 'text';
    const valor = valorDeInput(c);
    const crudo = c.valor === null || c.valor === undefined ? '' : JSON.stringify(c.valor);
    // Con valores posibles (contrato.opciones), un desplegable; «otro…» destapa el input (que es el que se envía).
    const opciones = c.opciones ?? [];
    const crudoTexto = c.valor === null || c.valor === undefined || typeof c.valor === 'object' ? null : String(c.valor);
    const elegida = opciones.find((o) => o.valor === crudoTexto || o.valor === valor) ?? null;
    const otro = !elegida && valor !== '';
    // Sin valor, una opción en blanco (elegida); lo requerido lo pide el desplegable (el input, oculto, no se puede enfocar).
    const select = opciones.length
      ? `<select class="param-opciones" data-otro-de="${id}" aria-label="${attr(c.etiqueta)}"${c.requerido ? ' required' : ''}>${elegida || otro ? '' : '<option value="" selected></option>'}${opciones.map((o) => `<option value="${attr(o.valor)}"${o === elegida ? ' selected' : ''}>${escapar(o.texto)}</option>`).join('')}<option value="${attr(t('otro'))}" data-otro${otro ? ' selected' : ''}>${escapar(t('otro'))}</option></select>`
      : '';
    const valorDelInput = valor; // el legible, como siempre (el crudo en data-crudo); elegir otra opción pone su valor
    return `<div class="campo ${c.falta ? 'falta' : ''}"><label for="${id}">${retocable(c.etiqueta, c.retocar?.etiqueta)}${c.requerido ? ` <abbr title="${attr(t('requerido'))}">*</abbr>` : ''}</label>
      ${select}<input id="${id}" name="${attr(c.nombre)}" type="${tipoInput}" ${tipoInput === 'number' ? 'step="any"' : ''} value="${attr(valorDelInput)}" ${c.requerido && !opciones.length ? 'required' : ''} data-tipo="${attr(c.tipo)}" data-etiqueta="${attr(c.etiqueta)}" data-simple="${c.simple ? 1 : 0}" data-crudo="${attr(crudo)}" data-legible="${attr(valorDelInput)}" data-validacion="${attr(c.validacion ?? '')}" title="${attr(c.ayuda)}" autocomplete="off"${opciones.length && !otro ? ' hidden' : ''}>
      <small class="ayuda">${retocable(c.ayuda, c.retocar?.ayuda)}</small></div>`;
  };
  // El reverso de un campo: su tipo, su fórmula de validación y el valor en BTML.
  const campoReverso = (c) => {
    const crudo = c.valor === null || c.valor === undefined ? '' : JSON.stringify(c.valor);
    return `<li class="campo-reverso"><b>${escapar(c.etiqueta)}</b> <small>${escapar(t('reversoTipo'))} <code>${escapar(c.tipo)}</code></small>${c.validacion ? ` <small>${escapar(t('reversoFormula'))} <code>${escapar(c.validacion)}</code></small>` : ''}${crudo ? `<details class="btml"><summary>${t('verEnBtml')}</summary><code>${escapar(crudo)}</code></details>` : ''}</li>`;
  };
  // A la vista, solo lo obligatorio; lo opcional, tras «más».
  // Al ejecutar (#89), solo lo que falta por decidir: lo que ya viene dado queda recogido tras «ya resuelto» (sus inputs siguen, para enviarse).
  const aparte = f.ejecucion ? (c) => !(c.requerido && c.falta) : (c) => !c.requerido;
  const opcionales = f.campos.filter(aparte);
  const campos = f.campos.filter((c) => !aparte(c)).map(campo).join('')
    + (opcionales.length ? `<details class="mas-parametros"><summary title="${attr(t(f.ejecucion ? 'yaResueltoTitulo' : 'masParametrosTitulo'))}">${tr(f.ejecucion ? 'yaResuelto' : 'masParametros')} · ${opcionales.length}</summary>${opcionales.map(campo).join('')}</details>` : '');
  const motivos = f.motivos?.length ? `<ul class="motivos" role="alert">${f.motivos.map((m) => `<li>${retocable(m.mensaje, m.retocar)}</li>`).join('')}</ul>` : '';
  const resultado = f.resultado ? `<p class="exito" role="status">${escapar(f.resultado)}</p>` : '';
  const reverso = Boolean(f.reverso);
  const pie = reverso
    ? `<button type="button"${nodo('control')} data-voltear-formulario title="${attr(t('formularioVolverTitulo'))}">${t('formularioVolver')}</button>`
    : f.ejecucion ? `<button type="submit"${atributosDelBoton(f.ejecucion.boton)}>${f.animado && f.ejecucion.boton?.estado === 'efectos' ? '<span class="capa capa-efectos capa-ejecutar" aria-hidden="true"></span>' : ''}${tr('ejecutar')}</button>` : `<button type="submit">${tr(f.lectura ? 'leer' : f.camino ? 'darElPaso' : 'lanzar')}</button>`;
  return `<div class="formulario-fondo" data-cerrar><form class="formulario" data-formulario${nodo('formulario')} data-x="${f.X}" data-accion="${attr(f.accion)}"${reverso ? ' data-reverso' : ''} aria-label="${attr(f.nombre)}">
    <header><h2>${retocable(f.nombre, f.retocar)}</h2><button type="button" class="voltear-formulario" data-voltear-formulario aria-pressed="${reverso}" aria-label="${attr(t('formularioVoltear'))}" title="${attr(t('formularioVoltear'))}">↻</button><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    <div class="cara cara-anverso"${reverso ? ' hidden' : ''}>
    ${f.ofrecida ? '' : `<p class="aviso">${tr('noSeOfrece')}</p>`}
    ${htmlBotonApagado(f.ejecucion)}${campos}${htmlEjecucion(f.ejecucion)}${motivos}${resultado}
    </div>
    <div class="cara cara-reverso"${reverso ? '' : ' hidden'}>
      <h3>${tr('reversoTitulo')}</h3><ul class="campos-reverso">${f.campos.map(campoReverso).join('')}</ul>${htmlEjecucionReverso(f.ejecucion)}
    </div>
    <footer>${reverso ? '' : htmlQuienGuarda(f.quienGuarda)}${pie}</footer>
  </form></div>`;
}

/**
 * Los ajustes de la guía dentro del formulario de la configuración: los campos de la plantilla de ajustes de la época
 * (sin `name`: la app los lee por data-guia-campo y los escribe como su propio registro en el 9 del alta) y, aparte, la
 * clave de la API (data-clave-ia: solo para la vía directa; vive en este navegador, nunca en el eje).
 */
function htmlAjustesGuia(g) {
  if (!g) return '';
  const campos = g.campos.map((c) => `<div class="campo"${nodo('control')}><label for="guia-${c.pv}">${escapar(c.etiqueta)}</label><input id="guia-${c.pv}" data-guia-campo="${attr(c.clave)}" type="text" value="${attr(c.valor)}" placeholder="${attr(c.marcador)}" title="${attr(c.ayuda)}" autocomplete="off"><small class="ayuda">${escapar(c.ayuda)}</small></div>`).join('');
  const clave = `<div class="campo"${nodo('control')}><label for="guia-clave-ia">${t('guiaClaveIa')}</label><input id="guia-clave-ia" data-clave-ia type="password" value="${attr(g.claveIa ?? '')}" title="${attr(t('guiaClaveIaAyuda'))}" autocomplete="off" spellcheck="false"><small class="ayuda">${escapar(t('guiaClaveIaAyuda'))}</small></div>`;
  return `<fieldset class="guia-ajustes"><legend>${t('guiaAjustes')}</legend>${campos}${clave}</fieldset>`;
}

/**
 * Los ajustes del exterior dentro del formulario de la configuración (docs/CONTRATO.md §16.2 bis, decisión #58): los campos de
 * la plantilla «exterior settings» de la época (relé, archivos, sello; sin `name`: la app los lee por data-exterior-campo y los
 * escribe como su propio registro en el 9 del alta), en un desplegable como el de la guía. Una dirección vacía deja ese camino
 * sin usar y quita la que había (el registro solo lleva los ajustes que tienen valor, VG 13-11, #77).
 */
function htmlAjustesExterior(g) {
  if (!g) return '';
  const campos = g.campos.map((c) => `<div class="campo"${nodo('control')}><label for="exterior-${c.pv}">${escapar(c.etiqueta)}</label><input id="exterior-${c.pv}" data-exterior-campo="${attr(c.clave)}" type="text" value="${attr(c.valor)}" placeholder="${attr(c.marcador)}" title="${attr(c.ayuda)}" autocomplete="off" spellcheck="false"><small class="ayuda">${escapar(c.ayuda)}</small></div>`).join('');
  return `<details class="exterior-ajustes"${nodo('control')}${g.campos.some((c) => c.valor) ? ' open' : ''}><summary>${t('exteriorAjustes')}</summary><fieldset class="guia-ajustes">${campos}</fieldset></details>`;
}

/**
 * El desplegable «segundo factor» de la configuración (VG 12/13-11, #66, #70; personaje del 0 → 2): los criterios que ya
 * tengo y los campos de la plantilla «second factor» (familia o serie, cantidad, titular entre mis cosas), sin `name`: la
 * app los lee por data-segundo-factor-campo y, si la familia está escrita, lanza la plantilla sobre mi alta.
 */
function htmlSegundoFactor(sf) {
  if (!sf) return '';
  const control = (c) => (c.tipo === 'identity' && c.opciones?.length
    ? `<select id="segundo-factor-${attr(c.nombre)}" data-segundo-factor-campo="${attr(c.nombre)}" title="${attr(c.ayuda)}">${c.opciones.map((o) => `<option value="${attr(o.valor)}"${String(o.valor) === String(c.valor ?? '') ? ' selected' : ''}>${escapar(o.texto)}</option>`).join('')}</select>`
    : `<input id="segundo-factor-${attr(c.nombre)}" data-segundo-factor-campo="${attr(c.nombre)}" type="text" value="${attr(c.valor ?? '')}" title="${attr(c.ayuda)}" autocomplete="off" spellcheck="false">`);
  const campos = sf.campos.map((c) => `<div class="campo"${nodo('control')}><label for="segundo-factor-${attr(c.nombre)}">${escapar(c.etiqueta)}</label>${control(c)}<small class="ayuda">${escapar(c.ayuda)}</small></div>`).join('');
  const actuales = sf.criterios.length ? `<ul class="segundo-factor-actuales">${sf.criterios.map((c) => `<li>${escapar(t('segundoFactorCriterio', { familias: c.familias.join(' '), cantidad: c.cantidad, titular: c.titular }))}</li>`).join('')}</ul>` : `<p class="ayuda">${escapar(t('segundoFactorNinguno'))}</p>`;
  return `<details class="segundo-factor"${nodo('control')}${sf.criterios.length ? ' open' : ''}><summary>${t('segundoFactor')}</summary><p class="ayuda">${escapar(t('segundoFactorAyuda'))}</p>${actuales}<fieldset class="guia-ajustes">${campos}</fieldset></details>`;
}

/** Los ajustes de preferencias que son de la guía y el exterior (el 9 de mi alta) y no de mis criterios: el servidor y el eje compartido. */
const DE_LA_PARTE_9 = new Set(['sync url', 'sync ledger']);

/**
 * El formulario de la configuración, generado desde la plantilla «preferences»: cada campo por su clave, con su
 * etiqueta en el idioma. En una cuenta (`claveLectura` es una cadena, quizá vacía), además el campo aparte de la clave
 * de lectura del libro compartido: sin `name` (no entra en el registro de preferencias: la app lo lee por
 * data-clave-lectura y lo guarda en el almacén local de la cuenta, nunca en el eje).
 */
export function htmlConfiguracion(p, { motivos = [], claveLectura, guia, exterior, segundoFactor, parte = '2', retocar = null, reglas = false } = {}) {
  if (!p) return '';
  const modo = retocar?.activo ? { idioma: retocar.idioma } : null; // el modo «retocar textos» (A20), si está encendido
  // Un campo con opciones (el modelo, #4) es un desplegable con ellas; los demás, texto.
  const control = (c) => (c.opciones
    ? `<select id="pref-${c.pv}" name="${attr(c.clave)}" title="${attr(c.ayuda)}">${c.opciones.map((o) => `<option value="${attr(o.valor)}"${o.valor === c.valor ? ' selected' : ''}>${escapar(o.texto)}</option>`).join('')}</select>`
    : `<input id="pref-${c.pv}" name="${attr(c.clave)}" type="text" value="${attr(valorInput(Array.isArray(c.valor) ? c.valor.join(' ') : c.valor))}" placeholder="${attr(c.marcador.join(' '))}" title="${attr(c.ayuda)}" autocomplete="off">`);
  // Separada por posición (VG 14-11, #92): el 2 = mis criterios y preferencias (idioma, sobrio o animado, tamaños, segundo factor); el 9 =
  // guía y exterior (servidor y eje compartido, clave de lectura, la guía, relé, archivos, sello, observadores, confirmaciones).
  const del9 = parte === '9';
  const esDelNueve = (c) => DE_LA_PARTE_9.has(c.clave);
  const campos = p.campos.filter((c) => esDelNueve(c) === del9).map((c) => `<div class="campo"><label for="pref-${c.pv}">${escapar(c.etiqueta)}</label>${control(c)}<small class="ayuda">${escapar(c.ayuda)}</small></div>`).join('')
    + (del9 && typeof claveLectura === 'string' ? `<div class="campo"><label for="pref-clave-lectura">${t('claveLectura')}</label><input id="pref-clave-lectura" data-clave-lectura type="password" value="${attr(claveLectura)}" title="${attr(t('claveLecturaAyuda'))}" autocomplete="off" spellcheck="false"><small class="ayuda">${escapar(t('claveLecturaAyuda'))}</small></div>` : '')
    + (del9 ? htmlAjustesGuia(guia) + htmlAjustesExterior(exterior) : htmlSegundoFactor(segundoFactor) + htmlRetocarTextos(retocar) + htmlEntradaReglas(reglas));
  return `<div class="formulario-fondo" data-cerrar><form class="formulario configuracion"${nodo('configuracion')} data-configuracion data-parte="${del9 ? 9 : 2}" aria-label="${attr(t(del9 ? 'ajustesGuiaExterior' : 'configuracionCriterios'))}">
    <header><h2><span class="numero">${del9 ? 9 : 2}</span> ${tr(del9 ? 'ajustesGuiaExterior' : 'configuracionCriterios', {}, modo)}</h2><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    <p class="ayuda">${tr(del9 ? 'configuracionAyuda9' : 'configuracionAyuda2', {}, modo)}</p>
    ${campos}${motivos.length ? `<ul class="motivos" role="alert">${motivos.map((m) => `<li>${escapar(m.mensaje ?? m)}</li>`).join('')}</ul>` : ''}
    <footer><button type="submit">${tr('guardar', {}, modo)}</button></footer>
  </form></div>`;
}

/**
 * «Retocar los textos de este libro» en la configuración (A20 escalón 1), solo para quien puede retocar (`r`, de
 * carta.textosRetocados más `activo`; sin él, nada: ni botón ni rastro): el interruptor llano del modo (sin `name`: no
 * entra en el registro de preferencias; la app lo lee por data-retocar-modo) y la lista «Textos retocados»: los vigentes
 * del libro con su clave en pequeño, el idioma, el texto, quién y cuándo, y «volver al texto original» en cada uno.
 */
function htmlRetocarTextos(r) {
  if (!r) return '';
  const lista = r.lista?.length
    ? `<ul class="retoques-lista">${r.lista.map((x) => `<li class="retoque-item"><small class="retoque-clave"><code>${escapar(x.clave)}</code> · ${escapar(x.idioma)}</small> <span class="retoque-texto">${escapar(x.texto)}</span> <small class="retoque-quien">${escapar(t('retoqueQuienCuando', { quien: x.quien ?? '', cuando: x.cuando ?? '' }))}</small> <button type="button"${nodo('control')} data-retoque-original data-clave="${attr(x.clave)}" data-idioma="${attr(x.idioma)}">${escapar(t('retoqueOriginal'))}</button></li>`).join('')}</ul>`
    : `<p class="ayuda">${escapar(t('retoquesNinguno'))}</p>`;
  return `<fieldset class="retocar-textos"${nodo('control')}><legend>${escapar(t('retoquesLista'))}</legend><label class="retocar-modo"><input type="checkbox" data-retocar-modo${r.activo ? ' checked' : ''}> ${escapar(t('retocarModo'))}</label><small class="ayuda">${escapar(t('retocarModoAyuda'))}</small>${lista}</fieldset>`;
}

/**
 * La hoja «retocar un texto» (A20 escalón 1; carta.retoqueDeTexto), pensada para el móvil: el texto de hoy en un campo
 * editable, el idioma en que se retoca (el de quien mira, y los demás del libro), el texto de nacimiento en gris debajo,
 * los huecos {…} que hay que conservar, lo que cuesta guardarlo (en T, como cualquier acción) y «volver al texto
 * original» si está retocado. Todo texto, escapado: el retoque es un dato, nunca HTML ni estilo.
 */
export function htmlRetoque(r) {
  if (!r) return '';
  const idiomas = r.idiomas.map((i) => `<option value="${attr(i)}"${i === r.idioma ? ' selected' : ''}>${escapar(i)}</option>`).join('');
  const huecos = r.huecos?.length ? `<p class="ayuda retoque-huecos">${escapar(t('retoqueHuecos', { huecos: r.huecos.join(' ') }))}</p>` : '';
  const coste = r.coste ? `<p class="retoque-coste"><small>${escapar(t('retoqueCoste', { t: textoDeSegundos(r.coste.exigido), paga: textoDePiezas(r.coste.denominacion) }))}</small></p>` : '';
  const avisos = [...(r.aviso ? [r.aviso] : []), ...(r.motivos ?? []).map((m) => m?.mensaje ?? m)];
  const original = r.vigente ? `<button type="button"${nodo('control')} data-retoque-original data-clave="${attr(r.clave)}" data-idioma="${attr(r.idioma)}">${escapar(t('retoqueOriginal'))}</button>` : '';
  return `<div class="formulario-fondo" data-cerrar><form class="formulario retoque"${nodo('formulario')} data-retoque data-clave="${attr(r.clave)}" aria-label="${attr(t('retoqueTitulo'))}">
    <header><h2>${escapar(t('retoqueTitulo'))}</h2><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    <p class="retoque-clave"><small><code>${escapar(r.clave)}</code></small></p>
    <div class="campo"><label for="retoque-idioma">${escapar(t('retoqueIdioma'))}</label><select id="retoque-idioma" data-retoque-idioma>${idiomas}</select></div>
    <div class="campo"><label for="retoque-texto">${escapar(t('retoqueTexto'))}</label><textarea id="retoque-texto" data-retoque-texto rows="3" autocomplete="off"${r.existe ? '' : ' disabled'}>${escapar(r.texto)}</textarea></div>
    ${huecos}<p class="retoque-nacimiento"><small>${escapar(t('retoqueNacimiento'))}</small> <span>${escapar(r.nacimiento ?? '')}</span></p>${coste}
    ${avisos.length ? `<ul class="motivos" role="alert">${avisos.map((m) => `<li>${escapar(m)}</li>`).join('')}</ul>` : ''}
    <footer>${original}<button type="submit"${r.existe ? '' : ' disabled'}>${escapar(t('guardar'))}</button></footer>
  </form></div>`;
}

// ---------- «Reglas del libro» y «Ajustes de este elemento» (A21 y A23, tramo 2, paso 4; carta/reglas.js) ----------

/** Una parte de 0 a 1 en por ciento, redondeada: «50 %». */
const porciento = (x) => (Number.isFinite(x) ? Math.round(x * 100) + ' %' : '—');
/** El coste de una acción como lo dice el formulario de cualquier acción: «cuesta 5 min de T (5 min)». */
const textoDeCoste = (c) => (c ? t('reglasCoste', { t: textoDeSegundos(c.exigido), paga: textoDePiezas(c.denominacion) }) : '');
/** La entrada a «Reglas del libro» (desde la configuración y desde el génesis): un botón llano, solo si el libro tiene gobierno. */
const htmlEntradaReglas = (si) => (si ? `<p class="reglas-entrada"><button type="button"${nodo('control')} data-reglas-abrir title="${attr(t('reglasAbrirTitulo'))}">${escapar(t('reglasAbrir'))}</button></p>` : '');

/**
 * La vista «Reglas del libro» (carta/reglas.js), para el móvil: una hoja como la de cualquier formulario. `v`: { lista
 * (reglasDelLibro), cambio (cambioDelLibro, o null), proponer (el formulario de proponer, o null), guardian (con la sesión
 * del guardián: «poner en vigor» lo hace sola la carta), aviso, motivos, exito }. Todo dato va escapado: un título, una
 * explicación o una pieza escrita nunca entran como HTML. En pantalla no sale «época».
 */
export function htmlReglas(v) {
  if (!v?.lista) return '';
  const avisos = [...(v.aviso ? [v.aviso] : []), ...(v.motivos ?? []).map((m) => m?.mensaje ?? m)];
  const mensajes = (avisos.length ? `<ul class="motivos" role="alert">${avisos.map((m) => `<li>${escapar(m)}</li>`).join('')}</ul>` : '') + (v.exito ? `<p class="exito" role="status">${escapar(v.exito)}</p>` : '');
  const cuerpo = v.salida ? htmlSalida(v.salida) : v.proponer ? htmlProponerCambio(v.proponer) : v.cambio ? htmlCambio(v.cambio, v) : htmlListaDeCambios(v.lista) + htmlEntradaSalida(v.puedeSalir);
  return `<div class="formulario-fondo" data-cerrar><section class="formulario reglas"${nodo('reglas')} role="dialog" aria-label="${attr(t('reglasTitulo'))}">
    <header><h2>${escapar(t('reglasTitulo'))}</h2><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    ${v.cambio || v.proponer || v.salida ? `<p class="reglas-volver"><button type="button" class="enlace"${nodo('control')} data-reglas-volver>${escapar(t('reglasVolver'))}</button></p>` : ''}
    ${mensajes}${cuerpo}
    <p class="reglas-pie" data-reglas-pie><small>${escapar(t('reglasPie'))}</small></p>
  </section></div>`;
}

/** La versión vigente y la lista de cambios, lo más nuevo arriba, cada uno con su estado en llano y su apoyo. */
function htmlListaDeCambios(l) {
  if (!l.gobierno) return `<p class="ayuda">${escapar(t('reglasSinGobierno'))}</p>`;
  const version = l.version.cambios ? t(l.version.cambios === 1 ? 'reglasVersionUno' : 'reglasVersion', { n: l.version.cambios, desde: l.version.desde ?? '' }) : t('reglasVersionNacimiento');
  const items = l.cambios.map((c) => `<li class="reglas-cambio" data-estado="${attr(c.estado)}"><button type="button"${nodo('control')} data-reglas-cambio="${attr(c.id)}"><span class="reglas-cambio-titulo">${escapar(c.titulo)}</span> <small class="reglas-estado" data-estado="${attr(c.estado)}">${escapar(t('reglasEstado_' + c.estado))}</small>${c.estado === 'propuesto' && c.apoyo !== null ? ` <small class="reglas-apoyo-corto">${escapar(t('reglasApoyoCorto', { apoyo: porciento(c.apoyo) }))}</small>` : ''}<small class="reglas-quien">${escapar(t('reglasPropuso', { quien: c.quien, cuando: c.cuando }))} · ${escapar(t('reglasClase_' + c.claseLlana))}</small></button></li>`).join('');
  return `<p class="reglas-version">${escapar(version)}</p>
    ${l.cambios.length ? `<ol class="reglas-cambios">${items}</ol>` : `<p class="ayuda">${escapar(t('reglasNingunCambio'))}</p>`}
    ${l.puedeProponer ? `<footer><button type="button"${nodo('control')} data-reglas-proponer>${escapar(t('reglasProponer'))}</button></footer>` : ''}`;
}

/** Una pieza que toca un cambio: un parámetro con su valor de hoy y el nuevo; una regla, una acción o un texto, con su escrito desplegable. */
function htmlPiezaDeCambio(p, enVigor) {
  if (p.tipo === 'parametro') {
    const [hoy, queda] = enVigor ? ['reglasAntes', 'reglasAhora'] : ['reglasHoy', 'reglasQueda'];
    return `<li class="reglas-pieza" data-tipo="parametro" data-posicion="${attr(p.posicion)}">${p.nombre ? `<b>${escapar(p.nombre)}</b> ` : ''}<small><code>${escapar(p.posicion)}</code></small><br><span class="reglas-valor-hoy"><small>${escapar(t(hoy))}</small> ${escapar(p.hoy || '—')}</span> → <span class="reglas-valor-queda"><small>${escapar(t(queda))}</small> ${escapar(p.queda || '—')}</span></li>`;
  }
  const hoy = p.hoy ? `<details><summary>${escapar(t('reglasPiezaHoy'))}</summary><pre>${escapar(p.hoy)}</pre></details>` : `<small>${escapar(t('reglasPiezaNoHay'))}</small>`;
  return `<li class="reglas-pieza" data-tipo="${attr(p.tipo)}"><b>${escapar(t('reglasPieza_' + p.tipo, { nombre: p.nombre }))}</b> ${hoy}<details><summary>${escapar(t('reglasPiezaNueva'))}</summary><pre>${escapar(p.queda)}</pre></details></li>`;
}

/** La barra de apoyo: «support» frente al umbral de su clase, lo que falta, quién cuenta y quién apoya y con cuánto. */
function htmlBarraDeApoyo(b, estado) {
  const apoyos = b.apoyos.length
    ? `<ul class="reglas-apoyos">${b.apoyos.map((a) => `<li${a.enLista ? '' : ' data-no-cuenta'}>${escapar(t(a.enLista ? 'reglasApoyoDe' : 'reglasApoyoNoCuenta', { quien: a.quien, parte: porciento(a.parte) }))}</li>`).join('')}</ul>`
    : `<p class="ayuda">${escapar(t('reglasNadieApoya'))}</p>`;
  const falta = b.falta > 0 ? t('reglasFalta', { falta: porciento(b.falta) }) : t('reglasLlega');
  const barra = estado === 'propuesto' ? `<div class="reglas-barra" style="--apoyo:${fraccionCss(b.apoyo)};--umbral:${fraccionCss(b.umbral)}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(fraccionCss(b.apoyo) * 100)}"><span class="reglas-barra-apoyo"></span><span class="reglas-barra-umbral"></span></div>` : '';
  return `<div class="reglas-apoyo"><h3>${escapar(t('reglasApoyoTitulo'))}</h3>${barra}<p class="reglas-apoyo-linea">${escapar(t('reglasApoyo', { apoyo: porciento(b.apoyo), umbral: porciento(b.umbral) }))}${estado === 'propuesto' ? ' · ' + escapar(falta) : ''}</p>
    <p class="ayuda"><small>${escapar(t('reglasCuentan', { nombres: b.nombres.map((n) => n.quien || n.nombre).join(', ') }))}</small></p>
    <h4>${escapar(t('reglasQuienApoya'))}</h4>${apoyos}${b.avisoFueraDeLista ? `<p class="aviso reglas-fuera-de-lista">${escapar(t('reglasFueraDeLista'))}</p>` : ''}</div>`;
}

/** El detalle de un cambio: qué cambia, la barra, las acciones con su coste, la firmeza de la aprobación y «salir a un libro hijo». */
function htmlCambio(c, v) {
  const enVigor = c.estado === 'enVigor';
  const piezas = c.piezas.length ? `<ul class="reglas-piezas">${c.piezas.map((p) => htmlPiezaDeCambio(p, enVigor)).join('')}</ul>` : `<p class="ayuda">${escapar(t('reglasSinPiezas'))}</p>`;
  const aviso = c.aviso ? `<ul class="motivos" role="alert"><li>${escapar(t('reglasNoSeFunde'))} ${escapar(c.aviso)}</li></ul>` : '';
  // «Poner en vigor» con la sesión del guardián lo hace sola la carta (con su diálogo); con clave en el navegador, un botón.
  const acciones = c.acciones.filter((a) => !(a.que === 'poner' && v.guardian)).map((a) => `<li><button type="button"${nodo('accion')} data-reglas-actuar="${attr(a.que)}" data-id="${attr(c.id)}">${escapar(t('reglasAccion_' + a.que))}</button>${a.coste ? ` <small class="reglas-coste">${escapar(textoDeCoste(a.coste))}</small>` : ''}</li>`).join('');
  const f = c.firmeza;
  const firmeza = f && (c.estado === 'aprobado' || enVigor)
    ? `<div class="reglas-firmeza"><h3>${escapar(t('reglasFirmezaTitulo'))}</h3><p>${escapar(f.pedido ? t('reglasFirmezaPide', { nivel: textoCapa(f.pedido) }) : t('reglasFirmezaSinNivel'))}</p>${f.capas ? htmlFirmeza(f) : ''}${c.estado === 'aprobado' ? `<p>${escapar(t(f.llega ? 'reglasFirmezaLlega' : 'reglasFirmezaNoLlega'))}${f.llega && v.guardian ? ' ' + escapar(t('reglasPonerSola')) : ''}</p>` : ''}</div>`
    : '';
  const salir = c.salir?.ofrecida && !enVigor && c.estado !== 'retirado'
    ? `<p class="reglas-salir">${escapar(t('reglasSalir'))} <button type="button" class="enlace"${nodo('accion')} data-sitio-lanzar="${attr(c.salir.accion)}" data-x="${attr(c.salir.X)}" data-valores="{}">${escapar(t('reglasSalirBoton'))}</button></p>`
    : '';
  return `<article class="reglas-detalle" data-id="${attr(c.id)}" data-estado="${attr(c.estado)}">
    <h3 class="reglas-cambio-titulo">${escapar(c.titulo)}</h3>
    <p class="reglas-explicacion">${escapar(c.explicacion)}</p>
    <p class="reglas-quien"><small>${escapar(t('reglasPropuso', { quien: c.quien, cuando: c.cuando }))} · ${escapar(t('reglasClase_' + c.claseLlana))}</small></p>
    <p class="reglas-estado-linea"><small class="reglas-estado" data-estado="${attr(c.estado)}">${escapar(t('reglasEstado_' + c.estado))}</small></p>
    <h3>${escapar(t('reglasQueCambia'))}</h3>${piezas}${aviso}
    ${htmlBarraDeApoyo(c.barra, c.estado)}
    ${acciones ? `<ul class="reglas-acciones">${acciones}</ul>` : ''}
    ${firmeza}${salir}
  </article>`;
}

/**
 * «Proponer un cambio» (carta/reglas.js proponer): título y explicación, qué parámetro (la lista de los que se pueden mover,
 * con el de hoy) y cómo queda (parte del valor de hoy), la clase que le toca y, detrás de «avanzado», pegar la pieza escrita.
 * `p`: { parametros, posicion, valores: { titulo, explicacion, valor, pieza }, clase (corriente | gobierno | null), avanzado }.
 */
function htmlProponerCambio(p) {
  const val = p.valores ?? {};
  const elegido = p.parametros.find((x) => x.posicion === p.posicion) ?? null;
  const marca = (x) => (x.suelo ? ' · ' + t('reglasMarcaSuelo') : x.gobierno ? ' · ' + t('reglasMarcaGobierno') : '');
  const opciones = `<option value=""${elegido ? '' : ' selected'}></option>` + p.parametros.map((x) => `<option value="${attr(x.posicion)}"${x === elegido ? ' selected' : ''}>${escapar((x.nombre ? x.nombre + ' · ' : '') + x.posicion.replace(/^epoch\./, '') + ' = ' + x.texto.slice(0, 40) + marca(x))}</option>`).join('');
  const valor = val.valor ?? elegido?.texto ?? '';
  return `<form class="reglas-proponer"${nodo('formulario')} data-reglas-propuesta>
    <p class="ayuda">${escapar(t('reglasProponerAyuda'))}</p>
    <div class="campo"><label for="reglas-titulo">${escapar(t('reglasCampoTitulo'))}</label><input id="reglas-titulo" name="titulo" type="text" value="${attr(val.titulo ?? '')}" autocomplete="off"></div>
    <div class="campo"><label for="reglas-explicacion">${escapar(t('reglasCampoExplicacion'))}</label><textarea id="reglas-explicacion" name="explicacion" rows="2" autocomplete="off">${escapar(val.explicacion ?? '')}</textarea></div>
    <div class="campo"><label for="reglas-posicion">${escapar(t('reglasCampoQue'))}</label><select id="reglas-posicion" name="posicion" data-reglas-posicion>${opciones}</select></div>
    <div class="campo"><label for="reglas-valor">${escapar(t('reglasCampoValor'))}</label><input id="reglas-valor" name="valor" type="text" value="${attr(valor)}" autocomplete="off"${elegido ? '' : ' disabled'}>${elegido ? `<small class="ayuda">${escapar(t('reglasCampoValorAyuda', { hoy: elegido.texto }))}</small>` : ''}</div>
    ${p.clase ? `<p class="reglas-clase">${escapar(t('reglasClaseQueToca', { clase: t('reglasClase_' + p.clase) }))}</p>` : ''}
    <details class="reglas-avanzado"${p.avanzado || val.pieza ? ' open' : ''}><summary>${escapar(t('reglasAvanzado'))}</summary><p class="ayuda"><small>${escapar(t('reglasAvanzadoAyuda'))}</small></p><textarea name="pieza" rows="6" spellcheck="false" autocomplete="off">${escapar(val.pieza ?? '')}</textarea></details>
    <footer><button type="submit">${escapar(t('reglasProponerBoton'))}</button></footer>
  </form>`;
}

// ---------- «Irme con lo mío» (encargo «carta: irme con lo mío y el puente»; carta/puente.js salidaDe) ----------

/** El coste de un paso como lo dice el formulario de cualquier acción (para la confirmación de la app). */
export const textoDelCoste = (c) => textoDeCoste(c);

/** La entrada «Irme con lo mío» en la lista de «Reglas del libro»: para quien tiene alta en este libro. */
const htmlEntradaSalida = (si) => (si ? `<p class="reglas-salida-entrada"><button type="button" class="enlace"${nodo('control')} data-salida-abrir title="${attr(t('salidaAbrirTitulo'))}">${escapar(t('salidaAbrir'))}</button></p>` : '');

/** El texto de un paso de la salida: qué hace y, si lo nombra, de qué serie («Declarar aquí 10 P sobre Ana»). */
export const textoDelPasoDeSalida = (p, nombre) => t('salidaPaso_' + p.que, { serie: p.texto ?? p.serie ?? '', nombre: nombre ?? '' });

/**
 * «Irme con lo mío» (carta/puente.js salidaDe): lo que me llevo y lo que no (con su causa, tal como la da el plan), con qué
 * reglas nace el libro nuevo (las vigentes o las de antes del último cambio), los pasos en orden con su estado (la espera,
 * con su frase tal cual), un solo botón que firma el primer paso «listo» con su coste a la vista, la frase del sello y lo
 * que va aparte. `s`: { vista, coste (del paso siguiente), nombre (el del libro nuevo), nuevo ({ nombre } si ya está),
 * sinCuenta, ocupado, buscando (el botón espera a saber si ya hay libro nuevo), bloqueado (lo hay y no se abre: el botón,
 * apagado, sin decir «firmando»; el motivo va en el aviso de la hoja) }. Todo dato va escapado.
 */
function htmlSalida(s) {
  const v = s.vista;
  if (!v) return s.error ? `<p class="aviso" role="alert" data-salida-error>${escapar(t('salidaNoSeLee', { motivo: s.error }))}</p>` : '';
  const lista = (xs, f) => `<ul class="salida-lista">${xs.map(f).join('')}</ul>`;
  const lleva = v.lleva.length ? lista(v.lleva, (x) => `<li data-serie="${attr(x.serie)}">${escapar(x.texto)}</li>`) : `<p class="ayuda">${escapar(t('salidaNada'))}</p>`;
  const noSeLleva = v.noSeLleva.length ? `<h3>${escapar(t('salidaNoSeLleva'))}</h3>${lista(v.noSeLleva, (x) => `<li data-serie="${attr(x.serie)}">${escapar(x.texto)} <small class="salida-causa">${escapar(x.causa)}</small></li>`)}` : '';
  const nacido = v.pasos.some((p) => p.que === 'genesis' && p.estado === 'hecho');
  const reglas = nacido ? `<p>${escapar(t('salidaPuntoFijo'))}</p>`
    : v.puntos.length > 1 ? `<p class="salida-puntos">${v.puntos.map((p) => `<button type="button"${nodo('control')} data-salida-punto="${attr(p)}" aria-pressed="${p === v.punto}">${escapar(t('salidaPunto_' + p))}</button>`).join(' ')}</p>`
      : `<p>${escapar(t('salidaPuntoElegido', { punto: t('salidaPunto_vigente').toLowerCase() }))}</p>`;
  const pasos = v.pasos.map((p) => `<li class="salida-paso" data-estado="${attr(p.estado)}" data-que="${attr(p.que)}"><span>${escapar(textoDelPasoDeSalida(p, s.nombre))}</span> <small>${escapar(t('salidaEnLibro_' + p.libro))}</small> · <small class="salida-estado">${escapar(t('salidaEstado_' + p.estado))}</small>${p.espera ? `<br><small class="salida-espera">${escapar(p.espera)}</small>` : ''}</li>`).join('');
  const todo = v.pasos.length && v.pasos.every((p) => p.estado === 'hecho');
  const siguiente = v.siguiente && !s.sinCuenta
    ? `<footer><button type="button"${nodo('accion')} data-salida-firmar ${s.ocupado || s.buscando || s.bloqueado ? 'disabled' : ''}>${escapar(s.buscando ? t('salidaBuscando') : s.ocupado ? t('salidaFirmando') : t('salidaFirmar', { n: v.siguiente.n }))}</button> <small class="reglas-coste">${escapar(v.siguiente.que === 'genesis' ? t('salidaGenesisSinCoste') : s.coste ? textoDeCoste(s.coste) : t('salidaSinCoste'))}</small></footer>`
    : '';
  return `<article class="salida"${nodo('reglas')} data-salida>
    <h3>${escapar(t('salidaAbrir'))}</h3>
    <p class="ayuda">${escapar(t('salidaAyuda'))}</p>
    <h3>${escapar(t('salidaLleva'))}</h3>${lleva}${noSeLleva}
    <h3>${escapar(t('salidaReglas'))}</h3>${reglas}
    <h3>${escapar(t('salidaPasos'))}</h3><ol class="salida-pasos">${pasos}</ol>
    ${todo ? `<p class="exito" role="status">${escapar(t('salidaTodoHecho'))}</p>` : ''}${s.nuevo ? `<p class="salida-nuevo">${escapar(t('salidaNuevo', { nombre: s.nuevo.nombre }))}</p>` : ''}
    <p class="salida-sello" data-salida-sello>${escapar(t('salidaSello'))}</p>
    ${v.sinSello ? `<p class="aviso" data-sin-sello="${attr(v.sinSello)}">${escapar(t('salidaSinSello_' + v.sinSello))}</p>` : ''}${s.sinCuenta ? `<p class="aviso">${escapar(t('salidaSinCuenta'))}</p>` : ''}
    ${siguiente}
    <h3>${escapar(t('salidaAparte'))}</h3><p class="salida-aparte" data-salida-aparte>${escapar(v.aparte)}</p>
    ${htmlEnlaceAlNuevo(s.enlace, s)}
    <p><button type="button" class="enlace"${nodo('control')} data-puente-abrir title="${attr(t('salidaIrAlPuenteTitulo'))}">${escapar(t('salidaIrAlPuente'))}</button></p>
  </article>`;
}

/**
 * En la salida, con el libro nuevo ya abierto: el enlace que cuenta, en este libro, hacia él (puente.enlaceAlNuevo). Hecho,
 * se dice; si no se puede (génesis que no se rehace, o no se ofrece), se dice por qué; si no, el botón con su coste.
 */
function htmlEnlaceAlNuevo(e, s) {
  if (!e) return '';
  if (e.hecho) return `<p class="salida-enlace" data-enlazado>${escapar(t('salidaEnlazado'))}</p>`;
  if (e.sinGenesis) return `<p class="aviso salida-enlace">${escapar(t('salidaSinGenesis'))}</p>`;
  if (!e.ofrecido) return `<p class="aviso salida-enlace">${escapar(t('salidaNoSeOfreceEnlace'))}</p>`;
  return `<p class="salida-enlace"><small>${escapar(t('salidaEnlazarAyuda', { coste: e.coste ? textoDeCoste(e.coste) : t('salidaSinCoste') }))}</small> <button type="button"${nodo('accion')} data-salida-enlazar ${s.ocupado || s.buscando ? 'disabled' : ''}>${escapar(t('salidaEnlazar'))}</button></p>`;
}

// ---------- el puente entre mis libros abiertos (encargo «carta: irme con lo mío y el puente»; carta/puente.js) ----------

/** «Puente»: en una línea de enlace con uno de mis libros (en «quién guarda esto»), abre la hoja del puente. */
const botonPuente = () => ` <button type="button" class="enlace"${nodo('control')} data-puente-abrir title="${attr(t('puenteAbrirTitulo'))}">${escapar(t('puenteAbrir'))}</button>`;

/** Un valor de una lectura en llano: un texto tal cual; lo demás, su JSON. Siempre se pinta escapado. */
const comoTexto = (x) => (typeof x === 'string' ? x : JSON.stringify(x));

/** Un enlace a uno de mis libros: su grado, si cuenta, sus claves, el fondo bloqueado por él y «traer de él» si se ofrece. */
function htmlEnlaceDelPuente(l) {
  const fondo = l.fondo.length ? t('puenteFondo', { lista: l.fondo.map((f) => t('puenteFondoDe', { cantidad: f.texto, quien: f.quienTexto || f.quien })).join(', ') }) : t('puenteSinFondo');
  const claves = l.nivelMasBajo === null ? t('puenteSinClaves') : t('puenteClaves', { n: l.claves, nivel: l.nivelMasBajo });
  // Sin claves de línea en el enlace no se trae nada («bringing needs the line keys of the book»): no se ofrece.
  const traer = l.traer && l.abierto && l.nivelMasBajo !== null ? ` <button type="button"${nodo('accion')} data-puente-traer-de="${attr(l.id)}">${escapar(t('puenteTraerDe', { libro: l.nombre }))}</button>` : '';
  return `<li class="puente-enlace" data-enlace="${attr(l.id)}" data-cuenta="${l.cuenta}">
    <span>${escapar(t('puenteEnlace', { libro: l.nombre, tipo: t('puenteTipo_' + l.tipo), quien: l.quienTexto || l.quien }))}</span>
    <br><small>${escapar(l.grado ? t('puenteGrado', { grado: l.grado }) : t('puenteSinGrado'))} · <b>${escapar(t(l.cuenta ? 'puenteCuenta' : 'puenteNoCuenta'))}</b>${l.delDueno && l.delDueno !== l.id ? ' · ' + escapar(t('puenteDelDueno')) : ''}</small>
    <br><small>${escapar(claves)}</small>
    <br><small class="puente-fondo">${escapar(fondo)}</small>
    ${l.noAbre ? `<br><small class="aviso">${escapar(t('puenteNoAbierto', { motivo: l.motivo ?? '' }))}</small>` : ''}${traer}
  </li>`;
}

/** Enviar algo mío a otro libro: la serie, a qué libro (entre los enlazados que cuentan) y cuánto, con el aviso antes de firmar. */
function htmlEnviarDelPuente(e) {
  if (!e.destinos.length) return `<p class="aviso" data-sin-destino>${escapar(t('puenteSinDestino'))}</p>`;
  const opciones = e.destinos.map((d) => `<option value="${attr(d.enlace)}"${d.enlace === e.elegido ? ' selected' : ''}>${escapar(d.nombre + (d.grado ? ' · ' + d.grado : '') + (d.quien ? ' · ' + t('puenteDestinoQuien', { quien: d.quien }) : ''))}</option>`).join('');
  return `<form class="puente-enviar"${nodo('formulario')} data-puente-enviar-form>
    <input type="hidden" name="serie" value="${attr(e.serie)}">
    <p><b>${escapar(e.texto)}</b>${e.soloA ? ` <small>${escapar(t('puenteSoloVuelve', { libro: e.soloANombre ?? String(e.soloA).slice(0, 8) }))}</small>` : ''}</p>
    <div class="campo"><label for="puente-destino">${escapar(t('puenteDestino'))}</label><select id="puente-destino" name="enlace">${opciones}</select></div>
    <div class="campo"><label for="puente-cantidad">${escapar(t('puenteCantidad', { disponible: e.disponible }))}</label><input id="puente-cantidad" name="cantidad" type="number" min="1" max="${attr(e.disponible)}" step="1" value="${attr(e.cantidad ?? 1)}" required></div>
    <p class="aviso" data-puente-aviso>${escapar(t('puenteAvisoEnvio'))}</p>
    <p class="ayuda"><small>${escapar(t('puenteRedDePruebas'))}</small></p>
    <footer><button type="submit" ${e.ocupado ? 'disabled' : ''}>${escapar(t('puenteEnviar'))}</button></footer>
  </form>`;
}

/** Lo que el otro libro tiene sellado y se puede traer aquí; lo que espera su sello, dicho con su frase. */
function htmlTraerDelPuente(tr) {
  const lista = tr.lista.length
    ? `<ul class="puente-traibles">${tr.lista.map((x) => `<li><span>${escapar(x.titulo || x.id.slice(0, 8))}</span> <small>${escapar(x.quien || x.autor)} · ${escapar(x.cuando)}</small> <button type="button"${nodo('accion')} data-puente-traer="${attr(x.id)}">${escapar(t('puenteTraer'))}</button></li>`).join('')}</ul>`
    : `<p class="ayuda">${escapar(t('puenteNadaQueTraer', { libro: tr.libro }))}</p>`;
  const espera = tr.sinSello ? t('puenteSinSello_' + tr.sinSello, { libro: tr.libro }) : tr.esperan ? t('puenteEsperanSello', { n: tr.esperan, libro: tr.libro }) : '';
  return `<div class="puente-traer" data-traer-de="${attr(tr.enlace)}"><h3>${escapar(t('puenteTraerDe', { libro: tr.libro }))}</h3><p class="ayuda">${escapar(t('puenteTraerAyuda', { libro: tr.libro }))}</p>${lista}${espera ? `<p class="aviso" data-espera-sello>${escapar(espera)}</p>` : ''}</div>`;
}

/**
 * Lo traído, leído (leerTraido): de qué libro, quién lo escribió allí, cuándo quedó en firme, por qué enlace, su grado, si
 * es del dueño y el nivel más bajo de ese enlace; si no es fiable, su causa (tal cual) y ni su contexto ni sus movimientos.
 * Un envío, con cuánto queda por recibir y «Recibir» si se ofrece.
 */
function htmlTraidoDelPuente(x) {
  const de = t('puenteTraidoDe', { libro: x.libroNombre ?? String(x.libro ?? '').slice(0, 8), autor: x.autor ?? '', firme: x.firme ?? t('puenteSinFirme') });
  const por = t('puentePorEnlace', { grado: x.grado ?? '', dueno: x.grado === 'del dueño' || !x.delDueno ? '' : t('puentePorEnlaceDueno'), cuenta: x.cuenta ? '' : t('puentePorEnlaceNoCuenta'), nivel: x.nivelMasBajo ?? '—' });
  const cuerpo = x.fiable
    ? `<details><summary>${escapar(t('puenteQueDecia'))}</summary><pre>${escapar(comoTexto(x.payload))}</pre><p><small>${escapar(t('puenteContexto'))}</small></p><pre>${escapar(comoTexto(x.contexto))}</pre><p><small>${escapar(t('puenteMovimientos'))}</small></p><pre>${escapar(comoTexto(x.movimientos))}</pre></details>`
    : `<p class="aviso" data-no-fiable>${escapar(x.causa ?? '')}</p><details><summary>${escapar(t('puenteQueDecia'))}</summary><pre>${escapar(comoTexto(x.payload))}</pre></details>`;
  const envio = x.envio ? `<p class="puente-queda"><small>${escapar(x.envio.queda > 0 ? t('puenteQueda', { queda: x.envio.queda, envia: x.envio.envia }) : t('puenteRecibido'))}</small>${x.recibir ? ` <button type="button"${nodo('accion')} data-puente-recibir="${attr(x.traido)}">${escapar(t('puenteRecibir'))}</button>` : ''}</p>` : '';
  return `<li class="puente-traido" data-traido="${attr(x.traido)}" data-fiable="${x.fiable}"><span>${escapar(de)}</span><br><small>${escapar(por)}${x.origen ? '' : ' · ' + escapar(t('puenteSinOrigen'))}</small>${cuerpo}${envio}</li>`;
}

/**
 * La hoja «Entre mis libros» (carta/puente.js): los enlaces a mis libros de este dispositivo (grado, si cuenta, el fondo y
 * cómo se cambian sus claves), lo mío que puede ir a otro libro (y el formulario de enviar), lo que se puede traer de un
 * libro enlazado y lo traído, leído. `v`: { enlaces, cruza, enviar, traer, traidos, aviso, motivos, exito }. Todo dato va
 * escapado: lo que viene de un registro o de otro libro se pinta como texto.
 */
export function htmlPuente(v) {
  if (!v) return '';
  const avisos = [...(v.aviso ? [v.aviso] : []), ...(v.motivos ?? []).map((m) => m?.mensaje ?? m)];
  const mensajes = (avisos.length ? `<ul class="motivos" role="alert">${avisos.map((m) => `<li>${escapar(m)}</li>`).join('')}</ul>` : '') + (v.exito ? `<p class="exito" role="status">${escapar(v.exito)}</p>` : '');
  const enlaces = v.enlaces.length
    ? `<ul class="puente-enlaces">${v.enlaces.map(htmlEnlaceDelPuente).join('')}</ul><p class="ayuda"><small data-cambiar-claves>${escapar(t('puenteCambiarClaves'))}</small></p>`
    : `<p class="ayuda">${escapar(t('puenteSinEnlaces'))}</p>`;
  const cruza = v.cruza.length
    ? `<ul class="puente-cruza">${v.cruza.map((c) => `<li><span>${escapar(c.texto)}</span> <button type="button"${nodo('control')} data-puente-enviar="${attr(c.serie)}">${escapar(t('puenteEnviarEsto'))}</button></li>`).join('')}</ul>`
    : `<p class="ayuda">${escapar(t('puenteNadaCruza'))}</p>`;
  const traidos = v.traidos.length ? `<ul class="puente-traidos">${v.traidos.map(htmlTraidoDelPuente).join('')}</ul>` : `<p class="ayuda">${escapar(t('puenteNadaTraido'))}</p>`;
  return `<div class="formulario-fondo" data-cerrar><section class="formulario puente"${nodo('reglas')} role="dialog" aria-label="${attr(t('puenteTitulo'))}">
    <header><h2>${escapar(t('puenteTitulo'))}</h2><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    <p class="ayuda">${escapar(t('puenteAyuda'))}</p>${mensajes}
    <h3>${escapar(t('puenteEnlaces'))}</h3>${enlaces}
    ${v.traer ? htmlTraerDelPuente(v.traer) : ''}
    <h3>${escapar(t('puenteCruza'))}</h3>${cruza}${v.enviar ? htmlEnviarDelPuente(v.enviar) : ''}
    <h3>${escapar(t('puenteTraidos'))}</h3>${traidos}
  </section></div>`;
}

/**
 * «Ajustes de este elemento» (carta/reglas.js ajustesDelElemento): lo que el elemento tiene fijado, con quién y cuándo, y
 * lo que toma de las reglas del libro («del libro»: el valor base y lo que se admite). Cada uno con el botón de la plantilla
 * de siempre para cambiarlo (el mismo data-sitio-lanzar de la cruceta: abre su formulario con lo que ya se sabe).
 */
export function htmlAjustesDelElemento(a) {
  if (!a) return '';
  const boton = (c, clave) => (c ? ` <button type="button" class="enlace"${nodo('accion')} data-sitio-lanzar="${attr(c.accion)}" data-x="${attr(c.X)}" data-valores="${attr(JSON.stringify(c.valores ?? {}))}" title="${attr(c.nombre)}">${escapar(t(clave))}</button>` : '');
  const fijado = a.fijado.length
    ? `<ul class="ajustes-lista">${a.fijado.map((f) => `<li class="ajuste" data-id="${attr(f.id)}"><b>${escapar(f.que)}</b>${f.valores.map((x) => ` · ${escapar(x.etiqueta)}: ${escapar(x.valor)}`).join('')} <small class="ajuste-quien">${escapar(t('ajustesQuienCuando', { quien: f.quien, cuando: f.cuando }))}</small>${boton(f.cambiar, 'ajustesCambiar')}</li>`).join('')}</ul>`
    : `<p class="ayuda">${escapar(t('ajustesNadaFijado'))}</p>`;
  const heredado = a.heredado.length
    ? `<ul class="ajustes-lista">${a.heredado.map((h) => `<li class="ajuste" data-del-libro><b>${escapar(h.que)}</b>${h.clave ? ` · ${escapar(h.clave)}` : ''}: ${escapar(t('ajustesBase', { base: h.base || '—' }))}${h.admitidos ? ` <small>${escapar(t('ajustesAdmitidos', { valores: h.admitidos }))}</small>` : ''} <small class="ajuste-del-libro">${escapar(t('ajustesDelLibro'))}</small>${boton(h.cambiar, 'ajustesFijar')}</li>`).join('')}</ul>`
    : '';
  return `<div class="formulario-fondo" data-cerrar><section class="formulario ajustes-elemento"${nodo('ajustes')} data-x="${attr(a.X)}" role="dialog" aria-label="${attr(t('ajustesElemento'))}">
    <header><h2>${escapar(t('ajustesElemento'))}</h2><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    <p class="ayuda">${escapar(a.texto)}</p>
    <h3>${escapar(t('ajustesFijado'))}</h3>${fijado}
    ${heredado ? `<h3>${escapar(t('ajustesHeredado'))}</h3>${heredado}` : ''}
    ${htmlBajarP(a.bajarP, boton)}
  </section></div>`;
}

/**
 * El sí del dueño para que el P de otro baje a esta cosa (CH1; carta/reglas.js siDelDueno): quién lo tiene, cada uno con
 * «retirar», y «dejar bajar a alguien». Los botones abren la plantilla de siempre con lo que ya se sabe. '' sin nada.
 */
function htmlBajarP(b, boton) {
  if (!b) return '';
  const lista = b.quienes.length
    ? `<ul class="ajustes-lista">${b.quienes.map((q) => `<li class="ajuste" data-si="${attr(q.whom)}"><b>${escapar(q.quien || q.whom)}</b> <small class="ajuste-quien">${escapar(t('siDelDuenoDesde', { cuando: q.cuando }))}</small>${boton(q.retirar, 'siDelDuenoRetirar')}</li>`).join('')}</ul>`
    : `<p class="ayuda">${escapar(t('siDelDuenoNadie'))}</p>`;
  return `<h3>${escapar(t('siDelDuenoTitulo'))}</h3><p class="ayuda"><small>${escapar(t('siDelDuenoAyuda'))}</small></p>${lista}${b.dar ? `<p>${boton(b.dar, 'siDelDuenoDar')}</p>` : ''}`;
}

/**
 * El selector «soy»: mis cuentas (por su nombre, `cuenta:<alta>`), aparte las identidades del ejemplo (en una cuenta,
 * solo la opción de probar con un ejemplo), y crear o restaurar una cuenta. La app lee el valor elegido.
 */
function htmlSoy(arbol, { cuentas = [], cuenta = null } = {}) {
  const mias = cuentas.length ? `<optgroup label="${attr(t('misCuentas'))}">${cuentas.map((c) => `<option value="cuenta:${attr(c.alta)}" ${cuenta && c.alta === cuenta.alta ? 'selected' : ''}>${escapar(c.nombre)}</option>`).join('')}</optgroup>` : '';
  const ejemplo = cuenta
    ? `<optgroup label="${attr(t('ejemplos'))}"><option value="ejemplo">${t('probarConEjemplo')}</option></optgroup>`
    : `<optgroup label="${attr(t('ejemplos'))}">${arbol.identidades.map((i) => `<option value="${attr(i.id)}" ${i.id === arbol.yo ? 'selected' : ''}>${escapar(i.id)}${i.persona ? '' : ' ' + t('cosa')}</option>`).join('')}</optgroup>`;
  const nuevas = `<optgroup label="${attr(t('cuenta'))}"><option value="nueva">${t('crearMiCuenta')}…</option><option value="restaurar">${t('restaurarUnaCuenta')}…</option></optgroup>`;
  return `<label class="ajuste"${nodo('control')}>${t('verComo')} <select data-quien>${mias}${ejemplo}${nuevas}</select></label>`;
}

/**
 * La línea del libro compartido, junto a «guardado en este navegador» (carta/sincronia.js lineaDeEstado): lo que falta
 * por subir, sin red, el orden que cambió o «al día»; los errores tal cual; y lo que no entró, en un desplegable con el
 * id corto, el motivo y de dónde viene. Sin sincronía (un ejemplo, o una cuenta sin servidor), nada. El orden firmado
 * (`s.orden`): «sin firmar», una línea llana; «contradicho», un aviso que no se va solo y los dos recibos en un
 * desplegable, para copiarlos (data-orden-copiar, carta/gestos.js).
 */
export function htmlSincronia(s) {
  if (!s) return '';
  const errores = s.errores?.length ? ` <span class="error" role="alert">${s.errores.map(escapar).join(' · ')}</span>` : '';
  const rechazados = s.rechazados?.length
    ? `<details class="rechazados"><summary>${escapar(s.titulo)}</summary><ul>${s.rechazados.map((r) => `<li><code>${escapar(r.id)}</code> ${escapar(r.motivo)} <small>(${escapar(r.deTexto)})</small></li>`).join('')}</ul></details>`
    : '';
  const o = s.orden;
  const orden = !o ? ''
    : o.estado === 'contradicho'
      ? `<span class="error orden-firmado" role="alert" data-orden-fraude> · ${escapar(o.texto)}<details class="rechazados"><summary>${escapar(t('ordenRecibos'))}</summary><button type="button" class="enlace" data-orden-copiar title="${attr(t('ordenCopiarTitulo'))}">${escapar(t('ordenCopiar'))}</button><textarea readonly rows="6" data-orden-pruebas>${escapar(o.pruebas ?? '')}</textarea></details></span>`
      : `<span class="orden-firmado"> · ${escapar(o.texto)}</span>`;
  return `<small class="sincronia" data-sincronia role="status" title="${attr(t('sincroniaTitulo'))}">${(s.partes ?? []).map(escapar).join(' · ')}${orden}${errores}${rechazados}</small>`;
}

/**
 * El aviso persistente de una cuenta del guardián (camino B; carta/anfitrion.js): abierta solo para leer (`soloLeer`: el
 * texto que toca) o con la sesión del guardián cerrada (`sesionCerrada`: el aviso y el botón que la abre con una firma
 * pedida por el usuario, data-guardian-abrir; sin él, `puedeAbrir === false`, solo el aviso de que se abrirá con la próxima
 * firma; `noAbrio`: el guardián no la abrió, una línea más). Sin nada de eso (y siempre en el camino A), nada.
 */
export function htmlGuardian(g) {
  if (!g || (!g.soloLeer && !g.sesionCerrada)) return '';
  // Sin anfitrión (A25): `emparejar` ofrece emparejar con la app (o, si ya lo estuvo, volver a emparejar: `reemparejar`);
  // `otraClave`, la app emparejada guarda otra clave.
  if (g.soloLeer) {
    const texto = g.otraClave ? 'emparejarOtraClave' : g.sinGuardian ? (g.emparejar ? 'emparejarSoloLeer' : 'guardianSoloLeerSinGuardian') : 'guardianSoloLeer';
    const emparejar = g.emparejar ? ` <button type="button" class="enlace" data-emparejar title="${attr(t('emparejarConLaAppTitulo'))}">${escapar(t(g.reemparejar ? 'emparejarOtraVez' : 'emparejarConLaApp'))}</button>` : '';
    return `<p class="aviso aviso-guardian" role="status" data-guardian>${escapar(t(texto))}${emparejar}</p>`;
  }
  // Firma el emparejamiento (A25): no hay sesión de guardián que abrir. En plazo, cada registro se confirma en la app; terminado,
  // se dice y se ofrece «Volver a emparejar».
  if (g.porEmparejamiento) {
    const terminado = g.porEmparejamiento === 'terminado';
    const volver = terminado ? ` <button type="button" class="enlace" data-emparejar title="${attr(t('emparejarConLaAppTitulo'))}">${escapar(t('emparejarOtraVez'))}</button>` : '';
    return `<p class="aviso aviso-guardian" role="status" data-guardian>${escapar(t(terminado ? 'emparejarTerminado' : 'emparejarFirmaEnLaApp'))}${volver}</p>`;
  }
  const sinBoton = g.puedeAbrir === false;
  const boton = sinBoton ? '' : ` <button type="button" class="enlace" data-guardian-abrir title="${attr(t('guardianAbrirTitulo'))}"${g.abriendo ? ' disabled aria-busy="true"' : ''}>${escapar(t('guardianAbrir'))}</button>`;
  const noAbrio = g.noAbrio && !g.abriendo ? ` <small data-guardian-no-abrio>${escapar(t('guardianNoAbrio'))}</small>` : '';
  return `<p class="aviso aviso-guardian" role="status" data-guardian>${escapar(t(sinBoton ? 'guardianSesionCerradaSinBoton' : 'guardianSesionCerrada'))}${boton}${noAbrio}</p>`;
}

/** Los controles de «opinar» (carta/opinar.js): el conmutador con su contador y, si hay opiniones, exportar, copiar y borrar la última. */
export function htmlOpinar(o) {
  if (!o) return '';
  const conmutador = `<button type="button" class="opinar-boton" data-opinar-ctl="alternar" aria-pressed="${Boolean(o.activo)}" title="${attr(t('opinarTitulo'))}">${t('opinar')}${o.cuantas ? ` · ${o.cuantas}` : ''}</button>`;
  if (!o.cuantas) return conmutador;
  return conmutador + `<span class="opinar-menu"><button type="button" data-opinar-ctl="exportar" title="${attr(t('opinarExportarTitulo'))}">${t('opinarExportar')}</button><button type="button" data-opinar-ctl="copiar" title="${attr(t('opinarCopiarTitulo'))}">${t('opinarCopiar')}</button><button type="button" data-opinar-ctl="borrar" title="${attr(t('opinarBorrarTitulo'))}">${t('opinarBorrar')}</button></span>`;
}

/**
 * Un interruptor de la barra (una preferencia de dos valores: el pintado, sobrio o animado): las dos palabras, la que
 * rige pulsada; tocar la otra escribe la preferencia (data-preferencia, data-valor) y repinta.
 */
function htmlInterruptor(i) {
  const botones = i.opciones.map((o) => `<button type="button" data-preferencia="${attr(i.clave)}" data-valor="${attr(o.valor)}" aria-pressed="${o.valor === i.valor}">${escapar(o.texto)}</button>`).join('');
  return `<span class="interruptor"${nodo('control')} role="group" aria-label="${attr(i.etiqueta)}" title="${attr(i.etiqueta)}">${botones}</span>`;
}

/**
 * Lo que era la barra superior, ahora las posiciones del 0 de mi alta (VG, 12-11, #38: «la barra desaparece; la
 * configuración general es el personaje del 0»): 0 quién soy (y el ejemplo), 1 cuánto (hoy y «guardar este rato»),
 * 2 la configuración (con qué condición), 4 lo que se hace con la cuenta (la copia de seguridad, olvidar o reiniciar),
 * 5 el estilo (sobrio o animado), 8 opinar (frente a otros) y 9 cómo: lo guardado, el libro compartido y los ajustes de la guía y del exterior.
 * Cada control conserva su data-* de siempre (data-quien, data-ejemplo, data-englobar, data-config, data-copia,
 * data-olvidar, data-reiniciar, data-preferencia, data-opinar-ctl, data-sincronia). → { [posición]: html }.
 */
function controlesDelCero(arbol, { ejemplos = [], ejemplo = null, guardado = '', cuentas = [], cuenta = null, sincronia = null, opinar = null } = {}) {
  // «soy» es del modo ejemplo (VG 14-11, #86): en una cuenta la identidad es la cuenta y no se cambia desde aquí; en el ejemplo, «ver como» (el visor de la demo).
  const quien = cuenta ? '' : htmlSoy(arbol, { cuentas, cuenta });
  const ej = !cuenta && ejemplos.length ? `<label class="ajuste"${nodo('control')}>${t('ejemplo')} <select data-ejemplo>${ejemplos.map((e) => `<option value="${attr(e.id)}" ${e.id === ejemplo ? 'selected' : ''}>${escapar(e.etiqueta)}</option>`).join('')}</select></label>` : '';
  const tiempo = arbol.tiempo ? Object.entries(arbol.tiempo).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${v === 1 ? t('escalaUna_' + k) : t('escala_' + k)}`).join(' · ') : '';
  const local = arbol.local ? `<span class="tiempo" title="${attr(t('tiempoLocalTitulo', { serie: arbol.local.serie }))}">${escapar(t('hoy', { segundos: arbol.local.gastadoHoy }))}${tiempo ? ' · ' + escapar(tiempo) : ''}</span><button type="button" class="englobar"${nodo('control')} data-englobar ${arbol.local.pendientes ? '' : 'disabled'} title="${attr(t('englobarTitulo', { cuantas: arbol.local.pendientes }))}">${t('englobar')}${arbol.local.pendientes ? ` · ${arbol.local.pendientes}` : ''}</button>` : '';
  const propios = cuenta
    ? `<button type="button"${nodo('control')} data-copia title="${attr(t('copiaTitulo'))}">${t('copiaDeSeguridad')}</button><button type="button"${nodo('control')} data-copia-todos title="${attr(t('copiaDeTodosTitulo'))}">${escapar(t('copiaDeTodos'))}</button><button type="button"${nodo('control')} data-olvidar title="${attr(t('olvidarTitulo'))}">${t('olvidar')}</button>`
    : `<button type="button"${nodo('control')} data-reiniciar title="${attr(t('reiniciarTitulo'))}">${t('reiniciar')}</button>`;
  const config = `<button type="button"${nodo('control')} data-config="2" title="${attr(t('configuracionTitulo'))}">${t('configuracionCriterios')}</button>`;
  const ajustes = `<button type="button"${nodo('control')} data-config="9" title="${attr(t('ajustesGuiaExteriorTitulo'))}">${t('ajustesGuiaExterior')}</button>`;
  return {
    0: quien + ej,
    1: local,
    2: config,
    4: propios,
    5: (arbol.interruptores ?? []).map(htmlInterruptor).join(''),
    8: htmlOpinar(opinar),
    9: `${ajustes}<small class="guardado">${escapar(guardado)}</small>${htmlSincronia(sincronia)}`,
  };
}

/** Sequenced (el móvil en vertical): el personaje del 0 arriba de la columna, en lugar de la barra de una línea y su menú. */
const htmlCeroColumna = (s) => (s?.X ? `<div class="cero-columna"${nodo('control')} data-cero>${htmlInterrogante(s, { clase: 'sitio-cero' })}<span class="cero-etiqueta">${escapar(t('ceroColumna'))}</span></div>` : '');

/**
 * La pantalla de arranque (o el diálogo, sobre la carta): crear mi cuenta, restaurar una cuenta desde su copia, o
 * probar con un ejemplo; y, si hay cuentas en este navegador, entrar en una. `ar`: { modo: 'menu' | 'crear' |
 * 'restaurar', campos (los del alta, del núcleo), valores, motivos, ocupado }. El formulario de crear se genera de los
 * campos que da cuentas.camposDelAlta (etiquetas y ayudas del núcleo); el de restaurar pide el archivo y la frase.
 */
export function htmlArranque(ar, { cuentas = [], sobreCarta = false, emparejar = null, ensayo = null } = {}) {
  if (!ar) return '';
  const motivos = ar.motivos?.length ? `<ul class="motivos" role="alert">${ar.motivos.map((m) => `<li>${escapar(m.mensaje ?? m)}</li>`).join('')}</ul>` : '';
  const volver = sobreCarta ? `<button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button>` : (ar.modo !== 'menu' ? `<button type="button" class="volver-arranque" data-arranque="menu">${t('volver')}</button>` : '');
  let cuerpo = '';
  if (ar.modo === 'crear') {
    const campos = (ar.campos ?? []).map((c) => {
      const id = 'alta-' + c.nombre;
      const valor = ar.valores?.[c.nombre] ?? c.valor ?? '';
      const control = c.opciones
        ? `<select id="${id}" name="${attr(c.nombre)}">${c.opciones.map((o) => `<option value="${attr(o)}" ${o === valor ? 'selected' : ''}>${escapar(o)}</option>`).join('')}</select>`
        : `<input id="${id}" name="${attr(c.nombre)}" type="text" value="${attr(valor)}" required autocomplete="${c.nombre === 'nombre' ? 'name' : 'off'}" placeholder="${attr((c.marcador ?? []).join(' · '))}" title="${attr(c.ayuda ?? '')}">`;
      return `<div class="campo"><label for="${id}">${escapar(c.etiqueta)} <small class="numero">${c.pv}</small></label>${control}<small class="ayuda">${escapar(c.ayuda ?? '')}</small></div>`;
    }).join('');
    // Un libro nuevo con mi clave (A24, §4.2): el mismo formulario; la clave es la del libro abierto.
    const titulo = ar.conMiClave ? t('libroNuevoConMiClave') : ar.conClave ? t('personaNueva') : t('crearMiCuenta');
    cuerpo = `<form class="formulario arranque-form" data-crear${ar.conMiClave ? ' data-con-mi-clave' : ''} aria-label="${attr(titulo)}">
      <header><h2>${escapar(titulo)}</h2>${volver}</header>
      <p class="ayuda">${escapar(t(ar.conMiClave ? 'libroNuevoConMiClaveAyuda' : 'crearAyuda'))}</p>
      ${campos}${motivos}
      <footer><button type="submit" ${ar.ocupado ? 'disabled' : ''}>${t(ar.ocupado ? 'creando' : 'crear')}</button></footer>
    </form>`;
  } else if (ar.modo === 'restaurar') {
    cuerpo = `<form class="formulario arranque-form" data-restaurar aria-label="${attr(t('restaurarUnaCuenta'))}">
      <header><h2>${t('restaurarUnaCuenta')}</h2>${volver}</header>
      <p class="ayuda">${escapar(t('restaurarAyuda'))}</p>
      <div class="campo"><label for="copia-archivo">${t('archivoDeCopia')}</label><input id="copia-archivo" name="archivo" type="file" accept="application/json,.json" required></div>
      <div class="campo"><label for="copia-frase">${t('frase')}</label><input id="copia-frase" name="frase" type="password" autocomplete="off" required></div>
      ${motivos}
      <footer><button type="submit" ${ar.ocupado ? 'disabled' : ''}>${t(ar.ocupado ? 'restaurando' : 'restaurar')}</button></footer>
    </form>`;
  } else {
    const entrar = cuentas.length ? `<ul class="cuentas-lista">${cuentas.map((c) => `<li><button type="button" data-arranque="cuenta:${attr(c.alta)}">${escapar(t('entrarComo', { nombre: c.nombre }))}</button></li>`).join('')}</ul>` : '';
    // Sin anfitrión (A25): «Emparejar con la app» mientras no hay emparejamiento; con él, crear abre un libro con la clave de la app.
    const conLaApp = Boolean(emparejar?.vivo);
    const emparejarBoton = emparejar && !conLaApp ? `<button type="button" data-emparejar title="${attr(t('emparejarConLaAppTitulo'))}">${escapar(t('emparejarConLaApp'))}</button>` : '';
    cuerpo = `<div class="formulario arranque-menu" role="dialog" aria-label="${attr(t('arranqueTitulo'))}">
      <header><h2>${t('arranqueTitulo')}</h2>${volver}</header>
      <p class="ayuda">${escapar(t('arranqueIntro'))}</p>
      ${htmlBotonEnsayo(ensayo)}${entrar}${motivos}
      <div class="opciones">
        ${ar.conClave ? `<button type="button" class="principal" data-arranque="crear-mio">${escapar(t('libroNuevoConMiClave'))}</button><button type="button" data-arranque="crear">${escapar(t('personaNueva'))}</button>` : `<button type="button" class="principal" data-arranque="crear">${escapar(t(conLaApp ? 'emparejarAbrirLibro' : 'crearMiCuenta'))}</button>`}
        ${emparejarBoton}
        <button type="button" data-arranque="restaurar">${t('restaurarUnaCuenta')}</button>
        <button type="button" data-arranque="ejemplo">${t('probarConEjemplo')}</button>
      </div>
    </div>`;
  }
  return sobreCarta ? `<div class="formulario-fondo arranque"${nodo('arranque')} data-cerrar>${cuerpo}</div>` : `<div class="arranque-pantalla arranque"${nodo('arranque')}>${cuerpo}</div>`;
}

/** El diálogo de la copia de seguridad: la frase (dos veces) y «descargar»; el eje exportado es una foto. */
export function htmlCopia(c) {
  if (!c) return '';
  const motivos = c.motivos?.length ? `<ul class="motivos" role="alert">${c.motivos.map((m) => `<li>${escapar(m.mensaje ?? m)}</li>`).join('')}</ul>` : '';
  return `<div class="formulario-fondo" data-cerrar><form class="formulario copia"${nodo('copia')} data-copia-form aria-label="${attr(t('copiaDeSeguridad'))}">
    <header><h2>${escapar(t(c.todos ? 'copiaDeTodos' : 'copiaDeSeguridad'))}</h2><button type="button" class="cerrar" data-cerrar aria-label="${attr(t('cerrar'))}">×</button></header>
    <p class="ayuda">${escapar(t(c.todos ? 'copiaDeTodosAyuda' : 'copiaAyuda', { archivo: c.archivo ?? '', cuantos: c.cuantos ?? '' }))}</p>
    <p class="aviso">${escapar(t('copiaEsFoto'))}</p>
    <div class="campo"><label for="copia-frase-1">${t('frase')}</label><input id="copia-frase-1" name="frase" type="password" autocomplete="new-password" required minlength="${Number(c.minimo) || 0}"><small class="ayuda">${escapar(t('fraseAyuda', { minimo: c.minimo }))}</small></div>
    <div class="campo"><label for="copia-frase-2">${t('repetirFrase')}</label><input id="copia-frase-2" name="frase2" type="password" autocomplete="new-password" required></div>
    ${motivos}${c.hecho ? `<p class="exito" role="status">${escapar(c.hecho)}</p>` : ''}
    <footer><button type="submit" ${c.ocupado ? 'disabled' : ''}>${t(c.ocupado ? 'cifrando' : 'descargar')}</button></footer>
  </form></div>`;
}

/**
 * La carta entera como HTML. `extra`: lo que la carta no decide y la app sabe: `leidoTexto` (la lectura humana del 0,
 * src/lectura.js), `ejemplos` y `ejemplo` (el selector), `guardado`, `aviso`, `exito`, `preferencias` (el formulario
 * de configuración si está abierto), `nuevos` (los ids llegados por el diario desde la última vez: los que se animan),
 * `cuentas` y `cuenta` (mis cuentas en este navegador y la abierta, o null en un ejemplo), `arranque` (la pantalla de
 * crear, restaurar o probar, sola si no hay eje y como diálogo si lo hay), `copia` (el diálogo de la copia de seguridad),
 * `sincronia` (la línea del libro compartido, o null), `claveLectura` (en una cuenta, la de este navegador o ''),
 * `anfitrion` (true si la carta va dentro de una app que firma: carta/anfitrion.js), `autorizando` (los ids que firma ya) y `emparejar` (sin anfitrión, A25: { vivo }; la pantalla de arranque ofrece emparejar con la app).
 */
export function html(arbol, extra = {}) {
  archivoDe = typeof extra.archivo === 'function' ? extra.archivo : () => null; // los archivos adjuntos de esta pestaña (htmlRepresentacion)
  conAnfitrion = extra.anfitrion === true; // la app que lleva la carta firma: lo por autorizar lleva «autorizar» (htmlPorAutorizar)
  autorizando = extra.autorizando instanceof Set ? extra.autorizando : new Set();
  retocando = arbol?.retocar ?? null; // el modo «retocar textos» (A20): solo lo trae el árbol de quien puede retocar
  // Sin eje (nadie ha elegido aún cuenta ni ejemplo): la pantalla de arranque entera.
  if (extra.arranque && (!arbol || arbol.vacio)) return `<div class="carta vacia">${extra.aviso ? `<p class="aviso" role="alert">${escapar(extra.aviso)}</p>` : ''}${htmlArranque(extra.arranque, { cuentas: extra.cuentas, sobreCarta: false, emparejar: extra.emparejar, ensayo: extra.ensayo })}</div>`;
  if (!arbol || arbol.vacio) return `<div class="carta vacia"><p class="aviso">${escapar(arbol?.avisos?.join(' · ') ?? t('sinRegistro'))}</p></div>`;
  const a = { ...arbol };
  const clase = ['carta', a.apilada ? 'carta-apilada' : 'carta-matriz', a.animado ? 'animado' : 'sobrio', `disposicion-${a.disposicion}`].join(' ');
  const laterales = Object.fromEntries(a.laterales.map((n) => [n.pv, htmlLateral(n, a)]));
  const de = (pv) => laterales[pv] ?? '';
  // La franja de la cruz se lee como la cruz: el lado del PV1 (6), arriba (8), abajo (9) y el lado del PV2 (7).
  const ordenCruz = (n) => (n.fila === 'arriba' ? 1 : n.fila === 'abajo' ? 2 : n.lado === a.laterales.find((l) => l.pv === 1)?.lado ? 0 : 3);
  const cruz = a.laterales.filter((n) => n.grupo === 'cruz').sort((p, q) => ordenCruz(p) - ordenCruz(q)).map((n) => n.pv);
  const x = LATERALES.filter((pv) => a.laterales.find((n) => n.pv === pv)?.grupo === 'x');
  const avisos = [...(a.avisos ?? []), ...(extra.aviso ? [extra.aviso] : [])];
  // Sequenced (el móvil en vertical): una columna, el pasado encima de la tarjeta del foco y el futuro debajo (sin
  // árbol de la secuencia, las franjas de antes).
  const escena = a.apilada
    ? (a.secuencia
      ? `<div class="secuencia" data-secuencia>${htmlHilo(a.secuencia.pasado)}<div class="secuencia-ahora">${htmlCentro(a.centro, a, extra)}${htmlHilo(a.secuencia.futuro)}</div></div>`
      : `<div class="franja franja-cruz" data-franja="cruz">${cruz.map(de).join('')}</div>${htmlCentro(a.centro, a, extra)}<div class="franja franja-x" data-franja="x">${x.map(de).join('')}</div>`)
    : htmlMapa(a, extra, laterales);
  const estilos = htmlEstilos(a);
  return `<div class="${clase}"${nodo('carta', { modo: a.apilada ? 'apilada' : 'matriz', render: a.animado ? 'animado' : 'sobrio', ancho: a.medidas?.ancho, alto: a.medidas?.alto, x0: a.centro?.representacion?.texto ?? '' })} data-x="${a.X}" data-disposicion="${attr(a.disposicion)}" data-animaciones="${Number(a.limite) || 0}">
    ${estilos}
    ${a.apilada ? htmlCeroColumna(a.centro?.sitio) : ''}
    ${htmlTusLibros(extra.libros)}
    ${avisos.length ? `<p class="aviso" role="alert">${avisos.map(escapar).join(' · ')}</p>` : ''}${htmlGuardian(extra.guardian)}
    ${extra.exito ? `<p class="exito" role="status">${escapar(extra.exito)}</p>` : ''}
    ${htmlRosetones(a.rosetones, { apilada: a.apilada, parte: 'arriba' })}
    <div class="escena">${escena}</div>
    ${htmlRosetones(a.rosetones, { apilada: a.apilada, parte: 'abajo' })}
    ${a.apilada ? htmlDigitos(a.secuencia) : ''}
    ${htmlAro(a.aro)}
    ${htmlSitio(a.sitio, a, extra)}
    ${htmlReglas(extra.reglas)}${htmlAjustesDelElemento(extra.ajustesElemento)}${htmlPuente(extra.puente)}
    ${htmlFormulario(a.formulario)}
    ${extra.preferencias ? htmlConfiguracion(extra.preferencias, { motivos: extra.motivosPreferencias, claveLectura: extra.claveLectura, guia: extra.guiaAjustes, exterior: extra.exteriorAjustes, segundoFactor: extra.segundoFactor, parte: extra.parteConfiguracion, retocar: extra.retocarTextos, reglas: extra.entradaReglas }) : ''}${htmlRetoque(a.retoque)}
    ${extra.arranque ? htmlArranque(extra.arranque, { cuentas: extra.cuentas, sobreCarta: true, emparejar: extra.emparejar, ensayo: extra.ensayo }) : ''}
    ${htmlCopia(extra.copia)}
    ${htmlLibroPrivado(extra.libroPrivado)}
  </div>`;
}

/**
 * Los dos estilos de lo que se pinta (el propio, X.0.9, y el de los de abajo, X.5.0; contrato.estilo), como CSS acotado a
 * su registro: `[data-id="<id>"] { … }` y `[data-id="<id>"] .hijo { … }`. Cada texto vuelve a pasar por cssSeguro aquí
 * (el árbol podría llegar de otro sitio) y solo se emite si el id es un identificador sin más: nada que no sea una
 * declaración corriente llega al <style>, y sin `<` ni `}` en ella no puede cerrarlo ni salir de su regla.
 */
export function htmlEstilos(a) {
  const vistos = new Map();
  const ver = (id, estilo) => { if (typeof id === 'string' && /^[0-9A-Za-z_-]{1,128}$/.test(id) && estilo && !vistos.has(id)) vistos.set(id, estilo); };
  ver(a.X, a.centro?.estilo);
  ver(a.centro?.rejilla?.X, a.centro?.rejilla?.estilo);
  for (const n of [a.centro?.rejilla, ...(a.laterales ?? []).map((l) => l.rejilla)]) {
    for (const c of n?.celdas ?? []) for (const o of c.ocupantes ?? []) ver(o.X, o.estilo);
    for (const b of n?.bandas ?? []) for (const o of b.items ?? []) ver(o.X, o.estilo);
  }
  const reglas = [];
  for (const [id, e] of vistos) {
    const propio = cssSeguro(e.propio?.css);
    const hijos = cssSeguro(e.hijos?.css);
    if (propio) reglas.push(`[data-id="${id}"]{${propio}}`);
    if (hijos) reglas.push(`[data-id="${id}"] .hijo{${hijos}}`);
  }
  return reglas.length ? `<style data-estilos>${reglas.join('')}</style>` : '';
}

/** Una caja de fracciones de la pantalla como estilo en tantos por ciento (lo único que el pintado hace con ella). */
/** La flecha de cada sitio de la matriz 3×3 hacia fuera (la de un vecino en la pantalla completa), por [fila][columna]. */
const FLECHAS = [['↖', '↑', '↗'], ['←', '', '→'], ['↙', '↓', '↘']];
const pct = (f) =>`${Math.round(f * 100000) / 1000}%`;
const estiloCaja = (c) => `left:${pct(c.x)};top:${pct(c.y)};width:${pct(c.ancho)};height:${pct(c.alto)}`;

/**
 * Los puntitos del foco (Mapped): los diez PV en su paso, junto a la información del foco; tocar cualquiera amplía un
 * paso todos los PV (data-todos="1"); al lado, el mando para bajarlos todos un paso (data-todos="-1").
 */
function htmlPuntos(p, X) {
  if (!p) return '';
  const punto = (q) => `<button type="button" class="punto${q.paso ? '' : ' centro'}"${nodo('control')} data-todos="1" data-color="${q.pv}" style="--lleno:${Math.round(Math.sqrt(q.paso?.fraccion ?? 0) * 1000) / 1000}" title="${attr(q.pv + ' · ' + q.etiqueta + (q.paso ? ' · ' + q.paso.texto : ''))}"${p.sube ? '' : ' aria-disabled="true"'}><span>${q.pv}</span></button>`;
  return `<div class="puntos" role="group" aria-label="${attr(t('puntosTitulo'))}" title="${attr(t('puntosTitulo'))}">${p.lista.map(punto).join('')}<button type="button" class="todos-menos"${nodo('control')} data-todos="-1" data-x="${attr(X)}" title="${attr(t('todosMenosTitulo'))}" aria-label="${attr(t('todosMenosTitulo'))}"${p.baja ? '' : ' disabled'}>−</button></div>`;
}

/**
 * Un PV en el mapa: su caja (en fracciones de la pantalla), la carta de siempre dentro, los botoncitos de ampliar y
 * reducir en la esquina que mira al centro y el asa para arrastrar desde ella (data-asa; la dirección en que crece,
 * data-dx y data-dy, es la que va de su esquina o lado hacia el centro).
 */
function htmlCeldaMapa(n, pintado) {
  const [f, c] = n.celda;
  const que = n.pv + ' · ' + n.etiqueta;
  const menos = n.mengua ? `<button type="button" class="tamano menos"${nodo('control')} data-tamano="-1" data-pv="${n.pv}" data-x="${n.X}" title="${attr(t('reducirTitulo', { que }))}" aria-label="${attr(t('reducirTitulo', { que }))}">−</button>` : '';
  const mas = n.crece ? `<button type="button" class="tamano mas"${nodo('control')} data-tamano="1" data-pv="${n.pv}" data-x="${n.X}" title="${attr(t('ampliarTitulo', { que }))}" aria-label="${attr(t('ampliarTitulo', { que }))}">+</button>` : '';
  const asa = `<span class="asa" data-asa="${n.pv}" data-x="${n.X}" data-dx="${1 - c}" data-dy="${1 - f}" title="${attr(t('asaTitulo', { que }))}"></span>`;
  return `<div class="celda fila-${f} columna-${c}${n.relleno ? ' relleno' : ''}" data-paso="${attr(n.pasoDeTamano?.nombre ?? '')}" style="${estiloCaja(n.caja)}">${pintado}<span class="mandos fila-${f} columna-${c}">${menos}${mas}${asa}</span></div>`;
}

/**
 * Mapped (VG, 10-11): la escena ocupa la ventana entera y nunca se desborda; cada PV en su caja (el árbol la trae en
 * fracciones de la pantalla), el foco en la suya con sus puntitos, y los rosetones de mi foco en su esquina o lateral,
 * por encima. Con un PV a pantalla completa: solo él, flechas a sus vecinos en su sitio de la geometría (el 0 y el 5
 * en el centro) y «volver»; sin rosetones.
 */
function htmlMapa(a, extra, laterales) {
  const centro = `<div class="celda celda-centro" style="${estiloCaja(a.mapa.centro)}">${htmlCentro(a.centro, a, extra)}</div>`;
  if (a.mapa.completa) {
    const flecha = (v) => `<button type="button" class="vecino fila-${v.fila} columna-${v.columna}${v.centro ? ' vecino-centro' : ''}"${nodo('control')} data-foco-pv="${v.pv}" data-x="${a.X}" data-color="${v.pv}" title="${attr(t('irAlPv', { pv: v.pv, que: v.etiqueta }))}" aria-label="${attr(t('irAlPv', { pv: v.pv, que: v.etiqueta }))}">${v.centro ? '' : FLECHAS[v.fila][v.columna] + ' '}${v.pv}</button>`;
    const centros = a.mapa.completa.vecinos.filter((v) => v.centro);
    return `<div class="mapa completa" data-completa="${a.mapa.completa.pv}"><div class="mapa-celdas">${centro}</div><nav class="vecinos" aria-label="${attr(t('pantallaCompleta', { que: a.centro.etiqueta }))}">${a.mapa.completa.vecinos.filter((v) => !v.centro).map(flecha).join('')}${centros.length ? `<span class="vecinos-centro">${centros.map(flecha).join('')}</span>` : ''}</nav></div>`;
  }
  const celdas = a.laterales.filter((n) => n.caja).map((n) => htmlCeldaMapa(n, laterales[n.pv] ?? '')).join('');
  return `<div class="mapa${a.mapa.matriz ? ' en-matriz' : ''}"><div class="mapa-celdas">${centro}${celdas}</div>${htmlRosetones(a.rosetones, { apilada: false, parte: 'mapa', guia: a.guia })}</div>`;
}

/**
 * Tras pintar: los huecos Lottie se rellenan con lottie-web (si `lottie` está cargado), cada uno fijado en su
 * fotograma; solo los marcados data-animar="1" se reproducen, y nunca más de `limite` a la vez (data-animaciones de
 * la carta: la preferencia «animations»): por prioridad (data-prioridad: 0 lo nuevo y los efectos, 1 lo enfocado, 2
 * el resto) y, dentro de ella, por orden en el documento; el resto espera en su fotograma y entra cuando un efecto
 * acaba. Un efecto (data-bucle="0") se reproduce una vez y al acabar se retira; si lleva data-oculta, oculta
 * también la pieza real de su escenario (lo consumido). Los que salen de pantalla se pausan (IntersectionObserver).
 * Devuelve una función que destruye lo creado (para el siguiente pintado), con `vivas()` (cuántas se reproducen).
 */
export function trasPintar(raiz, { lottie = globalThis.lottie, limite } = {}) {
  const huecos = [...raiz.querySelectorAll('[data-lottie]')];
  const nada = Object.assign(() => {}, { vivas: () => 0 });
  if (!huecos.length) return nada;
  if (!lottie) {
    for (const h of huecos) h.classList.add('sin-lottie');
    return nada;
  }
  const tope = Number(limite ?? raiz.querySelector('[data-animaciones]')?.dataset.animaciones) || Infinity;
  const vivas = [];
  let obs = null;
  const cache = new Map();
  const datos = async (ruta) => {
    if (!cache.has(ruta)) cache.set(ruta, fetch(ruta).then((r) => (r.ok ? r.json() : null)).catch(() => null));
    const d = await cache.get(ruta);
    return d ? JSON.parse(JSON.stringify(d)) : null;
  };
  // Quién se reproduce: las que piden animarse, por prioridad y orden; las primeras `tope` tienen sitio. Con
  // «reducir movimiento» en el sistema, ninguna: cada una se queda en su fotograma.
  const quieto = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const candidatas = huecos.filter((h) => h.dataset.animar === '1' && !quieto).map((h, k) => ({ h, k, p: Number(h.dataset.prioridad) || 0 })).sort((a, b) => a.p - b.p || a.k - b.k).map((x) => x.h);
  const conSitio = new Set(candidatas.slice(0, Number.isFinite(tope) ? tope : candidatas.length));
  const enEspera = candidatas.slice(conSitio.size);
  const reproduciendo = () => vivas.filter((a) => !a.isPaused && !a.__acabada).length;
  const arrancar = (h) => { if (h.__anim && h.__cargada && conSitio.has(h) && h.__visible !== false && !h.__anim.__acabada) h.__anim.play(); };
  const darSitio = () => { while (enEspera.length && reproduciendo() < tope) { const h = enEspera.shift(); conSitio.add(h); arrancar(h); } };
  if ('IntersectionObserver' in globalThis) {
    obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        const a = e.target.__anim;
        if (!a) continue;
        e.target.__visible = e.isIntersecting;
        if (e.isIntersecting) arrancar(e.target);
        else if (!a.isPaused) a.pause();
      }
    }, { rootMargin: '50px' });
  }
  for (const h of huecos) {
    const src = srcDeRecurso(h.dataset.lottie);
    if (!src) continue;
    datos(src).then((animationData) => {
      if (!animationData || !h.isConnected) return;
      const unaVez = h.dataset.bucle === '0';
      const anim = lottie.loadAnimation({ container: h, renderer: 'svg', loop: !unaVez, autoplay: false, animationData, rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
      h.__anim = anim;
      vivas.push(anim);
      const f = Number(h.dataset.fotograma) || 0;
      anim.addEventListener('DOMLoaded', () => {
        anim.goToAndStop(Math.min(f, Math.max(0, anim.totalFrames - 1)), true);
        h.__cargada = true;
        arrancar(h);
      });
      if (unaVez) {
        anim.addEventListener('complete', () => {
          anim.__acabada = true;
          if (h.classList.contains('pieza-efecto')) {
            h.classList.add('acabado');
            if (h.dataset.oculta === '1') h.closest('[data-escenario]')?.classList.add('consumida');
          }
          darSitio();
        });
      }
      if (obs) obs.observe(h);
    });
  }
  return Object.assign(() => {
    if (obs) obs.disconnect();
    for (const a of vivas) a.destroy();
  }, { vivas: reproduciendo });
}
