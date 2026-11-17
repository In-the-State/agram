// Mi cuenta (etapa 2 del roadmap hasta el MVP): entrar en AGRAM como uno mismo y no como una identidad de ejemplo.
// Una CUENTA es { nombre, idioma, identidad, alta, publica }: un eje propio cuyo génesis es mi alta, escrita por mí
// (una persona: B1) con mi clave pública declarada en ella (B4: la clave va en el 5 del alta) y firmada con la
// privada, que se genera en este dispositivo (src/autoridad.js) y nunca sale de él sin cifrar. Todo lo que decide
// algo lo hace el núcleo: el génesis es Eje.genesis (la única alta sin invitación), el idioma es un registro de
// preferencias en el 9 de mi alta (la plantilla «preferences» de la época, carta/carta.js preferencias), las
// etiquetas del alta las da el contrato, y un eje restaurado pasa por la validación normal (persistencia.restaurar
// revalida cada evento: ids, firmas, saldos).
//
// Lo que vive en este navegador (localStorage, por cuenta, sin mezclarse con los ejemplos):
//   agram.cuentas             la lista de mis cuentas (sin claves privadas)
//   agram.cuenta              la última usada: el id de su alta, o «ejemplo»
//   agram.eje.<alta>          su eje serializado (persistencia.serializar)
//   agram.clave.<alta>        su clave privada: 32 bytes en hexadecimal (BIP-340, src/autoridad.js), como las de las
//                             identidades de ejemplo en agram.claves: tal cual, sin cifrar; solo la frase de la copia
//                             la cifra al salir del navegador
//   agram.local.<alta>.<yo>   el libro local de quien mira en esa cuenta
//   agram.sync.<alta>         su clave de lectura del libro compartido (un secreto: nunca en el eje; va cifrada en la copia)
//   agram.sync.estado.<alta>  el estado de su sincronía (src/sincronia.js serializar: la cola, los órdenes del
//                             servidor, lo rechazado; sin la clave de lectura): carta/sincronia.js
// Los ejemplos siguen en agram.eje, agram.claves, agram.foco, agram.yo, agram.ejemplo y agram.local.<yo>.
//
// La COPIA DE SEGURIDAD es un archivo agram-<nombre>-<8 del libro>.json (A24: antes agram-cuenta-<nombre>.json; el formato
// no cambia) con la clave privada (y, si la hay, la clave de
// lectura del libro compartido) cifrada con una frase (PBKDF2 con sal aleatoria y muchas iteraciones → AES-GCM, con
// el id del alta como dato asociado), la clave pública, el nombre, el id del alta y el eje serializado: una FOTO del
// eje; con el libro compartido configurado, el otro dispositivo baja el resto del servidor al restaurar
// (carta/sincronia.js). La frase no se guarda en ningún sitio; el archivo no lleva nada en claro salvo el nombre, el
// idioma, la identidad, el id y la clave pública (y el eje, que es público por naturaleza).
//
// Una cuenta del GUARDIÁN (camino B, VG 17-11; carta/anfitrion.js) nace en el guardián del anfitrión y firma con él: en
// la lista va con `guardian: true`, no tiene agram.clave.<alta>, y su copia no lleva clave privada.
//
// VARIOS LIBROS (A24, agram-equipo/DISENO_CARTA_VARIOS_LIBROS.md §4.1 y §4.2): una persona es una clave y esa clave tiene
// varios libros. Cada entrada de la lista es «mi sitio en un libro» y gana `libro` (el id del génesis de su eje) y, si el
// libro cuelga de otro, `cuelga: { libro, elemento }` (contrato.cuelgaDe; la carta añade, si lo sabe, `nombre`, el del
// elemento, y `anunciado`). Dos entradas con la misma `publica` son la misma persona en dos libros. Las entradas de antes
// se completan solas al abrirse (completarEntrada). Todo sigue guardado por alta: olvidar un libro no toca los demás.
// `crearCuenta({ conClave })` abre un libro nuevo con una clave que ya tengo (la privada de la entrada abierta o, con el
// guardián, la misma pública: el guardián firma el génesis). Sin `conClave`, «persona nueva»: una clave nueva.
//
// Sin DOM: lo prueba test/cuentas.test.js con el WebCrypto de Node. carta/app.js lo engancha a la pantalla.

import { Eje, autoridad, persistencia, contrato, salida, exterior } from '../src/index.js';
import { plantillaDePreferencias, preferencias } from './carta.js';
import { adjuntarHtmlInicial } from './archivos.js';
import { CLAVES as GUIA, ajustesEditablesDe } from './guia.js';
import { esDePreferencias } from './sitio.js';
import { crearEnElGuardian, firmanteDeCuenta, tieneLaCuenta } from './anfitrion.js';

/** Las claves de localStorage de las cuentas. Las de los ejemplos, aparte (CLAVES_EJEMPLO), y no se cruzan. */
export const CLAVES = Object.freeze({
  cuentas: 'agram.cuentas',
  ultima: 'agram.cuenta',
  eje: (alta) => 'agram.eje.' + alta,
  clave: (alta) => 'agram.clave.' + alta,
  local: (alta, yo) => 'agram.local.' + alta + '.' + yo,
  lectura: (alta) => 'agram.sync.' + alta,
  sincronia: (alta) => 'agram.sync.estado.' + alta,
});

/** Las claves de localStorage de los ejemplos (las de siempre: carta/app.js y carta/ejemplos.js). */
export const CLAVES_EJEMPLO = Object.freeze({
  eje: 'agram.eje',
  claves: 'agram.claves',
  foco: 'agram.foco',
  yo: 'agram.yo',
  ejemplo: 'agram.ejemplo',
  local: (yo) => 'agram.local.' + yo,
});

