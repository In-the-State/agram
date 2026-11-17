// Las zonas de la cara y la guía mínima (Core AGRAM 17-11, pieza 1 de agram-equipo/DISENO_ZONAS_GUIA.md; VG 17-11 por
// Core State): las lecturas, puras y sin DOM. Documentación: docs/CONTRATO.md §12.8.
//
//   zonas(eje, X)                                    los botones de la cara de X: [{ id, origen, etiqueta, caja, destino }]
//   pasosDeGuia(eje, X)                              los pasos de la guía X: [{ id, titulo, libro, accion, sobre, parametros, porque }]
//   guias(eje, { autor })                            las guías del libro: [{ id, titulo }] (con autor, solo las suyas)
//   pasoHecho(ejeDestino, paso, yo)                  ¿está hecho el paso en el libro donde se hace? (la regla del tutorial)
//   sugerenciasDeGuia(ejeGuia, ejeAbierto, X, yo, { autor, tope })  los pasos de las guías de ejeGuia que tocan a X, en la forma del gancho
//                                                    `sugerencias` de acciones.camino (la tercera fuente del camino)
//
// Las dos plantillas («a zone of the face», «a step of the guide») viven hoy en la época hija del libro de la guía
// (datos/epocas/guia-libro/; este módulo no la importa). Se buscan POR SU NOMBRE en la época del libro (eje.epoca()), no
// por la clase de la época: siguen valiendo si pasan a la 0. En un libro cuya época no las tiene, todo da lista vacía.
// Nada de esto escribe ni firma. Lo que un libro trae escrito a mano se vuelve a validar al leer: una zona o un paso con
// forma inválida no sale, y solo cuenta lo que escribe el autor del elemento.

import { direccion, esReferencia } from './btml.js';
import { plantillaDeTransaccion, parametros as parametrosDeLaPlantilla, hechoPorMi, registroDe } from './acciones.js';
import { configuracion, desdeLegible, esTipoSimple, motivo, representaciones, texto } from './contrato.js';

/** Los nombres canónicos de las dos plantillas (los busca cada lectura en la época del libro). */
export const PLANTILLAS_DE_LA_GUIA = Object.freeze({ zona: 'a zone of the face', paso: 'a step of the guide' });
/** Los topes de una zona (DISENO_ZONAS_GUIA §7): 24 por elemento, etiqueta de 40 bytes de UTF-8, caja mínima de 60 milésimas. */
export const TOPES_DE_ZONA = Object.freeze({ porElemento: 24, etiqueta: 40, minimo: 60, cara: 1000 });

const EN_EL_CERO = direccion([0]);
const EN_EL_CUATRO = direccion([4]);
const RE_ID = /^[0-9a-f]{64}$/;
const hoja = (x) => (Array.isArray(x) ? x[0] : x);
const hojas = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);
const cadena = (x) => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : null);
const bytesDe = (s) => new TextEncoder().encode(s).length;
/**
 * Un texto de quien escribe la guía que la carta enseña (la etiqueta de una zona, el título de un paso) no lleva
 * caracteres de control (\p{Cc}) ni de dirección del texto (U+061C, U+200E, U+200F, U+202A a U+202E, U+2066 a U+2069): con
 * ellos un texto puede hacerse pasar por otro. El resto de la clase Cf vale (el ZWJ de los emojis compuestos).
 */