/** El valor de agram.cuenta cuando lo último usado fue un ejemplo. */
export const EJEMPLO = 'ejemplo';

/** El formato del archivo de copia y su versión. */
export const FORMATO = 'agram-cuenta';
// La 2: claves Schnorr BIP-340 (docs/notas/FIRMAS_BIP340.md). Sin compatibilidad: una copia de la 1 (claves P-256) no
// se restaura.
export const VERSION = 2;

/** Cómo se cifra la clave privada en la copia: PBKDF2 (SHA-256, sal de 16 bytes, 600 000 iteraciones) → AES-GCM 256 (iv de 12 bytes). */
export const CIFRADO = Object.freeze({ kdf: 'PBKDF2', hash: 'SHA-256', iteraciones: 600000, sal: 16, cifrado: 'AES-GCM', bits: 256, iv: 12 });

const subtle = () => globalThis.crypto.subtle;
const utf8 = (s) => new TextEncoder().encode(s);
const aBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aleatorio = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hoja = (x) => (Array.isArray(x) ? x[0] : x);
const texto = (x) => (typeof x === 'string' ? x : undefined);

// ---------- la identidad y el archivo ----------

/**
 * El id de identidad que sale de un nombre: minúsculas, sin acentos, los huecos como guiones («Víctor Gil» →
 * «victor-gil»). Si no queda nada legible, la huella de la clave pública. El nombre entero va en el 0 del alta.
 */
export function identidadDe(nombre, publica) {
  const limpio = String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return limpio || (publica ? autoridad.huella(publica) : '');
}

/**
 * El nombre del archivo de copia de un libro: agram-<nombre>-<8 del libro>.json (dos libros con el mismo nombre no
 * chocan). Sin el id del libro (una entrada de antes sin completar), el del alta.
 */
export function nombreDeArchivo(cuenta) {
  const libro = String(cuenta?.libro ?? cuenta?.alta ?? '').slice(0, 8);
  return 'agram-' + (identidadDe(cuenta?.nombre) || cuenta?.identidad || 'libro') + (libro ? '-' + libro : '') + '.json';
}

/** El nombre del archivo de la copia de todos mis libros: agram-<identidad>-libros.json. */
export const nombreDeArchivoDeTodos = (cuenta) => 'agram-' + (identidadDe(cuenta?.identidad) || 'mis') + '-libros.json';

// ---------- los campos del alta (lo que pide la pantalla de crear) ----------

/** La clave de la preferencia del idioma, como la nombra el contrato (§7): la posición de la configuración cuyo defecto es un idioma de la época. */
function claveIdioma(opciones) {
  const defectos = contrato.configuracion(null, null, opciones);
  const idiomas = contrato.idiomas(opciones);
  return Object.keys(defectos).find((k) => typeof defectos[k] === 'string' && idiomas.includes(defectos[k])) ?? null;
}

/**
 * Los campos que pide crear una cuenta, con las etiquetas, ayudas y marcadores del núcleo en el idioma dado: el
 * nombre (el 0 del alta: la etiqueta de la posición 0 de un registro sin plantilla, la regla corta de la época) y el
 * idioma (la posición «language» de la plantilla «preferences», con los idiomas que tienen mensajes en la época).
 * → [{ nombre: 'nombre' | 'idioma', pv, etiqueta, ayuda, marcador, opciones?, valor? }]
 */
export function camposDelAlta({ idioma, epoca } = {}) {
  const o = { idioma, epoca };
  const candidata = { payload: [] };
  // Sin marcador: el de la regla corta del 0 es un ejemplo de fórmula, no un nombre.
  const campos = [{ nombre: 'nombre', pv: 0, etiqueta: contrato.etiqueta(null, candidata, 0, o), ayuda: contrato.ayuda(null, candidata, 0, o), marcador: [] }];
  const p = plantillaDePreferencias(o);
  const clave = claveIdioma(o);
  if (p && clave) {
    const d = p.registro.findIndex((desc, k) => k > 0 && Array.isArray(desc) && hoja(desc[0]) === clave);
    const desc = d > 0 ? p.registro[d] : null;
    const T = (que, original) => contrato.texto(null, contrato.claves.parametro(p.nombre, clave, que), idioma, { original, epoca });
    const ultima = (x) => (Array.isArray(x) ? x[x.length - 1] : x);
    campos.push({
      nombre: 'idioma', pv: d, clave,
      etiqueta: T('label', clave), ayuda: T('help', texto(ultima(desc?.[9])) ?? ''),
      marcador: [contrato.configuracion(null, null, o)[clave]],
      opciones: contrato.idiomas(o), valor: idioma ?? contrato.configuracion(null, null, o)[clave],
    });
  }
  return campos;
}

// ---------- crear ----------

/**
 * Crea mi cuenta: genera el par de claves en este dispositivo y un eje nuevo cuyo génesis es mi alta, escrita por
 * mí (persona), con el nombre en su 0, la clave pública declarada en ella (su 5) y firmada con la privada. El
 * génesis referencia la época 0 (lo hace Eje.genesis) y es la única alta sin invitación. Si `idioma` difiere del
 * de la época, escribe además mi configuración (un registro «preferences» en el 9 de mi alta, firmado) con él; y los
 * `ajustes` (los defectos del sitio, carta/sitio.js) en el mismo registro y en el de «exterior settings».
 * Con `htmlInicial` (la app lo pide, VG 14-11, #84), la alta nace además con su HTML básico en el PV0 (adjuntarHtmlInicial): un
 * registro más, anclado en la alta; sin él, la cuenta es solo su alta (y lo que se pide: idioma, ajustes).
 * → { cuenta, eje, privada, publica } (las dos claves en hexadecimal)
 *
 * Con `guardian` (camino B, carta/anfitrion.js): la clave pública la da el guardián (crearCuenta({ nombre })) y todo se
 * firma con su firmante (firmanteDeCuenta): en el navegador no se genera ninguna clave privada. La cuenta lleva
 * `guardian: true`. → { cuenta, eje, firmante, publica }. Si el guardián rechaza una firma, lanza con su `code` y no
 * devuelve ningún eje (nada se guarda).
 *
 * Con `conClave` ({ publica, privada } de la entrada abierta; con `guardian`, { publica }), un libro nuevo con una clave
 * que ya tengo (§4.2): no se genera clave ni se pide cuenta nueva al guardián; el génesis lo firma esa clave. `identidad`:
 * la mía en el libro de donde vengo (la misma persona en los dos libros); sin ella, la que sale del nombre. `dialogo`
 * (con guardián): su diálogo se abre en cada firma. La cuenta lleva `libro`, el id de su génesis.
 *
 * `epoca` (opcional): la época con que nace el libro, en su forma escrita (la de `epocaEscritaDe`, también con `cambios` o
 * `{ base, cambios }`: la época por referencia, docs/notas/VERSIONES.md §11); Eje.genesis la valida y la escribe. Sin ella,
 * el génesis nombra la 0 que trae el código.
 */
export async function crearCuenta({ nombre, idioma, ajustes, t = new Date().toISOString(), epoca, htmlInicial = false, guardian = null, conClave = null, identidad = null, dialogo = false } = {}) {
  const limpio = String(nombre ?? '').trim();
  if (!limpio) throw new Error('la cuenta necesita un nombre: el 0 de tu alta');
  const propia = typeof identidad === 'string' && identidad ? identidad : null;
  // Un libro nuevo con una clave que ya tengo (§4.2): con el guardián, la misma pública (él firma el génesis); en el
  // navegador, la privada de la entrada abierta, que ha de ser la pareja de la pública.
  if (conClave) {
    if (!autoridad.clavePublicaValida(conClave.publica)) throw new Error('la clave que ya tienes no es una clave pública válida');
    if (guardian) return crearEnGuardian({ nombre: limpio, idioma, ajustes, t, epoca, htmlInicial, guardian, publica: conClave.publica, identidad: propia, dialogo });
    const privada = conClave.privada;
    if (typeof privada !== 'string' || !mismaClave(autoridad.publicaDe(privada), conClave.publica)) throw new Error('la clave privada no es la pareja de la pública de este libro');
    return crearCon({ nombre: limpio, idioma, ajustes, t, epoca, htmlInicial, publica: conClave.publica, privada, firmar: firmarCon(privada), identidad: propia });
  }
  if (guardian) return crearEnGuardian({ nombre: limpio, idioma, ajustes, t, epoca, htmlInicial, guardian, identidad: propia, dialogo });
  const { publica, privada } = await autoridad.generarClaves();
  return crearCon({ nombre: limpio, idioma, ajustes, t, epoca, htmlInicial, publica, privada, firmar: firmarCon(privada), identidad: propia });
}

/**
 * Camino B: la clave pública, del guardián (o, con `publica`, la que ya tengo: no se le pide una cuenta nueva); las firmas,
 * de su firmante (el eje que mira es el que se está creando, y el libro, el suyo). `dialogo`: el guardián abre siempre su
 * diálogo (abrir un libro privado, §4.8).
 */
async function crearEnGuardian({ guardian, nombre, publica: yaTengo = null, dialogo = false, ...resto }) {
  const publica = yaTengo ?? await crearEnElGuardian(guardian, nombre);
  let creado = null;
  const firmante = firmanteDeCuenta(guardian, publica, { eje: () => creado, dialogo });
  const r = await crearCon({ nombre, ...resto, publica, privada: firmante, firmar: autoridad.firmanteDeEventos(firmante, { publica }), alNacer: (eje) => { creado = eje; } });
  // El HTML inicial no lanza (adjuntarHtmlInicial): si su firma la rechazó el guardián, la cuenta no nace a medias.
  if (firmante.error) throw firmante.error;
  return { cuenta: { ...r.cuenta, guardian: true }, eje: r.eje, firmante, publica };
}