const RE_TEXTO_ENGANOSO = /[\p{Cc}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const textoLimpio = (s) => typeof s === 'string' && !RE_TEXTO_ENGANOSO.test(s);
/** Cuántos pasos da como mucho sugerenciasDeGuia (los del 9 de un registro), si no se pide otro tope. */
export const TOPE_DE_SUGERENCIAS = 24;

/** El evento de X (su id o el evento), o null. */
function eventoDe(eje, X) {
  const id = typeof X === 'string' ? X : X?.id;
  return typeof id === 'string' ? eje?.obtener?.(id) ?? null : null;
}

/** ¿Tiene la época del libro la plantilla de transacción de ese nombre? */
const tiene = (eje, nombre) => typeof eje?.epoca === 'function' && Boolean(plantillaDeTransaccion(nombre, { epoca: eje.epoca() }));

/** ¿Lo escribió esa plantilla? Lo dice su 4 (la acción que escribe el registro). */
const esDe = (r, nombre) => Array.isArray(r?.payload) && hojas(r.payload[4]).map(hoja).includes(nombre);

/** Un id de 64 hexadecimales en minúsculas escrito como dato, o el de una referencia { ref }; si no, null. */
const idDe = (x) => {
  const h = hoja(x);
  const v = esReferencia(h) ? h.ref : h;
  return typeof v === 'string' && RE_ID.test(v) ? v : null;
};

/** El texto de X para nombrarlo: su primera representación de texto (su 0). */
const tituloDe = (eje, X) => representaciones(eje, X).find((r) => typeof r.texto === 'string')?.texto ?? null;

/** El orden de llegada de cada registro del libro (para «la más reciente»), calculado una vez por lectura. */
const llegadas = (eje) => {
  let m = null;
  return (id) => (m ??= new Map((eje.orden ?? []).map((x, i) => [x, i]))).get(id) ?? -1;
};

// ---------- las zonas de la cara ----------

/**
 * Una zona leída de su registro: { etiqueta, caja, destino, retira } o null si su forma no es la de la plantilla
 * (etiqueta de texto llano de 1 a 40 bytes; caja de cuatro enteros de 0 a 1000 con x + ancho y y + alto sin pasar de
 * 1000 y ancho y alto de 60 como poco, o toda a cero, que retira; destino: el par [libro, registro] como datos o una
 * referencia a un registro de este libro, que ha de estar en él).
 */
function zonaDe(eje, r) {
  const p = r.payload;
  const etiqueta = hoja(p[0]);
  if (typeof etiqueta !== 'string' || !etiqueta.trim() || bytesDe(etiqueta) > TOPES_DE_ZONA.etiqueta || !textoLimpio(etiqueta)) return null;
  const caja = hojas(p[1]).map(hoja);
  if (caja.length !== 4 || !caja.every((n) => Number.isInteger(n) && n >= 0 && n <= TOPES_DE_ZONA.cara)) return null;
  const [x, y, ancho, alto] = caja;
  const retira = caja.every((n) => n === 0);
  if (!retira && (ancho < TOPES_DE_ZONA.minimo || alto < TOPES_DE_ZONA.minimo || x + ancho > TOPES_DE_ZONA.cara || y + alto > TOPES_DE_ZONA.cara)) return null;
  const destino = destinoDe(eje, p[5]);
  if (!destino) return null;
  return { etiqueta, caja, destino, retira };
}

/**
 * El destino de una zona (su 5): el par [libro, registro] como datos (dos ids; el libro de este libro, su génesis, es
 * null) o una referencia a un registro de este libro. Un registro de este libro ha de estar en él. Nada más: ni una
 * dirección ni un texto.
 */
function destinoDe(eje, cinco) {
  if (!Array.isArray(cinco)) return null;
  if (cinco.length === 1 && esReferencia(hoja(cinco[0]))) {
    const registro = idDe(cinco[0]);
    return registro && eje.obtener(registro) ? { libro: null, registro } : null;
  }
  if (cinco.length !== 2) return null;
  const libro = idDe(cinco[0]);
  const registro = idDe(cinco[1]);
  if (!libro || !registro) return null;
  if (libro === eje.genesisId) return eje.obtener(registro) ? { libro: null, registro } : null;
  return { libro, registro };
}

/**
 * Las zonas de la cara de X, los botones que la carta pinta encima de su dibujo: [{ id, origen, etiqueta, caja: [x, y,
 * ancho, alto], destino: { libro, registro } }] (libro null: este libro). Solo cuentan las del autor de X, ancladas en su 0
 * con «a zone of the face». Una zona escrita sobre otra zona (en su 0) la sustituye; con la caja a cero, la retira: de
 * cada zona y de lo que se escribió sobre ella (del mismo autor), manda la más reciente con forma válida (`id` es esa;
 * `origen`, la zona primera, que no cambia al moverla). Una zona con forma inválida no sale. Tope: 24, las más recientes,
 * en el orden en que nacieron. [] si la época del libro no tiene la plantilla, si X no está o si X es una zona.
 */
export function zonas(eje, X) {
  const ev = eventoDe(eje, X);
  const nombre = PLANTILLAS_DE_LA_GUIA.zona;
  if (!ev || !tiene(eje, nombre) || esDe(ev, nombre)) return [];
  const delAutor = new Set([ev.autor]);
  const llegada = llegadas(eje);
  const sobre = (id) => eje.sobreDe(id, EN_EL_CERO, delAutor).filter((r) => esDe(r, nombre));
  const vigentes = [];
  for (const raiz of sobre(ev.id)) {
    // La zona y lo escrito sobre ella, a cualquier profundidad (sustituir la que ya sustituía también vale).
    const todas = [];
    const pendientes = [raiz];
    const vistos = new Set();
    while (pendientes.length) {
      const r = pendientes.pop();
      if (vistos.has(r.id)) continue;
      vistos.add(r.id);
      todas.push(r);
      pendientes.push(...sobre(r.id));
    }
    const leidas = todas.map((r) => ({ r, z: zonaDe(eje, r) })).filter((x) => x.z).sort((a, b) => llegada(b.r.id) - llegada(a.r.id));
    const ultima = leidas[0];
    if (!ultima || ultima.z.retira) continue;
    vigentes.push({ id: ultima.r.id, origen: raiz.id, etiqueta: ultima.z.etiqueta, caja: ultima.z.caja, destino: ultima.z.destino, llegada: llegada(ultima.r.id), nacio: llegada(raiz.id) });
  }
  return vigentes
    .sort((a, b) => b.llegada - a.llegada)
    .slice(0, TOPES_DE_ZONA.porElemento)
    .sort((a, b) => a.nacio - b.nacio)
    .map(({ llegada: _l, nacio: _n, ...z }) => z);
}

// ---------- los pasos de la guía ----------

/** Un parámetro «etiqueta: valor» como [etiqueta, valor] (lo que no lleva «: » es una etiqueta sin valor). */
const parDe = (h) => {
  const s = cadena(h) ?? '';
  const i = s.indexOf(': ');
  return i > 0 ? [s.slice(0, i).trim(), s.slice(i + 2)] : [s.trim(), ''];
};

/**
 * Un paso leído de su registro: { id, titulo, libro, accion, sobre, parametros, porque } o null si su forma no es la de
 * la plantilla (0 el título; 1.0 la acción y 1.1 los parámetros «etiqueta: valor»; 2 el porqué; 5.0 el libro y 5.1 el
 * registro, ids de 64 hexadecimales como datos). El libro de este libro (su génesis) es null, como el que falta; sin
 * registro, null: el alta de quien sigue la guía en ese libro.
 */
function pasoDe(eje, r) {
  const p = r.payload;
  const titulo = cadena(hoja(p[0]));
  const uno = Array.isArray(p[1]) ? p[1] : [];
  const accion = cadena(hoja(uno[0]));
  const porque = cadena(hoja(p[2]));
  if (!titulo || !accion || !porque || !textoLimpio(titulo)) return null;
  // Sin prototipo: un parámetro puede llamarse «__proto__» o «constructor» sin tocar nada más que su propia clave.
  const parametros = Object.create(null);
  for (const h of hojas(uno[1])) {
    if (cadena(h) === null) return null;
    const [etiqueta, valor] = parDe(h);
    if (etiqueta) parametros[etiqueta] = valor;
  }
  const cinco = Array.isArray(p[5]) ? p[5] : [];
  const libro = cinco[0] === undefined ? null : idDe(cinco[0]);
  const sobre = cinco[1] === undefined ? null : idDe(cinco[1]);
  if ((cinco[0] !== undefined && !libro) || (cinco[1] !== undefined && !sobre)) return null;
  return { id: r.id, titulo, libro: libro === eje.genesisId ? null : libro, accion, sobre, parametros, porque };
}

/**
 * Los pasos de la guía X en el orden en que se escribieron: [{ id, titulo, libro, accion, sobre, parametros, porque }]
 * (`libro` null: este libro; `sobre` null: el alta de quien sigue la guía en ese libro; `parametros`, { etiqueta: valor },
 * la forma de una propuesta de la salida externa, §16.6). Solo los del autor de X, anclados en su 4 con «a step of the
 * guide» y con forma válida. [] si la época del libro no tiene la plantilla o X no está.
 */
export function pasosDeGuia(eje, X) {
  const ev = eventoDe(eje, X);
  const nombre = PLANTILLAS_DE_LA_GUIA.paso;
  if (!ev || !tiene(eje, nombre)) return [];
  return eje.sobreDe(ev.id, EN_EL_CUATRO, new Set([ev.autor])).filter((r) => esDe(r, nombre)).map((r) => pasoDe(eje, r)).filter(Boolean);
}

/**
 * Las guías del libro: todo elemento que tenga al menos un paso de su autor (con forma válida), en el orden en que
 * nacieron: [{ id, titulo }] (el título, el texto de su 0). Con `autor`, solo las guías cuyo elemento escribió esa
 * identidad (las mías: la carta no ofrece pasos de la guía de otra persona). [] si la época del libro no tiene la plantilla.
 */
export function guias(eje, { autor } = {}) {
  const nombre = PLANTILLAS_DE_LA_GUIA.paso;
  if (!tiene(eje, nombre)) return [];
  const con = new Set();
  for (const id of eje.orden ?? []) {
    if (eje.esDeLaEpoca?.(id)) continue;
    const r = eje.obtener(id);
    if (!r || r.en !== EN_EL_CUATRO || !esDe(r, nombre) || con.has(r.sobre)) continue;
    const X = eje.obtener(r.sobre);
    if (X && X.autor === r.autor && (autor === undefined || autor === null || X.autor === autor) && pasoDe(eje, r)) con.add(X.id);
  }
  return (eje.orden ?? []).filter((id) => con.has(id)).map((id) => ({ id, titulo: tituloDe(eje, id) }));
}

// ---------- seguir un paso en el libro donde se hace ----------

/** El idioma de quien mira: el que se pide o el de su configuración; sin él, el canónico. */
const idiomaDe = (eje, yo, opciones) => opciones.idioma ?? (yo ? configuracion(eje, yo).language : null) ?? 'en';

/** Un texto de la guía del libro (los de su época, `reason guide …`) con sus huecos {…} rellenos; sin él, el canónico. */
const decir = (eje, clave, original, partes, idioma) => String(texto(eje, clave, idioma, { original }) ?? original).replace(/\{([^{}]+)\}/g, (_, k) => String(partes[k] ?? ''));

/**
 * Los parámetros de un paso para lanzar su acción en el libro `eje`: { parametros } por su nombre canónico y con los
 * valores leídos con su tipo, como un formulario (contrato.desdeLegible; un registro, también por los primeros
 * caracteres de su id, acciones.registroDe), o { motivo } si uno no es de la acción o su valor no se lee. La etiqueta se
 * busca por el nombre canónico y por la etiqueta en el idioma de quien mira, en español y en inglés. La misma lectura que
 * la de una propuesta importada (carta/externa.js, evaluar).
 */
function parametrosParaLanzar(eje, plantilla, dados, { idioma, ejeGuia }) {
  const idiomas = [...new Set([idioma, 'es', 'en'])];
  const pedidos = idiomas.map((i) => parametrosDeLaPlantilla(plantilla, { idioma: i, epoca: eje.epoca(), eje }));
  const fuera = Object.create(null);
  for (const [clave, valor] of Object.entries(dados ?? {})) {
    const k = clave.trim().toLowerCase();
    const p = pedidos.map((l) => l.find((x) => x.nombre.toLowerCase() === k || x.etiqueta.toLowerCase() === k)).find(Boolean);
    const nombre = cadena(hoja(plantilla[0]));
    if (!p) return { motivo: decir(ejeGuia, 'reason guide step unknown parameter', '{parameter}: the action {action} does not ask for it', { parameter: clave, action: nombre }, idioma) };
    if (typeof valor === 'string' && esTipoSimple(p.tipo, { epoca: eje.epoca() })) {
      let r = desdeLegible(valor, p.tipo, { eje, idioma });
      if (r.motivo) {
        const id = registroDe(eje, valor);
        const porId = id ? desdeLegible(id, p.tipo, { eje, idioma }) : null;
        if (porId && !porId.motivo) r = porId;
      }
      if (r.motivo) return { motivo: p.etiqueta + ': ' + r.motivo };
      if (r.valor !== undefined) fuera[p.nombre] = r.valor;
    } else fuera[p.nombre] = valor;
  }
  return { parametros: fuera };
}

/**
 * ¿Está hecho el paso para `yo` en el libro donde se hace (`ejeDestino`, que puede ser otro que el de la guía)? La misma
 * regla que el tutorial del camino (docs/CONTRATO.md §12.5; acciones.hechoPorMi): hay un registro suyo, o de una cosa
 * suya, con esa plantilla en su ancla sobre el registro del paso (sin registro, su alta en ese libro). false si el paso
 * nombra otro libro que `ejeDestino`, si el registro no está, si la acción no existe en su época o si no se puede leer.
 */
export function pasoHecho(ejeDestino, paso, yo, opciones = {}) {
  if (!ejeDestino || !paso || typeof yo !== 'string' || !yo) return false;
  if (paso.libro && paso.libro !== ejeDestino.genesisId) return false;
  const X = paso.sobre ?? ejeDestino.alta(yo)?.id;
  if (!X || !ejeDestino.obtener(X)) return false;
  const plantilla = plantillaDeTransaccion(paso.accion, { epoca: ejeDestino.epoca() });
  if (!plantilla) return false;
  const leidos = parametrosParaLanzar(ejeDestino, plantilla, paso.parametros, { idioma: idiomaDe(ejeDestino, yo, opciones), ejeGuia: ejeDestino });
  return hechoPorMi(ejeDestino, paso.accion, X, yo, leidos.parametros ?? {}, opciones);
}

/**
 * Los pasos de las guías de `ejeGuia` que tocan a X en `ejeAbierto`, en la forma del gancho `sugerencias` de
 * acciones.camino (§12.5, la tercera fuente): los de todas las guías del libro (guias) cuyo libro es el de `ejeAbierto`
 * (o vacío, si los dos son el mismo eje) y cuyo registro es X (o vacío, si X es el alta de `yo`). Cada uno: { plantilla,
 * parametros, sobre, porque, id, guia, hecho } (`guia`, el título de la guía de la que viene; `hecho`, pasoHecho), o, si
 * su acción no existe en la época de `ejeAbierto` o sus parámetros no se leen, { invalida: <motivo>, plantilla, sobre,
 * porque, id, guia }: sale como paso inválido, no se descarta. Solo lee: lanzar el paso es el gesto de siempre.
 * `opciones.idioma`, el de los motivos; `opciones.autor`, solo las guías de esa identidad en el libro de la guía (la
 * carta pasa la mía: un paso de la guía de otra persona no se me ofrece); `opciones.tope`, cuántos pasos como mucho
 * (TOPE_DE_SUGERENCIAS por defecto), cortando al recorrer.
 */
export function sugerenciasDeGuia(ejeGuia, ejeAbierto, X, yo, opciones = {}) {
  const ev = eventoDe(ejeAbierto, X);
  if (!ejeGuia || !ev) return [];
  const mismo = ejeGuia === ejeAbierto;
  const alta = typeof yo === 'string' ? ejeAbierto.alta(yo)?.id ?? null : null;
  const idioma = idiomaDe(ejeAbierto, yo, opciones);
  const epoca = ejeAbierto.epoca();
  const tope = Number.isInteger(opciones.tope) && opciones.tope >= 0 ? opciones.tope : TOPE_DE_SUGERENCIAS;
  const fuera = [];
  for (const g of guias(ejeGuia, { autor: opciones.autor })) {
    if (fuera.length >= tope) break;
    for (const paso of pasosDeGuia(ejeGuia, g.id)) {
      if (fuera.length >= tope) break;
      const libro = paso.libro === null ? (mismo ? ejeAbierto.genesisId : ejeGuia.genesisId) : paso.libro;
      if (libro !== ejeAbierto.genesisId) continue;
      if (paso.sobre ? paso.sobre !== ev.id : ev.id !== alta) continue;
      const base = { plantilla: paso.accion, sobre: ev.id, porque: paso.porque, id: paso.id, guia: g.titulo ?? '' };
      const plantilla = plantillaDeTransaccion(paso.accion, { epoca });
      if (!plantilla) {
        fuera.push({ ...base, invalida: motivo('unknown template', { template: paso.accion }, { idioma, epoca }) });
        continue;
      }
      const leidos = parametrosParaLanzar(ejeAbierto, plantilla, paso.parametros, { idioma, ejeGuia });
      if (leidos.motivo) {
        fuera.push({ ...base, invalida: leidos.motivo });
        continue;
      }
      fuera.push({ ...base, parametros: leidos.parametros, hecho: pasoHecho(ejeAbierto, { ...paso, libro: null }, yo, opciones) });
    }
  }
  return fuera;
}