/** Lo común a los dos caminos: el génesis y lo que nace con él, firmado con `privada` (una clave o un firmante) y `firmar`. */
async function crearCon({ nombre: limpio, idioma, ajustes, t, epoca, htmlInicial, publica, privada, firmar, alNacer = () => {}, identidad: propia = null }) {
  const identidad = propia ?? identidadDe(limpio, publica);
  const eje = await Eje.genesis({ identidad, foco: limpio, t, clave: publica, privada, ...(epoca ? { epoca } : {}) });
  alNacer(eje);
  const alta = eje.alta(identidad).id;
  // La época que se dio (escrita) ya vive en el eje: las lecturas de abajo la toman de él.
  const o = {};
  // Los defectos del sitio (carta/sitio.js, `ajustes`: { <clave del ajuste>: valor }) nacen con la cuenta, en los mismos
  // registros de ajustes que escribiría la persona: las preferencias (con el idioma) y, aparte, «exterior settings».
  const propios = Object.fromEntries(Object.entries(ajustes ?? {}).filter(([k]) => esDePreferencias(k)));
  const fuera = Object.fromEntries(Object.entries(ajustes ?? {}).filter(([k]) => !esDePreferencias(k)));
  if (idioma && idioma !== contrato.configuracion(eje, identidad, o)[claveIdioma(o)]) propios[claveIdioma(o)] = idioma;
  if (Object.keys(propios).length) {
    const p = preferencias(eje, identidad, propios, o);
    if (p) await salida.escribirDesde(eje, { modo: 'sequenced', autor: identidad, sobre: p.sobre, en: p.en, payload: p.payload, t }, privada);
  }
  if (Object.keys(fuera).length) {
    const x = ajustesEditablesDe(exterior.AJUSTES.plantilla, eje, identidad, fuera, o);
    if (x?.cambiado) await salida.escribirDesde(eje, { modo: 'sequenced', autor: identidad, sobre: x.sobre, en: x.en, payload: x.payload, t }, privada);
  }
  const cuenta = { nombre: limpio, idioma: idioma ?? contrato.configuracion(eje, identidad, o)[claveIdioma(o)], identidad, alta, publica, libro: eje.genesisId };
  // Toda alta nace con su HTML básico en el PV0 (VG 14-11, #84): «hola» en medio, en el idioma de la cuenta.
  if (htmlInicial) await adjuntarHtmlInicial(eje, alta, identidad, firmar, cuenta.idioma, o);
  return { cuenta, eje, privada, publica };
}

/** Una función que firma con la clave privada de la cuenta (lo que la carta pasa a transaccion, autoejecutar y englobar). */
export const firmarCon = (privada) => (ev) => autoridad.firmar(ev, privada);

// ---------- guardar en este navegador ----------

const leer = (clave) => { try { return globalThis.localStorage?.getItem(clave) ?? null; } catch { return null; } };
const escribir = (clave, valor) => { try { if (!globalThis.localStorage) return false; globalThis.localStorage.setItem(clave, valor); return true; } catch { return false; } };
const borrar = (clave) => { try { globalThis.localStorage?.removeItem(clave); } catch { /* sin almacenamiento */ } };

/** localStorage como comodidad: puede no existir o fallar, y entonces no pasa nada (null al leer; false al guardar). */
export { leer as leerLocal, escribir as guardarLocal };

/** Mis cuentas en este navegador: [{ nombre, idioma, identidad, alta, publica }], sin claves privadas. */
export function cuentas() {
  try {
    const lista = JSON.parse(leer(CLAVES.cuentas) ?? '[]');
    return Array.isArray(lista) ? lista.filter((c) => c && typeof c.alta === 'string' && typeof c.identidad === 'string') : [];
  } catch {
    return [];
  }
}

/** La última cuenta usada (el id de su alta), EJEMPLO si lo último fue un ejemplo, o null si nunca se eligió nada. */
export function ultima() {
  return leer(CLAVES.ultima);
}

export function recordarUltima(alta) {
  return escribir(CLAVES.ultima, alta);
}

/**
 * La entrada de la lista de una cuenta con su eje (§4.1): lo de siempre más `libro` (el id del génesis de su eje) y, si el
 * libro cuelga de otro (contrato.cuelgaDe: «this book hangs from» escrito por el autor del génesis), `cuelga: { libro,
 * elemento }`, con el `nombre` del elemento y `anunciado` que ya supiera la entrada si es el mismo enlace. Sin eje, lo que
 * ya tenía. Nunca lanza.
 */
export function entradaDe(cuenta, eje) {
  const e = { nombre: cuenta.nombre, idioma: cuenta.idioma, identidad: cuenta.identidad, alta: cuenta.alta, publica: cuenta.publica };
  if (cuenta.guardian === true) e.guardian = true;
  let libro = typeof cuenta.libro === 'string' ? cuenta.libro : undefined;
  let cuelga = cuenta.cuelga && typeof cuenta.cuelga === 'object' ? cuenta.cuelga : undefined;
  try {
    if (eje?.genesisId) {
      libro = eje.genesisId;
      const c = contrato.cuelgaDe(eje);
      const antes = cuenta.cuelga;
      cuelga = c ? { libro: c.libro, elemento: c.elemento, ...(antes?.libro === c.libro && antes?.elemento === c.elemento ? soloDatos(antes) : {}) } : undefined;
    }
  } catch { /* lo que ya tenía */ }
  if (libro) e.libro = libro;
  if (cuelga) e.cuelga = cuelga;
  return e;
}

/** Lo que la carta añade a un `cuelga` (el nombre del elemento y si ya se anunció), solo si tiene la forma que toca. */
const soloDatos = (c) => ({ ...(typeof c.nombre === 'string' && c.nombre ? { nombre: c.nombre } : {}), ...(c.anunciado === true ? { anunciado: true } : {}) });

/** ¿Dicen lo mismo dos entradas? (para no reescribir la lista si nada cambió) */
const mismaEntrada = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Completa la entrada guardada de una cuenta con lo que dice su eje (`libro`, `cuelga`): las entradas de antes ganan su
 * libro la primera vez que se abren. Solo reescribe la lista si cambia algo. → la cuenta completada (o la misma).
 */
export function completarEntrada(cuenta, eje) {
  const e = entradaDe(cuenta, eje);
  const lista = cuentas();
  const k = lista.findIndex((c) => c.alta === cuenta.alta);
  if (k >= 0 && !mismaEntrada(lista[k], e)) {
    lista[k] = e;
    escribir(CLAVES.cuentas, JSON.stringify(lista));
  }
  const completa = { ...cuenta, ...e };
  if (!e.cuelga) delete completa.cuelga;
  return completa;
}

/**
 * Marca en la entrada guardada de un libro pequeño lo que la carta sabe de su enlace: el nombre del elemento del que
 * cuelga y si ya se anunció en el libro grande. No toca nada más. → true si la entrada estaba.
 */
export function marcarCuelga(alta, { nombre, anunciado } = {}) {
  const lista = cuentas();
  const k = lista.findIndex((c) => c.alta === alta);
  if (k < 0 || !lista[k].cuelga) return false;
  lista[k] = { ...lista[k], cuelga: { ...lista[k].cuelga, ...soloDatos({ nombre, anunciado }) } };
  return escribir(CLAVES.cuentas, JSON.stringify(lista));
}

/**
 * Guarda una cuenta en este navegador: la lista (su entrada, con `libro` y `cuelga`: entradaDe), su eje, su clave privada
 * (hex, como las de ejemplo; repetida por alta: olvidar un libro no toca los demás) y, si viene (una copia restaurada que
 * la llevaba), su clave de lectura. Con `recordar` (por defecto), es la última usada. Devuelve false si no hay almacenamiento.
 */
export async function guardarCuenta({ cuenta, eje, privada, claveLectura }, { recordar = true } = {}) {
  const entrada = entradaDe(cuenta, eje);
  // Una cuenta del guardián (camino B): su clave vive en el guardián; aquí, la lista (con la marca), el eje y la de lectura.
  if (cuenta.guardian === true) {
    const otras = cuentas().filter((c) => c.alta !== cuenta.alta);
    otras.push(entrada);
    const bien = escribir(CLAVES.cuentas, JSON.stringify(otras)) && persistencia.guardarLocal(eje, CLAVES.eje(cuenta.alta))
      && (!claveLectura || guardarClaveLectura(cuenta.alta, claveLectura));
    if (bien && recordar) recordarUltima(cuenta.alta);
    return bien;
  }
  const guardable = await autoridad.exportarPrivada(privada);
  const lista = cuentas().filter((c) => c.alta !== cuenta.alta);
  lista.push(entrada);
  const ok = escribir(CLAVES.cuentas, JSON.stringify(lista)) && escribir(CLAVES.clave(cuenta.alta), guardable) && persistencia.guardarLocal(eje, CLAVES.eje(cuenta.alta))
    && (!claveLectura || guardarClaveLectura(cuenta.alta, claveLectura));
  if (ok && recordar) recordarUltima(cuenta.alta);
  return ok;
}

/** La clave de lectura del libro compartido de una cuenta (agram.sync.<alta>), o null. Nunca va en el eje. */
export function claveLectura(alta) {
  const v = leer(CLAVES.lectura(alta));
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Guarda la clave de lectura de una cuenta; vacía, la borra. Devuelve false si no hay almacenamiento. */
export function guardarClaveLectura(alta, clave) {
  const v = typeof clave === 'string' ? clave.trim() : '';
  if (!v) { borrar(CLAVES.lectura(alta)); return true; }
  return escribir(CLAVES.lectura(alta), v);
}

/** El estado guardado de la sincronía de una cuenta (lo que dio Sincronia#serializar), o null. */
export function estadoSincronia(alta) {
  try {
    const datos = JSON.parse(leer(CLAVES.sincronia(alta)) ?? 'null');
    return datos && typeof datos === 'object' ? datos : null;
  } catch {
    return null;
  }
}

/** Guarda el estado de la sincronía de una cuenta (Sincronia#serializar: sin la clave de lectura). */
export function guardarEstadoSincronia(alta, datos) {
  return escribir(CLAVES.sincronia(alta), JSON.stringify(datos));
}

/** Guarda solo el eje de una cuenta (tras cada registro nuevo). */
export function guardarEje(cuenta, eje) {
  return persistencia.guardarLocal(eje, CLAVES.eje(cuenta.alta));
}

/**
 * Abre una cuenta guardada en este navegador: restaura su eje (revalidado) y lee su clave privada; comprueba que
 * el eje declara para mi identidad la clave pública de la cuenta. → { cuenta, eje, privada, publica } o, si falta
 * algo o no cuadra, sin `eje` y con el motivo en `motivo` (si lo que falta es solo el eje, con `privada`: la carta
 * puede bajarlo del libro compartido, carta/sincronia.js). Una cuenta de antes de las firmas BIP-340 (su clave
 * privada guardada no es hexadecimal: era un JWK P-256) no se abre: va con `antigua: true`.
 *
 * Una cuenta del guardián (`guardian: true`, camino B) no tiene clave aquí: se abre con su eje y, si el guardián de este
 * equipo (`guardian`, carta/anfitrion.js) no tiene su clave pública en cuentas() (o no hay guardián), con `soloLeer:
 * true`. → { cuenta, eje, publica, soloLeer? } o, sin eje, { cuenta, publica, soloLeer?, motivo }.
 */
export async function abrirCuenta(alta, { guardian = null } = {}) {
  const cuenta = cuentas().find((c) => c.alta === alta);
  if (!cuenta) return { motivo: 'no hay ninguna cuenta con ese alta en este navegador' };
  if (cuenta.guardian === true) return abrirDelGuardian(cuenta, guardian);
  try {
    const guardada = leer(CLAVES.clave(alta));
    if (!guardada) return { cuenta, motivo: 'la clave privada de la cuenta no está en este navegador' };
    if (!/^[0-9a-f]{64}$/.test(guardada)) return { cuenta, antigua: true, motivo: 'la clave privada guardada no es una clave BIP-340 (cuenta de antes del cambio de firmas)' };
    const privada = await autoridad.importarPrivada(guardada);
    if (autoridad.publicaDe(privada) !== cuenta.publica) return { cuenta, motivo: 'la clave privada guardada no es la pareja de la pública de la cuenta' };
    const eje = await persistencia.cargarLocal(CLAVES.eje(alta));
    if (!eje) return { cuenta, privada, publica: cuenta.publica, motivo: 'el eje de la cuenta no está o no se ha podido abrir' };
    if (!mismaClave(eje.clave(cuenta.identidad), cuenta.publica) || eje.alta(cuenta.identidad)?.id !== alta) return { cuenta, motivo: 'el eje guardado no declara la clave de la cuenta' };
    return { cuenta: completarEntrada(cuenta, eje), eje, privada, publica: cuenta.publica };
  } catch (e) {
    return { cuenta, motivo: String(e?.message ?? e) };
  }
}

/** Abre una cuenta del guardián: su eje (revalidado) y si este guardián tiene su clave (casando por la pública, nunca por el nombre). */
async function abrirDelGuardian(cuenta, guardian) {
  const lectura = (await tieneLaCuenta(guardian, cuenta.publica)) ? {} : { soloLeer: true };
  try {
    const eje = await persistencia.cargarLocal(CLAVES.eje(cuenta.alta));
    if (!eje) return { cuenta, publica: cuenta.publica, ...lectura, motivo: 'el eje de la cuenta no está o no se ha podido abrir' };
    if (!mismaClave(eje.clave(cuenta.identidad), cuenta.publica) || eje.alta(cuenta.identidad)?.id !== cuenta.alta) return { cuenta, motivo: 'el eje guardado no declara la clave de la cuenta' };
    return { cuenta: completarEntrada(cuenta, eje), eje, publica: cuenta.publica, ...lectura };
  } catch (e) {
    return { cuenta, motivo: String(e?.message ?? e) };
  }
}

/** ¿Está la cuenta (de la copia restaurada, por ejemplo) en este guardián? Si no, `soloLeer: true`. Una del camino A, tal cual. */
export async function conGuardian(r, guardian) {
  if (r?.cuenta?.guardian !== true) return r;
  return (await tieneLaCuenta(guardian, r.cuenta.publica)) ? r : { ...r, soloLeer: true };
}

/**
 * Olvida una cuenta en este navegador: su eje, su clave privada, sus libros locales, su clave de lectura, el estado de
 * su sincronía y su entrada en la lista. Sin copia, no se recupera. Todo va por alta: los demás libros de la misma clave
 * (su privada está repetida en su propia entrada) no se tocan.
 */
export function olvidarCuenta(alta, identidades = []) {
  const lista = cuentas().filter((c) => c.alta !== alta);
  escribir(CLAVES.cuentas, JSON.stringify(lista));
  borrar(CLAVES.eje(alta));
  borrar(CLAVES.clave(alta));
  borrar(CLAVES.lectura(alta));
  borrar(CLAVES.sincronia(alta));
  borrar(GUIA.ia(alta)); // la clave de la guía (vía directa) y su conversación, también de este navegador
  borrar(GUIA.historial(alta));
  for (const yo of identidades) borrar(CLAVES.local(alta, yo));
  if (ultima() === alta) borrar(CLAVES.ultima);
}

/** Las claves de localStorage que usa una cuenta (para comprobar que no se cruzan con las de los ejemplos). */
export function clavesDe(cuenta, identidades = [cuenta.identidad]) {
  return [CLAVES.cuentas, CLAVES.ultima, CLAVES.eje(cuenta.alta), CLAVES.clave(cuenta.alta), CLAVES.lectura(cuenta.alta), CLAVES.sincronia(cuenta.alta), ...identidades.map((yo) => CLAVES.local(cuenta.alta, yo))];
}

/** ¿Son la misma clave pública (el mismo texto hexadecimal x-only)? */
export function mismaClave(a, b) {
  return typeof a === 'string' && a !== '' && a === b;
}

// ---------- la copia de seguridad ----------

/** La clave AES derivada de la frase con PBKDF2 (los parámetros vienen del archivo o de CIFRADO). */
async function claveDeFrase(frase, sal, iteraciones) {
  const base = await subtle().importKey('raw', utf8(frase), CIFRADO.kdf, false, ['deriveKey']);
  return subtle().deriveKey({ name: CIFRADO.kdf, hash: CIFRADO.hash, salt: sal, iterations: iteraciones }, base, { name: CIFRADO.cifrado, length: CIFRADO.bits }, false, ['encrypt', 'decrypt']);
}

/**
 * Exporta la cuenta como archivo de copia: la clave privada cifrada con la frase (y, si se da, la clave de lectura
 * del libro compartido, dentro de lo cifrado), la pública, el nombre, el idioma, la identidad, el id del alta y el eje
 * serializado (una foto). La frase no se guarda. → el objeto del archivo (JSON).
 *
 * Lo cifrado es { privada } o, con clave de lectura, { privada, claveLectura } (la privada en hexadecimal).
 *
 * La de una cuenta del guardián (camino B) no lleva clave privada: la cuenta, el eje y la marca `guardian: true`; si hay
 * clave de lectura, cifrada con la frase como hoy ({ claveLectura }); si no, sin `clave`.
 */
export async function exportarCuenta({ cuenta, eje, privada, claveLectura }, frase, { iteraciones = CIFRADO.iteraciones, t = new Date().toISOString() } = {}) {
  if (typeof frase !== 'string' || !frase) throw new Error('la copia necesita una frase');
  if (cuenta.guardian === true) {
    const deLectura = typeof claveLectura === 'string' ? claveLectura.trim() : '';
    let cifrada = null;
    if (deLectura) {
      const sal = aleatorio(CIFRADO.sal);
      const iv = aleatorio(CIFRADO.iv);
      const datos = await subtle().encrypt({ name: CIFRADO.cifrado, iv, additionalData: utf8(cuenta.alta) }, await claveDeFrase(frase, sal, iteraciones), utf8(JSON.stringify({ claveLectura: deLectura })));
      cifrada = { kdf: CIFRADO.kdf, hash: CIFRADO.hash, iteraciones, sal: aBase64(sal), cifrado: CIFRADO.cifrado, iv: aBase64(iv), datos: aBase64(datos) };
    }
    return {
      formato: FORMATO, version: VERSION, exportado: t, nombre: cuenta.nombre, idioma: cuenta.idioma, identidad: cuenta.identidad, alta: cuenta.alta, publica: cuenta.publica,
      guardian: true, ...(cifrada ? { clave: cifrada } : {}), eje: persistencia.serializar(eje),
    };
  }
  const guardable = await autoridad.exportarPrivada(privada);
  const sal = aleatorio(CIFRADO.sal);
  const iv = aleatorio(CIFRADO.iv);
  const clave = await claveDeFrase(frase, sal, iteraciones);
  const lectura = typeof claveLectura === 'string' ? claveLectura.trim() : '';
  const secreto = lectura ? { privada: guardable, claveLectura: lectura } : { privada: guardable };
  const datos = await subtle().encrypt({ name: CIFRADO.cifrado, iv, additionalData: utf8(cuenta.alta) }, clave, utf8(JSON.stringify(secreto)));
  return {
    formato: FORMATO,
    version: VERSION,
    exportado: t,
    nombre: cuenta.nombre,
    idioma: cuenta.idioma,
    identidad: cuenta.identidad,
    alta: cuenta.alta,
    publica: cuenta.publica,
    clave: { kdf: CIFRADO.kdf, hash: CIFRADO.hash, iteraciones, sal: aBase64(sal), cifrado: CIFRADO.cifrado, iv: aBase64(iv), datos: aBase64(datos) },
    eje: persistencia.serializar(eje),
  };
}

/** El texto del archivo de copia, como se descarga. */
export const textoDeArchivo = (archivo) => JSON.stringify(archivo);

/** La frase no abre el archivo: un solo motivo, sin pistas (la frase está mal o el archivo no es el que era). */
export const FRASE_INCORRECTA = 'la frase no abre esta copia (frase incorrecta o archivo dañado)';

/**
 * Restaura una cuenta desde su archivo de copia y la frase: descifra la clave privada (y la de lectura, si la
 * lleva), comprueba que es la pareja de la pública, restaura el eje (persistencia.restaurar: cada evento
 * se revalida) y comprueba que el eje declara esa clave para la identidad en su alta. → { cuenta, eje, privada,
 * publica, claveLectura } (claveLectura: undefined si la copia no la lleva). Lanza con un motivo claro.
 */
export async function restaurarCuenta(archivo, frase) {
  const a = typeof archivo === 'string' ? JSON.parse(archivo) : archivo;
  if (!a || a.formato !== FORMATO || !Number.isInteger(a.version)) throw new Error('el archivo no es una copia de una cuenta de AGRAM');
  // `antigua`: una copia de antes de las firmas BIP-340 (la 1, claves P-256): la carta lo dice con su texto.
  if (a.version !== VERSION) throw Object.assign(new Error('copia de la versión ' + a.version + '; esta carta lee la ' + VERSION), { antigua: a.version < VERSION });
  if (a.guardian === true) return restaurarDelGuardian(a, frase);
  const c = a.clave;
  if (!c || c.kdf !== CIFRADO.kdf || c.cifrado !== CIFRADO.cifrado || typeof c.sal !== 'string' || typeof c.iv !== 'string' || typeof c.datos !== 'string' || !Number.isSafeInteger(c.iteraciones) || c.iteraciones < 1) {
    throw new Error('el archivo no lleva la clave cifrada como esta carta la escribe');
  }
  if (typeof a.alta !== 'string' || typeof a.identidad !== 'string' || !autoridad.clavePublicaValida(a.publica)) throw new Error('el archivo no lleva la identidad, el alta y la clave pública');
  if (typeof frase !== 'string' || !frase) throw new Error(FRASE_INCORRECTA);
  let guardada;
  let claveLectura;
  try {
    const clave = await claveDeFrase(frase, deBase64(c.sal), c.iteraciones);
    const claro = await subtle().decrypt({ name: CIFRADO.cifrado, iv: deBase64(c.iv), additionalData: utf8(a.alta) }, clave, deBase64(c.datos));
    const secreto = JSON.parse(new TextDecoder().decode(claro));
    guardada = secreto?.privada;
    if (secreto && typeof secreto.claveLectura === 'string' && secreto.claveLectura) claveLectura = secreto.claveLectura;
  } catch {
    throw new Error(FRASE_INCORRECTA);
  }
  let privada;
  try {
    privada = await autoridad.importarPrivada(guardada);
  } catch {
    privada = null;
  }
  if (!privada || !mismaClave(autoridad.publicaDe(privada), a.publica)) throw new Error('la clave privada de la copia no es la pareja de la pública');
  const eje = await persistencia.restaurar(a.eje);
  if (!mismaClave(eje.clave(a.identidad), a.publica) || eje.alta(a.identidad)?.id !== a.alta) throw new Error('el eje de la copia no declara esa clave para ' + a.identidad + ' en su alta');
  // La copia no cambia de formato: el libro (y de qué cuelga) se lee del eje restaurado (entradaDe).
  const cuenta = entradaDe({ nombre: String(a.nombre ?? a.identidad), idioma: typeof a.idioma === 'string' ? a.idioma : undefined, identidad: a.identidad, alta: a.alta, publica: a.publica }, eje);
  return { cuenta, eje, privada, publica: cuenta.publica, claveLectura };
}

/**
 * La copia de una cuenta del guardián (camino B): sin clave privada. Si lleva la clave de lectura, la frase la descifra;
 * el eje se restaura (revalidado) y ha de declarar la clave pública para la identidad en su alta. → { cuenta (con
 * `guardian: true`), eje, publica, claveLectura }: se abre para leer hasta que el guardián de este equipo tenga la cuenta
 * (conGuardian).
 */
async function restaurarDelGuardian(a, frase) {
  if (typeof a.alta !== 'string' || typeof a.identidad !== 'string' || !autoridad.clavePublicaValida(a.publica)) throw new Error('el archivo no lleva la identidad, el alta y la clave pública');
  let claveLectura;
  const c = a.clave;
  if (c !== undefined) {
    if (!c || c.kdf !== CIFRADO.kdf || c.cifrado !== CIFRADO.cifrado || typeof c.sal !== 'string' || typeof c.iv !== 'string' || typeof c.datos !== 'string' || !Number.isSafeInteger(c.iteraciones) || c.iteraciones < 1) {
      throw new Error('el archivo no lleva la clave cifrada como esta carta la escribe');
    }
    if (typeof frase !== 'string' || !frase) throw new Error(FRASE_INCORRECTA);
    try {
      const clave = await claveDeFrase(frase, deBase64(c.sal), c.iteraciones);
      const claro = await subtle().decrypt({ name: CIFRADO.cifrado, iv: deBase64(c.iv), additionalData: utf8(a.alta) }, clave, deBase64(c.datos));
      const secreto = JSON.parse(new TextDecoder().decode(claro));
      if (secreto && typeof secreto.claveLectura === 'string' && secreto.claveLectura) claveLectura = secreto.claveLectura;
    } catch {
      throw new Error(FRASE_INCORRECTA);
    }
  }
  const eje = await persistencia.restaurar(a.eje);
  if (!mismaClave(eje.clave(a.identidad), a.publica) || eje.alta(a.identidad)?.id !== a.alta) throw new Error('el eje de la copia no declara esa clave para ' + a.identidad + ' en su alta');
  const cuenta = entradaDe({ nombre: String(a.nombre ?? a.identidad), idioma: typeof a.idioma === 'string' ? a.idioma : undefined, identidad: a.identidad, alta: a.alta, publica: a.publica, guardian: true }, eje);
  return { cuenta, eje, publica: cuenta.publica, claveLectura };
}

// ---------- la copia de todos mis libros (§4.7) ----------

/** El formato del archivo con la copia de todos mis libros: la lista de las copias de cada libro, tal cual. */
export const FORMATO_DE_TODOS = 'agram-libros';
export const VERSION_DE_TODOS = 1;

/**
 * La copia de todos mis libros: un archivo que es la lista de las copias de cada libro tal cual (exportarCuenta, con la
 * misma frase; la de un libro del guardián, sin privada, como siempre). `libros`: [{ cuenta, eje, privada, claveLectura }].
 * → { formato, version, exportado, copias: [archivo de cada libro] }.
 */
export async function exportarTodos(libros, frase, { iteraciones = CIFRADO.iteraciones, t = new Date().toISOString() } = {}) {
  if (typeof frase !== 'string' || !frase) throw new Error('la copia necesita una frase');
  const copias = [];
  for (const l of libros ?? []) copias.push(await exportarCuenta(l, frase, { iteraciones, t }));
  return { formato: FORMATO_DE_TODOS, version: VERSION_DE_TODOS, exportado: t, copias };
}

/** ¿Es este archivo (o su texto) la copia de todos mis libros? Nunca lanza. */
export function esCopiaDeTodos(archivo) {
  try {
    const a = typeof archivo === 'string' ? JSON.parse(archivo) : archivo;
    return Boolean(a) && a.formato === FORMATO_DE_TODOS;
  } catch {
    return false;
  }
}

/**
 * Restaura la copia de todos mis libros con la frase: cada copia de la lista por restaurarCuenta, una a una. Una entrada
 * mala no estropea las demás: se dice cuál falló (su posición, su nombre si lo lleva y el motivo). → { restaurados: [lo que
 * da restaurarCuenta], fallidos: [{ posicion, nombre, libro, motivo }] }. Lanza solo si el archivo no es una copia de todos.
 */
export async function restaurarTodos(archivo, frase) {
  let a;
  try {
    a = typeof archivo === 'string' ? JSON.parse(archivo) : archivo;
  } catch {
    a = null;
  }
  if (!a || a.formato !== FORMATO_DE_TODOS || !Number.isInteger(a.version)) throw new Error('el archivo no es una copia de todos tus libros');
  if (a.version !== VERSION_DE_TODOS) throw new Error('copia de todos tus libros de la versión ' + a.version + '; esta carta lee la ' + VERSION_DE_TODOS);
  if (!Array.isArray(a.copias)) throw new Error('el archivo no lleva la lista de las copias');
  const restaurados = [];
  const fallidos = [];
  for (let k = 0; k < a.copias.length; k++) {
    const c = a.copias[k];
    const nombre = typeof c?.nombre === 'string' ? c.nombre : null;
    const libro = typeof c?.alta === 'string' ? c.alta.slice(0, 8) : null;
    try {
      restaurados.push(await restaurarCuenta(c, frase));
    } catch (e) {
      fallidos.push({ posicion: k + 1, nombre, libro, motivo: String(e?.message ?? e) });
    }
  }
  return { restaurados, fallidos };
}
