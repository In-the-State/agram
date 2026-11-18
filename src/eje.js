// Eje: la secuencia de registros con anclaje. Hoy vive en memoria; mañana en
// una base de datos o anclado a una cadena, sin cambiar el modelo.
// Una identidad existe cuando tiene cuenta en el libro: la abre su ALTA, la
// primera transacción que la toca. Persona y cosa no se declaran (VG, 10-11,
// B1: desaparece el tipo): una PERSONA es la identidad cuya alta escribió ella
// misma (quien no tiene cuenta y escribe, escribe su propia alta, con su clave
// si la tiene); una COSA, la que recibió tokens en un alta escrita por otra
// identidad, su dueño (esPersona). El génesis
// emite por convención E, P y R, nunca T (VG, 8-11: no hay T acumulable);
// después solo emiten las personas (VG, 7-11 noche), con las reglas de
// src/ciclo.js: T no se emite, es la asignación diaria de cada persona
// (VG, 8-11), y R, P y E escalonados. Un movimiento puede bloquear o liberar
// E, P o R (T no) sin cambiar de titular: el saldo es lo disponible y lo
// bloqueado se lleva aparte.
//
// La capa cero (VG, 9-11: «la capa de abajo es la de transacciones»;
// «registrar es hacer una transacción»): por dentro, el eje es una envoltura
// del LIBRO (src/libro.js). Cada evento se traduce a una transacción
// (eje.transaccion): sus movimientos son primitivas (de = null es acuñar;
// a = null, quemar; estado 'bloqueo' o 'liberacion', bloquear o liberar; lo
// demás, transferir), `sobre` y `en` son el anclaje y el payload es el memo.
// Las reglas son CONDICIONES DE VALIDEZ de esa transacción
// (src/condiciones/), las de siempre envueltas tal cual y en el mismo orden;
// el libro las evalúa sobre la vista de antes del evento y aplica la
// transacción entera o nada. Saldos, bloqueos, lo emitido y lo consumido de
// cada serie, el T gastado del día y el T consumido sobre cada registro se
// leen del libro. Correspondencia completa: docs/notas/CAPA_CERO.md.
//
// Sin clave no se actúa (R9, docs/notas/NEUTRALIDAD_IDENTIDAD.md §4; regla
// madre aceptada por VG, 7-11 noche): una identidad sin clave registrada no
// escribe, así que no mueve tokens, no autoriza ni escribe bases (todo evento
// mueve T de su autor). El génesis declara la clave de su autor y va firmado
// con ella, y cada clave que declara un alta llega con su prueba de posesión
// (`posesion`: la clave nueva firma el id del alta). Un eje marcado como
// DEMOSTRACIÓN en su génesis (`contexto.demostracion: true`) conserva lo de
// antes: sin clave no se firma, y la prueba de posesión es opcional (si va,
// se comprueba). Los ejemplos de Ikisai y la interfaz son de demostración.
// No hay identidades de grupo (VG, 8-11): un grupo es un registro con P
// delegado. Solo el prefijo de la versión 2 (suelo de persistencia) conserva
// los tipos que declaraban sus altas.
//
// La E va atada al registro del recurso, con un tope compartido igual a su
// capacidad y emitida en proporción al P bloqueado (VG, 7-11 noche, R2 del
// estudio de neutralidad): reglasDelTope, en src/condiciones/tope.js.

import { claveToken, origenDe, cantidadBase, partirClave, validarMovimiento, capacidadDe, franjaDe, familiaDe, TODAS_LAS_FRANJAS, ESCALAS_T, ESCALAS_REALES, ESCALAS_INFORMATIVAS, asignacionT, AMBITO_GENESIS, ambitoDe, esAnunciado } from './tokens.js';
import { acotarAltaV2, gastaAsignacion, esInformativoT, validosDe } from './ciclo.js';
import { evaluarEscritura, nombreDeRegla, CAUSA_LIMITE } from './bqlm.js';
import { EPOCA_0_BTML, EPOCAS_POR_ID, cargarEpocaEscrita, epocaEscritaDe, erroresDeEpocaEscrita, idDeRegistro } from './epocas.js';
// La época del libro de cuenta, registrada por su id al cargar este módulo (src/epoca-cuenta.js): un génesis que la nombra
// se lee con ella y no cae a la 0, en la carta, en be.mjs y en las pruebas.
import './epoca-cuenta.js';
import { msUTC, msDeGuardado, segundosUTC, esInstante } from './instante.js';
import { crearEvento, validarForma, normalizarEvento, esConsumoT, esPresente, canonico, verificarId, RAIZ, cuerpo, hash, congelar, esMiembroDeTanda, fallosDeTanda, partirTandas, prefijosAMiembros, TANDA_MAXIMA, TANDA_MINIMA, REGLA_NO_CABE, bytesDeMiembro, bytesDeTanda } from './evento.js';
import { sha256, aHex } from './cripto.js';
import { firmar, firmarPosesion, verificar } from './autoridad.js';
import { Libro, EMISION, acunar, transferir, bloquear, liberar, quemar, transaccion } from './libro.js';
import { condicionesDe, CONDICIONES_GENESIS, CONDICIONES_GENESIS_GUARDADO, SIN_CAPACIDAD, contratoE } from './condiciones/index.js';
import { ContextoEje } from './contexto-eje.js';
import { quemaDelCoste } from './escritura.js';
import { validarPayload } from './btml.js';
import { bifurcacion } from './sello.js';
import { motivosAlProponer, entradaEnVigor, dice, PROPONER, PONER_EN_VIGOR } from './versiones.js';

export { reglasDelTope, SIN_CAPACIDAD } from './condiciones/tope.js';

/**
 * La décupla del sello de tiempo del SIP 0 que se guarda con un sello (marcarSello), copiada y congelada, o null si no
 * vale: BTML válido (validarPayload), de una a diez posiciones, «sello de tiempo» en su 0 y, en su primer nivel, el id del
 * registro, la altura y el hash del sello (dónde va cada cosa lo dice src/sello.js, POSICIONES_DEL_SELLO: aquí no se fija,
 * para que cambiar la forma del sello sea tocar un sitio). No comprueba la prueba: eso es de la regla «sealed».
 */
function decuplaDeSelloValida(d, id, altura, hash) {
  if (!Array.isArray(d) || d.length < 1 || d.length > 10) return null;
  try {
    if (!validarPayload(d).ok) return null;
  } catch {
    return null;
  }
  const cero = Array.isArray(d[0]) ? d[0] : [d[0]];
  if (!cero.includes('sello de tiempo') || !d.includes(id) || !d.includes(altura) || !d.includes(hash)) return null;
  const congelar = (x) => (Array.isArray(x) ? Object.freeze(x.map(congelar)) : x);
  return congelar(JSON.parse(JSON.stringify(d)));
}

/** El esquema del recibo único de StateArk (SIP 0, B19): el sobre del recibo de pago que se copia en X.6.8.3. */
const ESQUEMA_RECIBO = 'stateark.recibo@1';

/**
 * El recibo de pago que se guarda con un registro (marcarPago), copiado y congelado, o null si no vale: un sobre del
 * recibo único de StateArk (`stateark.recibo@1`, SIP 0 B19; la sim, `Custodia.firmarRecibo` sobre `Carril.reciboPago`)
 * { schema, emisor, t, recibo, id, firma } de clase «pago», con su décupla BTML válida (validarPayload) de cinco
 * posiciones (0 ["recibo", "pago"], 1 el sujeto, el txid, 2 las claves, 3 los valores, 4 la evidencia), y cuyo id es el
 * de su cuerpo: el NÚCLEO lo recalcula, SHA-256 de canonico({ schema, emisor, t, recibo }) (el canonico de los eventos;
 * el BQL mínimo no serializa décuplas, así que la regla no puede). Lo copiado es esa décupla y, detrás, lo del sobre que
 * la regla «paid» necesita para la firma: 5 el emisor, 6 su t, 7 el id, 8 la firma (src/sello.js POSICIONES_DEL_PAGO).
 * No comprueba la firma ni la evidencia: eso es de la regla «paid» (X.6.8.6).
 */
function decuplaDePagoValida(sobre) {
  if (!sobre || typeof sobre !== 'object' || sobre.schema !== ESQUEMA_RECIBO) return null;
  const { emisor, t, recibo, id, firma } = sobre;
  if (typeof emisor !== 'string' || !/^[0-9a-f]{64}$/.test(emisor) || !esInstante(t) || typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id) || typeof firma !== 'string' || !/^[0-9a-f]{128}$/.test(firma)) return null;
  if (!Array.isArray(recibo) || recibo.length !== 5 || !Array.isArray(recibo[0]) || recibo[0][0] !== 'recibo' || recibo[0][1] !== 'pago') return null;
  try {
    if (!validarPayload(recibo).ok) return null;
  } catch {
    return null;
  }
  if (aHex(sha256(new TextEncoder().encode(canonico({ schema: ESQUEMA_RECIBO, emisor, t, recibo })))) !== id) return null;
  const congelar = (x) => (Array.isArray(x) ? Object.freeze(x.map(congelar)) : x);
  return congelar([...JSON.parse(JSON.stringify(recibo)), emisor, t, id, firma]);
}

/** Caracteres del id por los que conPrefijo agrupa los ids (16⁴ grupos: con 20.000 registros, casi uno por grupo). */
const PREFIJO = 4;

/** Clases de acuñación del libro que usa el eje (src/libro.js): la asignación diaria de T y el T informativo. */
const ASIGNACION = 'asignacion';
const INFORMATIVO = 'informativo';
/**
 * Clases del P nuevo (encargo 3b, mapa §15): la OBTENCIÓN, lo que acuñan las reglas que escriben de la época al
 * conseguir E, escribir un registro propio o recibir R (diez unidades posicionadas: N1, N2, N3), y la REPOSICIÓN,
 * lo que se acuña al mover P por el árbol (subir deja una décima, bajar añade una décima: N7).
 */
export const OBTENCION = 'obtencion';
export const REPOSICION_P = 'reposicion';

/** Diez por unidad: la constante de la obtención de la época (`epoch.1.1.4.1`), para el tope por serie. */
const diezPorUnidad = (epoca) => Number((epoca.registro ?? epoca.payload)?.[1]?.[1]?.[4]?.[1]?.[0]) || 10;

/**
 * Las épocas escritas ya resueltas, por el id de su raíz y los de sus registros: cargar y fusionar una época es una
 * lectura pura de lo escrito, y el eje de antes (eje.antes) la vuelve a pedir. Una entrada por época distinta.
 */
const RESUELTAS = new Map();
function resolverEscrita(escrita) {
  const parte = (p) => idDeRegistro(p.raiz) + ':' + p.registros.map(idDeRegistro).join(',');
  // La llave, como JSON de una lista: una «base» mal escrita (con los separadores dentro) no puede hacerse pasar por
  // otra época ya resuelta y saltarse así la comprobación de cargarEpocaEscrita.
  const llave = JSON.stringify([escrita.base !== undefined ? { base: String(escrita.base) } : parte(escrita), ...(escrita.cambios ?? []).map(parte)]);
  if (!RESUELTAS.has(llave)) RESUELTAS.set(llave, cargarEpocaEscrita(escrita));
  return RESUELTAS.get(llave);
}

/**
 * La época escrita que rehacen los registros de la época de un libro, en orden: { raiz, registros } y, si los hay, sus
 * `cambios` (tramo 4, la época por referencia): cada registro de un cambio dice en su contexto a qué cambio pertenece
 * (`cambio`, 1, 2…) y, el primero, que es su raíz (`raizDelCambio`). Si no hay registros de nacimiento (el primero es
 * ya de un cambio), el libro nació con la época del código que nombra su génesis (`base`, su id): { base, cambios }. El
 * orden lo vigila #erroresDeEpoca.
 */
function escritaDeRegistros(eventos, base) {
  const partes = [];
  for (const ev of eventos) {
    const k = ev.contexto?.cambio ?? 0;
    (partes[k] ??= []).push(ev.payload);
  }
  const [nacimiento, ...cambios] = partes;
  const escrita = nacimiento ? { raiz: nacimiento[0], registros: nacimiento.slice(1) } : { base };
  if (cambios.length) escrita.cambios = cambios.map((p) => ({ raiz: p[0], registros: p.slice(1) }));
  return escrita;
}

/** ¿Es `ev` un registro de la época (la apertura del génesis que la escribe, #107)? */
const esRegistroDeEpoca = (ev) => ev?.contexto?.registroDeEpoca === true;

/** Una llave de dos partes, sin JSON (como las del libro). */
const L2 = (a, b) => String(a) + '\u0000' + String(b);

export class Eje {
  #libro = new Libro(); // la capa cero: saldos, bloqueos y sumas (src/libro.js)
  #series = new Map(); // clave de serie → { emisor, contrato (E) }: qué series existen, en orden de aparición; las cantidades, del libro
  #obtenidoDeSerie = new Map(); // regla + serie de E o R → el P que esa regla ha acuñado, de todos los orígenes, por lo recibido de esa serie (el tope por serie)
  #tiposV2; // identidad → tipo que declaró su alta en el prefijo de la versión 2 (suelo de persistencia)
  #hijosEn;
  #prefijos;
  #porAutor = new Map(); // id → Map(en → Map(autor → los eventos anclados ahí por ese autor, en orden de entrada))
  #llegada = new Map(); // id → su número de entrada en el eje (0 el génesis)
  #prefijoV2 = new Set(); // ids de los eventos del principio guardados con la versión 2
  #tMax = -Infinity; // el mayor t aceptado en el eje, en milisegundos UTC
  #tPorAutor = new Map(); // autor → el mayor t aceptado de sus eventos, en milisegundos UTC (el reloj de los demás, SEG-05)
  #relojExterno = -Infinity; // la hora que dan los demás desde fuera del eje (el `recibido` del libro compartido, src/sincronia.js), en milisegundos UTC
  #recibos = new Map(); // id → el recibo de llegada del transporte (src/sincronia.js): { instante, rele, firma, recibo? }; vista del libro, fuera del cuerpo y del id (X.6.8.1)
  #cota = { altura: null }; // la mayor altura de bloque de los sellos anotados (compartida con las copias, como #sellos): el «último sello conocido» con el que se cuenta la profundidad (contrato.verificado)
  #sellos = new Map(); // id → el sello de tiempo que lo ancla (src/sello.js): { altura, hash, instante, verificado }; vista del libro, fuera del cuerpo y del id (X.6.8.2)
  #pagos = new Map(); // id → el recibo de pago de StateArk copiado (marcarPago): { t, decupla }; vista del libro, fuera del cuerpo y del id (X.6.8.3)
  #bifurcaciones = new Map(); // id de la equivocación → la bifurcación de una línea de cabeceras (marcarBifurcacion), comprobada sin libro; vista del libro, como el sello
  #epoca = null; // la época del eje, cargada y resuelta (#107): la escrita en su libro, o la que el génesis referencia y el código conoce (la 0)
  #escritura = null; // si el génesis escribe su época: { id, esperados, eventos, contenidos } (los registros de la época que han entrado, en orden, y los ids de sus payloads)
  #deLaEpoca = new Set(); // ids de los registros de la época: están en el libro (eventos, orden) pero no cuelgan del génesis como hijos
  // Las versiones de la época (A23, src/versiones.js): una por cada «put a change in force» aceptado, en orden, cada una
  // { epoca (la versión, cargada), anterior, registro (el que la puso en vigor), propuesta, posicion (el número de entrada
  // del primer registro que se juzga con ella) }. Vacío: la época de nacimiento es la vigente. #epoca es siempre la última.
  #versiones = [];
  #enVigor = new Map(); // id de la propuesta → id del registro que puso su cambio en vigor (un cambio entra una sola vez)
  // Una VISTA EN SECO (vistaTanda, CONTRATO_TANDA): la copia del libro sobre la que la bandeja prueba lo que compone, sin
  // firmas. Nunca se asienta en el libro de verdad (nada la adopta) y lo que lleva dentro no pasa la firma fuera de ella.
  #enSeco = false;

  /**
   * exigirFirmas: todo autor debe tener clave registrada y firmar. Si no, solo firman quienes tienen clave.
   * eventosV2: cuántos eventos del principio se guardaron con la versión 2 y se validan con sus reglas
   * (src/persistencia.js); los demás, con las de ahora.
   */
  constructor({ exigirFirmas = false, eventosV2 = 0 } = {}) {
    this.eventos = new Map(); // id → evento
    this.orden = []; // ids en orden de entrada
    this.claves = new Map(); // identidad → clave pública (hex x-only, BIP-340: src/autoridad.js)
    this.hijos = new Map(); // id → eventos escritos sobre él, en orden de entrada (índice)
    this.#hijosEn = new Map(); // id → Map(en → los mismos eventos, solo los anclados en esa dirección, en orden de entrada)
    this.#prefijos = new Map(); // primeros PREFIJO caracteres del id → ids, en orden de entrada (índice de conPrefijo)
    this.#tiposV2 = new Map();
    this.exigirFirmas = exigirFirmas;
    this.eventosV2 = eventosV2;
    // Lo marca el génesis (contexto.demostracion) al aplicarse; un eje que no lo dice no es de demostración.
    this.demostracion = false;
  }

  /**
   * El libro de transacciones del eje (src/libro.js): para leer (saldos,
   * bloqueos, vistas por identidad, sumas, el diario). Se escribe con
   * eje.escribir o eje.anadir, que traducen el evento y pasan sus condiciones.
   */
  get libro() {
    return this.#libro;
  }

  /** Saldos disponibles, identidad → Map(clave → cantidad): una copia leída del libro (compatibilidad). */
  get saldos() {
    return new Map(this.#libro.titulares().map((id) => [id, new Map(this.#libro.disponibles(id))]));
  }

  /** Bloqueos, identidad → Map(clave → Map(salida → cantidad)): una copia leída del libro (compatibilidad). */
  get bloqueados() {
    const r = new Map();
    for (const id of this.#libro.titulares()) {
      for (const { serie, salida, cantidad } of this.#libro.bloqueos(id)) {
        if (!r.has(id)) r.set(id, new Map());
        if (!r.get(id).has(serie)) r.get(id).set(serie, new Map());
        r.get(id).get(serie).set(salida, cantidad);
      }
    }
    return r;
  }

  /**
   * Génesis (encargo 3b; VG, 10-11, A2; mapa §16 [D] «El árbol mínimo es la invitación»): el registro de la época 0
   * en este eje, «sin movimientos», fuera del sistema: lleva la referencia a la época (contexto.epoca, su id) y no
   * pasa por las reglas de la época (no es una transacción), solo por el suelo (lo que declara, su firma). Es también
   * el alta de quien lo escribe: la única alta sin invitación, la de la primera identidad del eje (las demás entran
   * aceptando una invitación: invitar, aceptar). Su autor es una persona (VG, 10-11, B1) y obtiene P sobre él al
   * escribirlo, como sobre todo registro propio (la regla que escribe «writing a record gives ten P on it»).
   *
   * `emision` (opcional): lo que su autor emite al empezar (E y R; T no, y P tampoco: VG, 8-11, y mapa §15). Va en
   * una transacción suya sobre el génesis, la segunda del eje, que pasa por las reglas como cualquiera (quema un
   * minuto de su T; emitir E exige P sobre su registro, que es el génesis, y R propia emitida).
   * Sin clave no se actúa (R9): el génesis lleva `clave` y `privada` de su autor, salvo que se cree como
   * `demostracion: true` (queda en su contexto y se ve en la interfaz). `privada` puede ser un firmante
   * ({ canonico, id }) → firma | { id, firma } (src/autoridad.js; camino B del alta, docs/ANFITRION.md): cada firma se
   * comprueba con `clave`, y si una falla (o el firmante rechaza) el génesis lanza y no queda eje a medio abrir.
   */
  static async genesis({ identidad, emision = [], foco, t = new Date().toISOString(), contexto = {}, clave, privada, exigirFirmas = false, demostracion = false, epoca, ...resto }) {
    // La época vive en el eje (VG, 14-11, #107): `epoca` (opcional) es una época escrita { raiz, registros } (o su raíz
    // sola, si todo lo que referencia lo hereda): se valida y se resuelve ANTES de nada (una mal formada no abre el
    // eje) y se escribe en el libro como parte de la apertura del génesis. Sin ella, el génesis referencia la época 0,
    // que trae el código, y no la escribe (los ejes de siempre).
    // Con `cambios` (tramo 4, la época por referencia: { raiz, registros, cambios: [{ raiz, registros }, …] }, la que da
    // epocaEscritaDe de una versión de otro libro), nace con esa época y esos cambios fundidos encima, en orden; también
    // se escriben, detrás, como registros de la época. Si el libro de arriba nació con una época del código, la forma es
    // { base: su id, cambios }: el génesis nombra ese id, como el de un libro nacido con ella, y solo se escriben los
    // cambios (con { base, cambios: [] }, nada: es un génesis sin época). Una época cargada (o una versión) vale por su
    // forma escrita.
    let escrita = null;
    let cargada = null;
    let cambios = [];
    let porId = false;
    if (epoca !== undefined && epoca !== null) {
      escrita = Array.isArray(epoca) ? { raiz: epoca, registros: [] } : epoca.escrita || epoca.anterior ? epocaEscritaDe(epoca) : epoca;
      porId = escrita?.base !== undefined;
      // Con cambios bien formados se carga por la misma caché con que el eje la rehace al completarse la apertura (fundir
      // cada cambio es lo caro: se paga una vez). Sin ellos, como siempre.
      const conCambios = Array.isArray(escrita?.cambios) && escrita.cambios.length > 0 && !erroresDeEpocaEscrita(escrita).length;
      if (!conCambios) cargada = cargarEpocaEscrita(escrita);
      const sinRepetir = (registros) => {
        const vistos = new Set();
        return (registros ?? []).filter((r) => !vistos.has(idDeRegistro(r)) && vistos.add(idDeRegistro(r)));
      };
      cambios = (escrita.cambios ?? []).map((c) => ({ raiz: c.raiz, registros: sinRepetir(c.registros) }));
      escrita = porId ? { base: escrita.base } : { raiz: escrita.raiz, registros: sinRepetir(escrita.registros) };
      if (conCambios) cargada = resolverEscrita({ ...escrita, cambios });
    }
    const deLosCambios = cambios.reduce((n, c) => n + 1 + c.registros.length, 0);
    // El id que nombra el génesis y cuántos registros de época van tras él (ninguno: no escribe su época).
    const nombrada = porId ? escrita.base : cargada ? cargada.id : EPOCA_0_BTML.id;
    const aEscribir = porId ? deLosCambios : cargada ? 1 + escrita.registros.length + deLosCambios : 0;
    if (Object.hasOwn(resto, 'tipo')) throw new Error('génesis: no hay tipo (VG, 10-11, B1): persona o cosa se lee de quién escribe el alta; el autor del génesis escribe la suya, es una persona');
    if (emision.some((m) => m?.token === 'P')) throw new Error('génesis: nadie acuña P a mano (mapa §15, «P como peso de criterio»: se retira «P del génesis sobre todo el eje»); el P se obtiene al escribir, al conseguir E y al recibir R');
    const eje = new Eje({ exigirFirmas });
    let ev = await crearEvento({
      autor: identidad,
      sobre: null,
      t,
      movimientos: [],
      payload: foco,
      contexto: { ...contexto, genesis: true, epoca: nombrada, ...(aEscribir ? { epocaEscrita: aEscribir } : {}), ...(demostracion ? { demostracion: true } : {}), ...(clave ? { claves: { [identidad]: clave } } : {}) },
    });
    if (privada) ev = await firmar(ev, privada);
    // La misma regla que al restaurar: si el génesis declara clave, va firmado con ella (GN-1, GN-2).
    const motivos = await eje.#libro.evaluar(eje.transaccion(ev), CONDICIONES_GENESIS, { evento: ev, reglas: 3, contextoBqlm: (epoch) => new ContextoEje(eje, { ev, epoch }) });
    if (motivos.length) throw new Error('génesis rechazado: ' + motivos.map((m) => m.texto).join('; '));
    if (exigirFirmas && !clave) throw new Error('el génesis debe ir firmado');
    eje.#aplicar(ev);
    if (aEscribir) {
      // La apertura: la raíz de la época y, detrás, sus registros, anclados en el génesis por su autor, sin mover nada.
      // Detrás, los de cada cambio (tramo 4): su contexto dice a qué cambio pertenecen (1, 2…) y cuál es su raíz.
      const apertura = [
        ...(porId ? [] : [escrita.raiz, ...escrita.registros]).map((payload) => ({ payload, mas: {} })),
        ...cambios.flatMap((c, k) => [{ payload: c.raiz, mas: { cambio: k + 1, raizDelCambio: true } }, ...c.registros.map((payload) => ({ payload, mas: { cambio: k + 1 } }))]),
      ];
      for (const { payload, mas } of apertura) {
        let r = await crearEvento({ autor: identidad, sobre: ev.id, t, movimientos: [], payload, contexto: { epoca: nombrada, registroDeEpoca: true, ...mas } });
        if (privada) r = await firmar(r, privada, undefined, { publica: clave });
        await eje.anadir(r);
      }
    }
    if (emision.length) {
      // Sus series de E y de R quedan a su nombre. R primero: emitir E exige R propia emitida (VG, 9-11, D2).
      const deEmisor = (m) => m.token === 'E' || m.token === 'R';
      const orden = [...emision.filter((m) => m.token === 'R'), ...emision.filter((m) => m.token !== 'R')];
      const movimientos = orden.map((m) => ({ ...m, ...(deEmisor(m) ? { emisor: m.emisor ?? identidad } : {}), de: null, a: identidad }));
      await eje.escribir({
        autor: identidad,
        sobre: eje.genesisId,
        t,
        movimientos: [{ token: 'T', escala: 'minuto', cantidad: 1, de: identidad, a: null }, ...movimientos],
        payload: ['Emisión inicial de ' + identidad],
      }, privada);
    }
    return eje;
  }

  /**
   * La época del eje (VG, 14-11, #107: «la época vive en el eje»), cargada y resuelta (con lo que hereda): la escrita
   * en su libro tras el génesis o, si el génesis no la escribe, la que referencia (contexto.epoca) si el código la
   * conoce, y si no la 0 que trae el código (los ejes de antes, cuyo génesis nombra un id de la época 0 de entonces).
   * Lanza si el génesis escribe su época y aún no está entera en el libro.
   * Con cambios en vigor (A23, src/versiones.js), la VERSIÓN vigente: la última, la de nacimiento con cada cambio fundido
   * encima en el orden en que entró en vigor. El id es el de siempre. Al validar un registro es justo la que le toca.
   */
  epoca() {
    if (this.#epoca) return this.#epoca;
    if (this.#escritura) throw new Error(this.#faltaEpoca());
    return EPOCA_0_BTML;
  }

  /** La época de nacimiento: la primera versión (null si el génesis escribe su época y aún no está entera). */
  #nacimiento() {
    if (this.#versiones.length) return this.#versiones[0].anterior;
    return this.#epoca ?? (this.#escritura ? null : EPOCA_0_BTML);
  }

  /**
   * La versión de la época con la que entró el registro `id` (A23): la vigente justo antes de él, para enseñarlo como se
   * escribió (su plantilla, sus textos y sus reglas de entonces). El registro que pone un cambio en vigor entró con la
   * anterior. null si el eje no tiene ese registro.
   */
  epocaDe(id) {
    const k = this.#llegada.get(typeof id === 'string' ? id : id?.id);
    if (k === undefined) return null;
    for (let i = this.#versiones.length - 1; i >= 0; i--) if (this.#versiones[i].posicion <= k) return this.#versiones[i].epoca;
    return this.#nacimiento();
  }

  /**
   * Las versiones de la época del eje (A23), en orden: [{ numero, epoca (el id de la época, el de siempre), registro (el
   * que la puso en vigor; null la de nacimiento), propuesta (la del cambio), nombre («<época>» o «<época>/<registro>»),
   * posicion (el número de entrada desde el que rige), desde (el id del primer registro que se juzga con ella, o null si
   * aún no hay ninguno), version (la época cargada) }]. La primera es la de nacimiento; la última, la vigente.
   */
  versiones() {
    const nacimiento = this.#nacimiento();
    const id = nacimiento?.id ?? null;
    const fila = (numero, version, registro, propuesta, posicion) => Object.freeze({ numero, epoca: id, registro, propuesta, nombre: registro ? id + '/' + registro : id, posicion, desde: this.orden[posicion] ?? null, version });
    return [fila(0, nacimiento, null, null, 0), ...this.#versiones.map((v, i) => fila(i + 1, v.epoca, v.registro, v.propuesta, v.posicion))];
  }

  /**
   * Lo que el núcleo comprueba de `ev` como cambio de reglas (A23, src/versiones.js), con el eje de antes de `ev`:
   * { motivos: [textos], entrada } (entrada: la entrada en vigor ya resuelta, o null). Solo mira los registros que dicen
   * «propose a change» o «put a change in force» con una versión vigente que trae esa plantilla: para los demás, nada.
   */
  #motor(ev) {
    if (!(dice(ev, PROPONER) || dice(ev, PONER_EN_VIGOR)) || (this.#escritura && !this.#epoca)) return SIN_MOTOR;
    const epoca = this.#epocaVigente();
    const motivos = [...motivosAlProponer(epoca, ev)];
    const libro = { obtener: (id) => this.eventos.get(id), sobre: (id) => this.sobre(id), genesisId: this.genesisId, enVigor: this.#enVigor };
    const entrada = entradaEnVigor(libro, epoca, ev);
    if (entrada) motivos.push(...entrada.motivos);
    return { motivos, entrada: entrada?.version ? entrada : null };
  }

  /** ¿Es `id` un registro de la época escrita en el libro (parte de la apertura del génesis, no un hijo suyo)? */
  esDeLaEpoca(id) {
    return this.#deLaEpoca.has(typeof id === 'string' ? id : id?.id);
  }

  /** Los ids de los registros de la época escrita en el libro, en orden (la raíz primero); [] si la época no se escribió. */
  get registrosDeLaEpoca() {
    return this.#escritura ? this.#escritura.eventos.map((e) => e.id) : [];
  }

  /** La época del eje si ya se puede leer (la de las condiciones); la 0 mientras su época escrita no está entera. */
  #epocaVigente() {
    return this.#epoca ?? EPOCA_0_BTML;
  }

  /** Clave pública registrada de una identidad, si la tiene. */
  clave(identidad) {
    return this.claves.get(identidad);
  }

  /**
   * ¿Es una persona? (VG, 10-11, B1: desaparece el tipo.) true si su alta (la
   * transacción que abrió su cuenta) la escribió ella misma; false si la
   * escribió otra identidad, su dueño: es una cosa; null si no tiene alta. En
   * el prefijo de la versión 2 (suelo de persistencia), lo que declaró su alta
   * entonces: persona, o no (grupo, cosa).
   */
  esPersona(identidad) {
    const tx = this.#libro.alta(identidad);
    if (!tx) return null;
    if (this.#prefijoV2.has(tx.id)) return this.#tiposV2.get(identidad) === 'persona';
    return tx.autor === identidad;
  }

  /**
   * ¿Escribe `ev` como persona? Sí si su autor lo es o si aún no tiene cuenta:
   * entonces este registro es su propia alta (B1). Rige fuera del prefijo de la
   * versión 2.
   */
  #escribePersona(ev) {
    const p = this.esPersona(ev.autor);
    return p === null ? typeof ev.autor === 'string' && ev.autor.length > 0 : p;
  }

  /** El tipo que declaró en el prefijo de la versión 2 el alta de una identidad, o null (suelo de persistencia: las reglas de entonces). */
  tipoV2(identidad) {
    return this.#tiposV2.get(identidad) ?? null;
  }

  /**
   * Alta de una identidad: { id, t, autor } del evento en que recibió tokens por
   * primera vez (el génesis es el alta de su autor), o null. Es la primera
   * transacción que abrió su cuenta en el libro; `autor`, quien la escribió
   * (ella misma si es una persona; su dueño si es una cosa).
   */
  alta(identidad) {
    const tx = this.#libro.alta(identidad);
    return tx ? { id: tx.id, t: tx.t, autor: tx.autor } : null;
  }

  /** ¿Es el evento uno de los guardados con la versión 2 (el prefijo que se valida con sus reglas)? */
  esDeV2(id) {
    return this.#prefijoV2.has(id);
  }

  /**
   * El mayor t aceptado en el eje, en milisegundos UTC (-Infinity si está
   * vacío). Con `excluidos` (identidades), solo entre los eventos de las
   * demás: el reloj que marcan los otros (SEG-05), -Infinity si no hay ninguno.
   */
  tMaximo(excluidos) {
    if (excluidos === undefined) return this.#tMax;
    const fuera = new Set(excluidos);
    let max = this.#relojExterno;
    for (const [autor, ms] of this.#tPorAutor) if (ms > max && !fuera.has(autor)) max = ms;
    return max;
  }

  /**
   * El reloj de los demás que llega de fuera (etapa 3, el libro compartido: el
   * `recibido` del servidor, la hora a la que los demás vieron cada evento).
   * Entra SOLO en el reloj de los demás (`tMaximo(excluidos)`, lo que las
   * reglas leen como `before.6.3`), nunca en el mayor t del libro
   * (`tMaximo()`, `before.6.0`: eso son los eventos) ni en ningún evento (no
   * cambia ningún id). Se queda con el mayor; un instante que no se lee se
   * ignora. Devuelve el reloj externo en milisegundos (-Infinity si no hay).
   */
  marcarReloj(instante) {
    const ms = typeof instante === 'number' ? instante : Date.parse(instante);
    if (Number.isFinite(ms) && ms > this.#relojExterno) this.#relojExterno = ms;
    return this.#relojExterno;
  }

  /** El reloj externo marcado (milisegundos UTC; -Infinity si ninguno). */
  get relojExterno() {
    return this.#relojExterno;
  }

  /**
   * El recibo de llegada del transporte de un registro (el segundo reloj, `X.6.8.1`: el instante en que el relé de Nostr
   * lo recibió y la clave del relé que lo firmó; la simulación de AARPIA, servidor/sim/aarpia/). Como el sello, es una
   * vista del libro que llega de fuera: NO es parte del cuerpo firmado, no cambia ningún id ni ninguna firma y no entra en
   * ninguna regla de escritura. `recibo` = { instante, rele, firma } (la forma de `GET /eventos/recibo`; `recibo`, opcional,
   * el id Nostr del recibo). Se queda con el recibo más antiguo (el de menor instante). Devuelve si lo anotó; un registro
   * que el eje no tiene, o un recibo mal formado, se ignoran.
   */
  marcarRecibo(id, recibo) {
    if (!this.eventos.has(id) || !recibo || typeof recibo !== 'object') return false;
    const { instante, rele, firma, recibo: idRecibo } = recibo;
    if (!esInstante(instante) || typeof rele !== 'string' || !/^[0-9a-f]{64}$/.test(rele) || typeof firma !== 'string' || !/^[0-9a-f]{128}$/.test(firma)) return false;
    const antes = this.#recibos.get(id);
    if (antes && msUTC(antes.instante) <= msUTC(instante)) return false;
    this.#recibos.set(id, Object.freeze({ instante, rele, firma, ...(typeof idRecibo === 'string' && /^[0-9a-f]{64}$/.test(idRecibo) ? { recibo: idRecibo } : {}) }));
    return true;
  }

  /** El recibo de llegada de un registro { instante, rele, firma, recibo? } o null si aún no lo tiene (X.6.8.1). */
  recibo(id) {
    return this.#recibos.get(id) ?? null;
  }

  /** Cuántos registros tienen recibo del transporte: 0 si este transporte no los da (lo usa contrato.verificado). */
  get totalRecibos() {
    return this.#recibos.size;
  }

  /**
   * El sello de tiempo que ancla un registro (el tercer reloj, `X.6.8.2`: el bloque de Bitcoin que lo sella,
   * src/sello.js). Como el reloj externo, es una vista del libro que llega de fuera: NO es parte del cuerpo firmado, no
   * cambia ningún id ni ninguna firma, y no entra en ninguna regla de escritura. `sello` = { altura, hash, instante }
   * (la forma que da `prueba(id)` de src/sello.js; `verificado`, opcional, si `verificar` la dio por buena: el gancho
   * de la estación «verificado»). Se queda con el sello más antiguo (el de menor instante). Devuelve si lo anotó;
   * un registro que el eje no tiene, o un sello mal formado, se ignoran.
   *
   * `decupla` (encargo «verificado-regla», #67), opcional: la PRUEBA COPIADA, la décupla del sello de tiempo del SIP 0
   * (src/sello.js decuplaDeSello y POSICIONES_DEL_SELLO: la altura, el hash, la raíz del lote, el id, el instante, la vía,
   * lo observado — cabecera, firma del observador, altura LE, clave, pasos — y el camino). Va en X.6.8.2 detrás de lo de siempre y la
   * comprueba la regla «sealed» de la época (X.6.8.5): esa regla, no `verificado`, dice si el registro está sellado.
   * Una décupla que no es BTML, no es de un sello de tiempo, no lleva este id o no es de esta altura y este
   * hash, no se guarda (el sello sí).
   *
   * Cuál se queda (encargo A18, «una prueba mejor sustituye a la anterior»): el que alcanza más niveles del sello en cascada
   * (nivelesDeSello: los niveles distintos de su cadena; uno por la vía «taproot»; ninguno sin décupla); a igual alcance, el
   * más antiguo. Uno peor nunca sustituye a uno mejor.
   */
  marcarSello(id, sello) {
    if (!this.eventos.has(id) || !sello || typeof sello !== 'object') return false;
    const { altura, hash, instante, verificado } = sello;
    if (!Number.isSafeInteger(altura) || altura < 0 || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) || !esInstante(instante)) return false;
    const decupla = decuplaDeSelloValida(sello.decupla, id, altura, hash);
    // La altura del último sello conocido sube aunque este sello no sea el más antiguo del registro, pero solo con sellos que `verificar` dio por buenos: una altura sin comprobar no alarga la profundidad de nadie.
    if (verificado === true && (this.#cota.altura === null || altura > this.#cota.altura)) this.#cota.altura = altura;
    const antes = this.#sellos.get(id);
    // Una prueba mejor sustituye a la anterior (encargo A18): la que alcanza más niveles pasa a ser la que leen las reglas,
    // aunque sea más reciente; una peor nunca sustituye a una mejor. A igual alcance, la más antigua, como antes.
    const mejor = antes ? Math.sign(nivelesDeSello(decupla) - nivelesDeSello(antes.decupla)) : 1;
    if (antes && ((antes.altura === altura && antes.hash === hash) || mejor < 0 || (mejor === 0 && msUTC(antes.instante) <= msUTC(instante)))) {
      if (antes.altura === altura && antes.hash === hash && (verificado !== undefined || (decupla && !antes.decupla))) {
        this.#sellos.set(id, Object.freeze({ ...antes, ...(verificado !== undefined ? { verificado: verificado === true } : {}), ...(decupla && !antes.decupla ? { decupla } : {}) }));
      }
      return false;
    }
    this.#sellos.set(id, Object.freeze({ altura, hash, instante, verificado: verificado === true, ...(decupla ? { decupla } : {}) }));
    return true;
  }

  /**
   * El recibo de pago de un registro (encargo «taproot», Core AGRAM 13-11; `X.6.8.3`): el recibo único de StateArk de
   * clase «pago» (`stateark.recibo@1`, SIP 0 B19; en la simulación, `Custodia.firmarRecibo` sobre `Carril.reciboPago`)
   * del pago que el registro hizo fuera, con su evidencia (la transacción cruda, la cabecera de su bloque y el camino de
   * Merkle «bitcoin»). Como el sello y el recibo de llegada, es una VISTA del libro que llega de fuera: NO es parte del
   * cuerpo firmado, no cambia ningún id ni ninguna firma y no entra en ninguna regla de escritura. `sobre` = { schema,
   * emisor, t, recibo, id, firma } (ver decuplaDePagoValida: el id lo recalcula el núcleo). Lo comprueba la regla «paid»
   * de la época (X.6.8.6). Se queda con el recibo más antiguo (el de menor t). Devuelve si lo anotó; un registro que el
   * eje no tiene, o un recibo que no es de pago, no es BTML o no da su id, se ignoran. Un pago sin bloque no tiene recibo
   * de pago (la sim lanza «unconfirmed»): la regla queda PENDIENTE.
   */
  marcarPago(id, sobre) {
    if (!this.eventos.has(id)) return false;
    const decupla = decuplaDePagoValida(sobre);
    if (!decupla) return false;
    const antes = this.#pagos.get(id);
    if (antes && msUTC(antes.t) <= msUTC(sobre.t)) return false;
    this.#pagos.set(id, Object.freeze({ t: sobre.t, decupla }));
    return true;
  }

  /**
   * Una bifurcación de una línea de cabeceras de lote (SIP 0, «El sello en cascada» §3; encargo «firmeza», VG 16-11): la
   * equivocación portable «dos cabeceras con el mismo número» (`stateark.equivocacion@1` con `a` y `b` dos décuplas de
   * cabecera), que se comprueba sin libro (src/sello.js bifurcacion: las dos firmas, el mismo libro, la misma clave, el
   * mismo número y distinto hash). Como el sello, es una vista del libro que llega de fuera: no es parte de ningún cuerpo firmado ni de
   * ningún id y no entra en ninguna regla de escritura. Nada castiga solo: «sealed» y «firm» no cambian; contrato.firmeza
   * dice «en duda» de un sello cuya cadena pasa por una cabecera de ese libro y esa clave con número igual o mayor. Devuelve si
   * la anotó; una que no lo es, o ya anotada, se ignora.
   */
  marcarBifurcacion(prueba) {
    const b = bifurcacion(prueba);
    if (!b || this.#bifurcaciones.has(b.id)) return false;
    this.#bifurcaciones.set(b.id, Object.freeze({ ...b, hashes: Object.freeze([...b.hashes]) }));
    return true;
  }

  /** Las bifurcaciones anotadas: [{ clase, acusado, libro, numero, hashes, id }], por llegada. */
  bifurcaciones() {
    return [...this.#bifurcaciones.values()];
  }

  /** El recibo de pago copiado de un registro { t, decupla } o null si no lo tiene (X.6.8.3). */
  pago(id) {
    return this.#pagos.get(id) ?? null;
  }

  /** La mayor altura de bloque de todos los sellos verificados anotados en el eje, o null si no hay ninguno: la altura «actual» que AGRAM conoce (el último sello). */
  get alturaConocida() {
    return this.#cota.altura;
  }

  /** El sello de tiempo de un registro { altura, hash, instante, verificado } o null si aún no lo tiene (X.6.8.2). */
  sello(id) {
    return this.#sellos.get(id) ?? null;
  }

  /**
   * T de la asignación de una persona gastado en una escala un día (`periodo`,
   * el día civil: tokens.asignacionT): en el libro, lo acuñado a esa persona
   * con la clase «asignación» y la etiqueta de ese día.
   */
  gastadoT(identidad, escala, periodo) {
    return this.#libro.sumas({ primitiva: 'acunar', serie: 'T:' + escala, titular: identidad, clase: ASIGNACION, etiqueta: periodo ?? null });
  }

  /**
   * T consumido SOBRE un registro, por escala (VG, 7-11 noche: «escribir
   * consume T y el consumo queda registrado en el registro que soporta»): la
   * suma de los consumos de T (de = autor, a = null) de los eventos escritos
   * sobre `id` (sus hijos directos, sus bases del 8 incluidas). Es lo que ese
   * registro acumula y enseña: { segundo: n, minuto: m, … }, solo las escalas
   * con algo, en el orden de las escalas. Se ve desde fuera, pero ninguna
   * regla lo usa para conceder nada a terceros (ni autorizar, ni topes de E,
   * ni elegibilidad, ni orden de candidatos). En el libro: lo quemado de cada
   * serie de T en las transacciones ancladas sobre `id` (sin recorrer).
   */
  tiempoSobre(id) {
    const r = {};
    for (const e of ESCALAS_REALES) {
      const n = this.#quemadoSobre(id, e);
      if (n) r[e] = n;
    }
    return r;
  }

  #quemadoSobre(id, escala) {
    return this.#libro.sumas({ primitiva: 'quemar', serie: 'T:' + escala, registro: id });
  }

  /**
   * ¿Es el registro `id` presente? (evento.esPresente). No lo es el que solo
   * quemara T informativo (pasado, futuro, inventado; VG, 8-11); desde VG 13-11
   * (#76) la época 0 exige a todo registro el coste en T real de hoy («writing
   * burns today's T»), así que en ella todo registro del libro lo es. undefined
   * si no está.
   */
  presente(id) {
    const ev = this.eventos.get(id);
    return ev ? esPresente(ev) : undefined;
  }

  /**
   * El T informativo (pasado, futuro, inventado; VG, 8-11) consumido SOBRE un
   * registro, aparte de las siete escalas reales: lo que quedó registrado como
   * tal, con sus dos fechas, el t real del evento y la fecha a la que se
   * refiere: [{ escala, cantidad, autor, t, refiere, nota, id }], en orden de
   * entrada. Nada lo convierte a segundos ni lo suma a tiempoSobre. En el
   * libro: los asientos de quema de clase «informativo» anclados sobre `id`.
   */
  tiempoInformativo(id) {
    return this.#libro.asientos({ registro: id, primitiva: 'quemar', clase: INFORMATIVO })
      .map((a) => ({ escala: a.origen.escala, cantidad: a.cantidad, autor: a.tx.autor, t: a.tx.t, refiere: a.origen.refiere ?? null, nota: a.origen.nota ?? null, id: a.tx.id }));
  }

  /**
   * T consumido sobre un registro y sobre todo lo que cuelga de él, por
   * escala: tiempoSobre de `id` y de cada descendiente, sumado. Recorre el
   * subárbol; el 8 lo da sin recorrer (bases.medir lo funde por escala en la
   * estadística del subárbol, con las claves «tiempo:<escala>»).
   */
  tiempoBajo(id) {
    const r = {};
    const pendientes = [id];
    while (pendientes.length) {
      const x = pendientes.pop();
      for (const e of ESCALAS_REALES) {
        const n = this.#quemadoSobre(x, e);
        if (n) r[e] = (r[e] ?? 0) + n;
      }
      for (const h of this.hijos.get(x) ?? []) pendientes.push(h.id);
    }
    return Object.fromEntries(ESCALAS_REALES.filter((e) => r[e]).map((e) => [e, r[e]]));
  }

  /**
   * Reconstruye un eje desde su lista de eventos (el primero es el génesis),
   * validando cada uno: ids, firmas, saldos. Nada se da por bueno. Una tanda
   * (CONTRATO_TANDA) entra como una sola cosa: sus `de` miembros seguidos y
   * en orden, o lanza (como cualquier registro que no pasa).
   */
  static async desde(eventos, { exigirFirmas = false, eventosV2 = 0 } = {}) {
    const [crudo, ...resto] = eventos;
    if (!crudo || crudo.contexto?.genesis !== true || crudo.sobre !== null) throw new Error('el primer evento debe ser el génesis');
    if (!Number.isSafeInteger(eventosV2) || eventosV2 < 0 || eventosV2 > eventos.length) throw new Error('eventosV2 debe ser un entero entre 0 y el número de eventos');
    const g = copiaGuardable(crudo);
    const eje = new Eje({ exigirFirmas, eventosV2 });
    const motivos = await eje.#libro.evaluar(eje.transaccion(g), CONDICIONES_GENESIS_GUARDADO, { evento: g, tLaxo: eventosV2 > 0, reglas: eventosV2 > 0 ? 2 : 3, contextoBqlm: (epoch) => new ContextoEje(eje, { ev: g, epoch }) });
    if (motivos.length) throw new Error('génesis rechazado: ' + motivos.map((m) => m.texto).join('; '));
    if (exigirFirmas && !g.contexto.claves?.[g.autor]) throw new Error('el génesis debe ir firmado');
    eje.#aplicar(g);
    const partes = partirTandas([crudo, ...resto]);
    for (let p = 0; p < partes.length; p++) {
      const parte = partes[p];
      // La primera parte es la del génesis (ya aplicado): sola, o la tanda que él abre (CONTRATO_TANDA: «eje vacío» vale para el primero).
      if (!parte.marcada) {
        if (p > 0) await eje.anadir(parte.eventos[0]);
        continue;
      }
      const r = parte.errores.length ? { ok: false, indice: fallosDeTanda(parte.eventos)[0]?.indice ?? null, motivos: formados(parte.errores) } : await eje.#tandaEnSitio(parte.eventos, { aplicados: p === 0 ? 1 : 0, deshacer: false });
      if (!r.ok) {
        // El error dice qué miembro de esa tanda falla (desde 0; null si es la tanda entera), como eje.anadirTanda.
        const e = rechazo((p === 0 ? 'génesis rechazado: ' : 'evento rechazado: ') + motivoDeTanda(parte, r), r.motivos);
        e.indice = Number.isInteger(r.indice) ? r.indice : null;
        e.id = e.indice === null ? null : idDe(parte.eventos[e.indice]);
        throw e;
      }
    }
    return eje;
  }

  /**
   * Abre un libro con una tanda cuyo miembro 1 es su génesis (CONTRATO_TANDA, precisión 5: abrir un libro y sus primeros
   * registros entra todo o nada; «eje vacío» solo vale para el miembro 1). Lo que usa una puerta con autoridad ante un eje
   * vacío, en vez de abrir el eje con el génesis y añadir el resto (eso partiría la tanda). → { ok: true, eje, tanda,
   * eventos } o { ok: false, indice (desde 0; null si falla la lista entera), id, motivos }: entonces no hay libro.
   */
  static async abrirConTanda(eventos, { exigirFirmas = false, eventosV2 = 0 } = {}) {
    const fallo = fallosDeTanda(eventos)[0];
    if (fallo) return { ok: false, indice: fallo.indice, id: fallo.indice === null ? null : idDe(eventos[fallo.indice]), motivos: formados([fallo.texto]) };
    try {
      const eje = await Eje.desde(eventos, { exigirFirmas, eventosV2 });
      return { ok: true, eje, tanda: eje.genesisId, eventos: eje.orden.slice(0, eventos.length).map((id) => eje.obtener(id)) };
    } catch (e) {
      const indice = Number.isInteger(e?.indice) ? e.indice : e?.indice === null ? null : 0;
      return { ok: false, indice, id: indice === null ? null : idDe(eventos[indice]), motivos: e?.motivos ?? formados([String(e?.message ?? e)]) };
    }
  }

  /**
   * El eje de justo antes del registro número `hasta` (en orden de entrada):
   * un eje nuevo con los `hasta` primeros eventos, reaplicados sin volver a
   * validarlos (ya lo están). Lo que leen las capas de validez de un registro
   * (src/validez.js): el libro, las series, las claves y los tipos de ese
   * momento, con las mismas condiciones que el eje.
   */
  antes(hasta) {
    const eje = new Eje({ exigirFirmas: this.exigirFirmas, eventosV2: this.eventosV2 });
    const n = Math.max(0, Math.min(hasta, this.orden.length));
    for (let k = 0; k < n; k++) eje.#aplicar(this.eventos.get(this.orden[k]));
    return eje;
  }

  /**
   * Reordena el eje (etapa 3, el libro compartido: el orden que vale es el de
   * llegada al servidor, y el local puede diferir). `lista` son eventos (o ids
   * de eventos que el eje ya tiene), el génesis el primero y el mismo de
   * siempre; lo que el eje tenía y no está en la lista va detrás, en su orden
   * de entrada (lo que aún no se ha subido). Se reconstruye un eje nuevo
   * volviendo a validar cada evento en el orden nuevo, como al restaurar
   * (nada se da por bueno): lo que no pasa no entra y se devuelve en
   * `rechazados` [{ id, motivo }] sin lanzar; `anadidos` son los ids de los
   * eventos que no estaban. El eje adopta el resultado en sitio (los índices,
   * el libro, las claves, el reloj externo), así que quien lo tenía sigue
   * teniéndolo. No se reordena el prefijo de la versión 2 (sus reglas eran
   * otras): si lo hay, la lista ha de empezar por él tal cual.
   * Una tanda (CONTRATO_TANDA) es UNA cosa: entran sus `de` miembros seguidos
   * y en orden, todos válidos, o se rechaza entera; cada miembro rechazado va
   * en `rechazados` con `tanda` (el id de su miembro 1; null si no se sabe).
   */
  async reordenar(lista) {
    const tenia = new Set(this.orden);
    const eventosDe = (x) => (typeof x === 'string' ? this.eventos.get(x) : x);
    const dados = lista.map(eventosDe);
    if (dados.some((e) => !e || typeof e !== 'object')) throw new Error('reordenar: la lista lleva ids que el eje no tiene');
    const ids = new Set(dados.map((e) => e.id));
    // Lo local que la lista no trae va detrás, en su orden de entrada; salvo un miembro de una tanda cuyo anterior ya está
    // colocado: va justo detrás de él (la lista pudo cortar la tanda, una página; revisión de Core StateArk, e7 y r1). Así
    // lo local no parte nunca una tanda que el eje ya tenía entera. Si la lista misma la parte (algo suyo en medio), se
    // rechaza entera, como siempre.
    const todos = [...dados];
    for (const id of this.orden) {
      if (ids.has(id)) continue;
      const ev = this.eventos.get(id);
      const anterior = esMiembroDeTanda(ev) ? ev.contexto.tanda?.anterior : undefined;
      const k = typeof anterior === 'string' ? todos.findIndex((x) => x.id === anterior) : -1;
      if (k >= 0) todos.splice(k + 1, 0, ev);
      else todos.push(ev);
    }
    if (!todos.length || todos[0].id !== this.genesisId) throw new Error('reordenar: el génesis va primero y es el de siempre');
    for (let k = 0; k < this.eventosV2; k++) if (todos[k]?.id !== this.orden[k]) throw new Error('reordenar: el prefijo de la versión 2 no se reordena');
    const [g, ...resto] = todos;
    const nuevo = new Eje({ exigirFirmas: this.exigirFirmas, eventosV2: this.eventosV2 });
    nuevo.#relojExterno = this.#relojExterno;
    nuevo.#recibos = this.#recibos;
    nuevo.#sellos = this.#sellos;
    nuevo.#pagos = this.#pagos;
    nuevo.#bifurcaciones = this.#bifurcaciones;
    nuevo.#cota = this.#cota;
    const motivos = await nuevo.#libro.evaluar(nuevo.transaccion(g), CONDICIONES_GENESIS_GUARDADO, { evento: g, tLaxo: this.eventosV2 > 0, reglas: this.eventosV2 > 0 ? 2 : 3, contextoBqlm: (epoch) => new ContextoEje(nuevo, { ev: g, epoch }) });
    if (motivos.length) throw new Error('génesis rechazado: ' + motivos.map((m) => m.texto).join('; '));
    nuevo.#aplicar(g);
    const rechazados = [];
    const anadidos = [];
    // Una tanda es UNA cosa (CONTRATO_TANDA): sus `de` miembros seguidos y en orden, y todos pasan, o se rechaza entera;
    // cada miembro rechazado lleva `tanda` (el id de su miembro 1, o null si no se sabe: un miembro sin su miembro 1).
    const partes = partirTandas(todos);
    for (let p = 0; p < partes.length; p++) {
      const parte = partes[p];
      if (!parte.marcada) {
        if (p === 0) continue; // el génesis, ya aplicado
        const ev = parte.eventos[0];
        try {
          const guardado = await nuevo.anadir(ev);
          if (!tenia.has(guardado.id)) anadidos.push(guardado.id);
        } catch (e) {
          rechazados.push({ id: ev?.id, motivo: e.message });
        }
        continue;
      }
      const r = parte.errores.length ? { ok: false, motivos: formados(parte.errores) } : await nuevo.#tandaEnSitio(parte.eventos, { aplicados: p === 0 ? 1 : 0 });
      if (r.ok) {
        for (const guardado of r.eventos) if (!tenia.has(guardado.id)) anadidos.push(guardado.id);
        continue;
      }
      // El génesis no se rechaza: si abre una tanda que no entra entera, el libro no se rehace.
      if (p === 0) throw new Error('génesis rechazado: ' + motivoDeTanda(parte, r));
      const motivo = motivoDeTanda(parte, r);
      for (const ev of parte.eventos) rechazados.push({ id: ev?.id, motivo, tanda: parte.tanda });
    }
    this.#adoptar(nuevo);
    return { anadidos, rechazados };
  }

  /**
   * Una copia del eje con sus `hasta` primeros registros (todos, por omisión), reaplicados sin volver a validarlos (ya lo
   * están; como eje.antes) y con la misma transacción con que entraron (la del libro, por su id: no se vuelven a evaluar
   * las reglas que escriben). Lo que el transporte anota fuera del cuerpo (el reloj externo, los recibos, los sellos, los
   * pagos, las bifurcaciones) va con ella: compartido si `compartir` (una copia que el eje puede adoptar), copiado si no
   * (una vista que no ha de tocar el eje). `enSeco`: una vista en seco (vistaTanda).
   */
  #copia(hasta = this.orden.length, { compartir = false, enSeco = false } = {}) {
    const c = new Eje({ exigirFirmas: this.exigirFirmas, eventosV2: this.eventosV2 });
    c.#enSeco = enSeco || this.#enSeco;
    const txs = new Map();
    for (const tx of this.#libro.transacciones()) if (typeof tx?.id === 'string' && !txs.has(tx.id)) txs.set(tx.id, tx);
    const n = Math.max(0, Math.min(hasta, this.orden.length));
    for (let k = 0; k < n; k++) {
      const ev = this.eventos.get(this.orden[k]);
      if (esRegistroDeEpoca(ev)) c.#aplicar(ev);
      else c.#aplicar(ev, txs.get(ev.id) ?? c.transaccion(ev));
    }
    c.#relojExterno = this.#relojExterno;
    c.#recibos = compartir ? this.#recibos : new Map(this.#recibos);
    c.#sellos = compartir ? this.#sellos : new Map(this.#sellos);
    c.#pagos = compartir ? this.#pagos : new Map(this.#pagos);
    c.#bifurcaciones = compartir ? this.#bifurcaciones : new Map(this.#bifurcaciones);
    c.#cota = compartir ? this.#cota : { ...this.#cota };
    return c;
  }

  /**
   * Añade una TANDA (agram-equipo/CONTRATO_TANDA.md): varios registros firmados, con su marca `contexto.tanda`, que
   * entran todos o ninguno (VG, 18-11). Comprueba la marca (fallosDeTanda: de 2 a 32, completa, en orden, encadenada) y
   * valida los miembros EN ORDEN, cada uno con las mismas reglas que eje.anadir (su id, su firma, la época) y viendo los
   * anteriores ya aplicados: el alta del autor de uno puede venir en otro anterior.
   *
   * Todo o nada: la tanda se valida sobre una COPIA del eje (#copia) y el eje solo adopta la copia, de una vez y sin
   * esperas por medio, si entran todos; si uno falla, el eje no se ha tocado (ni saldos, ni índices, ni el orden). Si el
   * eje cambia mientras se valida (otra escritura entre esperas), se vuelve a validar sobre el eje nuevo.
   *
   * Devuelve { ok: true, tanda (el id del miembro 1), eventos (lo que devuelve eje.anadir por miembro: su copia guardada) }
   * o { ok: false, indice, id, motivos (como eje.motivos) }: `indice` (desde 0) e `id` son los del miembro que falla; los
   * dos null si falla la lista entera (vacía, de uno, de más de 32, un `de` que no coincide con su largo). Los duplicados,
   * antes que la forma (CONTRATO_TANDA, precisiones 7 y 11): si todos sus ids ya están en el libro, { ok: false, indice:
   * null, id: null, motivos: [«tanda ya registrada»] }; si solo parte, el índice y el id del primero que ya estaba.
   */
  async anadirTanda(eventos) {
    if (Array.isArray(eventos) && eventos.length > 0) {
      const ya = eventos.map((ev) => idDe(ev) !== null && this.eventos.has(ev.id));
      if (ya.every(Boolean)) return { ok: false, indice: null, id: null, motivos: formados([TANDA_YA_REGISTRADA]) };
      const k = ya.indexOf(true);
      if (k >= 0) return { ok: false, indice: k, id: idDe(eventos[k]), motivos: formados(['evento ya registrado: parte de la tanda ya está en el libro y parte no (el miembro ' + (k + 1) + ' ya estaba): una tanda no se parte']) };
    }
    for (let intento = 0; intento < 3; intento++) {
      const orden = this.orden;
      const n = orden.length;
      const libro = this.#libro;
      const copia = this.#copia(n, { compartir: true });
      const r = await copia.#tandaEnSitio(eventos, { deshacer: false });
      if (this.orden !== orden || orden.length !== n || this.#libro !== libro) continue;
      if (!r.ok) return r;
      const reloj = this.#relojExterno;
      this.#adoptar(copia);
      this.#relojExterno = reloj;
      return r;
    }
    throw new Error('anadirTanda: el libro ha cambiado tres veces mientras se validaba la tanda; vuelve a lanzarla');
  }

  /**
   * Valida y aplica una tanda en ESTE eje, miembro a miembro (el de una copia, o uno que se está rehaciendo: nadie más lo
   * ve). `aplicados`: cuántos miembros del principio ya están aplicados (el génesis que abre la tanda, al restaurar). Si
   * uno falla y `deshacer`, el eje vuelve a como estaba antes de la tanda (se rehace desde su principio, #copia).
   */
  async #tandaEnSitio(crudos, { aplicados = 0, deshacer = true } = {}) {
    // La marca se juzga sobre lo que se guardaría (la copia por JSON de cada miembro), no sobre lo que llega.
    if (!Array.isArray(crudos)) return { ok: false, indice: null, id: null, motivos: formados(['una tanda es una lista de registros']) };
    const eventos = [];
    for (let k = 0; k < crudos.length; k++) {
      try {
        eventos.push(copiaGuardable(crudos[k]));
      } catch (e) {
        return { ok: false, indice: k, id: idDe(crudos[k]), motivos: formados([e.message]) };
      }
    }
    const fallo = fallosDeTanda(eventos)[0];
    if (fallo) return { ok: false, indice: fallo.indice, id: fallo.indice === null ? null : idDe(eventos[fallo.indice]), motivos: formados([fallo.texto]) };
    const antesDeLaTanda = this.orden.length; // cuántos registros había antes de los miembros que se aplican aquí
    const guardados = this.orden.slice(antesDeLaTanda - aplicados).map((id) => this.eventos.get(id));
    for (let k = aplicados; k < eventos.length; k++) {
      try {
        guardados.push(await this.#anadir(eventos[k]));
      } catch (e) {
        if (deshacer) this.#adoptar(this.#copia(antesDeLaTanda, { compartir: true }));
        return { ok: false, indice: k, id: idDe(eventos[k]), motivos: e.motivos ?? formados([e.message]) };
      }
    }
    return { ok: true, tanda: guardados[0].id, eventos: guardados };
  }

  /**
   * Probar en seco lo que compone la bandeja (CONTRATO_TANDA, «Lo que falta en el núcleo para la bandeja»): los
   * candidatos todavía SIN firmar y sin marca (los `evento` de acciones.transaccion), en orden, cada uno validado con las
   * reglas de eje.anadir y viendo los anteriores que pasan ya aplicados. Nada toca el libro: se prueban sobre una VISTA EN
   * SECO, una copia del eje que nunca se adopta. En ella no se comprueban firmas: quien tiene clave cuenta como si
   * firmase (firmará al lanzar, y entonces sí se comprueba), y lo que se asienta en ella lleva una firma de mentira que
   * no pasa en ningún otro eje. Un candidato que falla no se aplica, y los siguientes se prueban como si no estuviera.
   * Además de las reglas, lo que haría fallar la tanda al marcarla: un autor distinto del del primero (todos los miembros
   * llevan el mismo) y una referencia por prefijo («@25ddaa89») a otro candidato (CONTRATO_TANDA, precisión 6: al marcar,
   * los ids cambian y el prefijo se quedaría apuntando al de antes; entre miembros, por id entero).
   *
   * Los topes de tamaño (CONTRATO_TANDA, precisión 9), solo si se piden: `opciones.topes` = { porMiembro, porPeticion }, en
   * bytes del JSON canónico de cada candidato marcado y firmado (bytesDeMiembro) y de la lista entera (bytesDeTanda; solo
   * con dos o más). Los del contrato son TANDA_TOPES (src/evento.js); sin la opción no se mira nada: el núcleo no impone
   * tope propio. El candidato que se pasa falla con un motivo de la regla REGLA_NO_CABE (y no se aplica); la petición
   * entera, en `peticion`.
   *
   * Devuelve { vista, resultados, peticion }: `resultados`, uno por candidato, { ok, motivos } (motivos como eje.motivos;
   * más allá del 32 dice además que una tanda no cabe); `peticion`, { ok, indice: null, motivos, bytes } (la lista entera:
   * ok sin topes o si cabe); `vista`, el eje en seco con los que pasan aplicados, para componer el siguiente sobre ella
   * (acciones.transaccion(vista, plantilla, params, yo): sus defectos leen el libro con lo ya compuesto). Con [] es la
   * vista del libro de ahora.
   */
  async vistaTanda(candidatos = [], { topes } = {}) {
    const tope = (x) => (Number.isFinite(x) && x > 0 ? x : null);
    const porMiembro = tope(topes?.porMiembro);
    const porPeticion = tope(topes?.porPeticion);
    const vista = this.#copia(this.orden.length, { enSeco: true });
    const resultados = [];
    // Los ids de los candidatos (con el suyo calculado si no lo traen): los de antes de marcar.
    const conId = [];
    for (const c of candidatos) {
      let ev;
      try {
        ev = copiaGuardable(c);
        if (ev && typeof ev === 'object' && typeof ev.id !== 'string') ev = congelar({ ...ev, id: await hash(canonico(cuerpo(ev))) });
      } catch (e) {
        ev = e;
      }
      conId.push(ev);
    }
    const ids = conId.map(idDe).filter((id) => id !== null);
    const autor = conId[0] && typeof conId[0] === 'object' && !(conId[0] instanceof Error) ? conId[0].autor : undefined;
    for (let k = 0; k < conId.length; k++) {
      const ev = conId[k];
      const extra = k >= TANDA_MAXIMA ? formados(['una tanda lleva como mucho ' + TANDA_MAXIMA + ' registros: este no cabe en la misma']) : [];
      try {
        if (ev instanceof Error) throw ev;
        const tanda = [];
        if (k > 0 && ev && typeof ev === 'object' && ev.autor !== autor) tanda.push('su autor es ' + String(ev.autor) + ' y el del primero, ' + String(autor) + ': todos los registros de una tanda llevan el mismo autor');
        for (const { prefijo, id } of prefijosAMiembros(ev, ids.filter((i) => i !== ev?.id))) {
          tanda.push('nombra a otro registro de la tanda por prefijo (' + prefijo + ', el ' + id.slice(0, 8) + '): al lanzarla su id cambia; entre registros de una tanda, por id entero');
        }
        if (tanda.length) throw rechazo('evento rechazado: ' + tanda.join('; '), formados(tanda));
        if (porMiembro !== null) {
          const pesa = bytesDeMiembro(ev, k, conId.length);
          if (pesa > porMiembro) {
            const texto = 'no cabe: marcado y firmado ocupa ' + pesa + ' bytes y el tope por registro es ' + porMiembro;
            throw rechazo('evento rechazado: ' + texto, [conForma({ texto, regla: REGLA_NO_CABE, estado: 'falla', causa: null }, { que: 'record too large', partes: { bytes: pesa, cap: porMiembro } })]);
          }
        }
        await vista.#anadir(ev);
        resultados.push({ ok: extra.length === 0, motivos: extra });
      } catch (e) {
        resultados.push({ ok: false, motivos: [...(e.motivos ?? formados([e.message])), ...extra] });
      }
    }
    // La petición entera (solo una tanda: dos o más), con lo que se pueda medir.
    const medibles = conId.filter((ev) => ev && typeof ev === 'object' && !(ev instanceof Error));
    let peticion = { ok: true, indice: null, motivos: [], bytes: null };
    if (porPeticion !== null && conId.length >= TANDA_MINIMA && medibles.length === conId.length) {
      const pesa = bytesDeTanda(medibles);
      const texto = 'no cabe: la tanda entera, marcada y firmada, ocupa ' + pesa + ' bytes y el tope por petición es ' + porPeticion;
      peticion = pesa > porPeticion ? { ok: false, indice: null, motivos: [{ texto, regla: REGLA_NO_CABE, estado: 'falla', causa: null }], bytes: pesa } : { ...peticion, bytes: pesa };
    }
    return { vista, resultados, peticion };
  }

  /**
   * Lo mismo que vistaTanda, solo los resultados: [{ ok, motivos }], uno por candidato, y en la propiedad `peticion` del
   * array, el veredicto de la lista entera ({ ok, indice: null, motivos, bytes }). No toca el libro.
   */
  async probarTanda(candidatos, opciones = {}) {
    const { resultados, peticion } = await this.vistaTanda(candidatos, opciones);
    return Object.defineProperty(resultados, 'peticion', { value: peticion, enumerable: false });
  }

  /** ¿Es una vista en seco (vistaTanda)? Lo que se compone sobre ella no se asienta nunca en el libro. */
  get enSeco() {
    return this.#enSeco;
  }

  /**
   * En una vista en seco, `ev` como si lo firmase su autor si tiene clave (la del eje, o la que declara su propia alta):
   * con firmante y una firma de mentira que no verifica con ninguna clave, así las reglas que miran quién firma («who
   * has a key signs») lo ven firmado. Fuera de una vista en seco, o si ya va firmado, `ev` tal cual.
   */
  #comoFirmado(ev) {
    if (!this.#enSeco || !ev || typeof ev !== 'object' || ev.firma) return ev;
    const clave = this.claves.get(ev.autor) ?? (this.#libro.tiene(ev.autor) ? undefined : ev.contexto?.claves?.[ev.autor]);
    return clave ? congelar({ ...ev, firmante: ev.autor, firma: FIRMA_EN_SECO }) : ev;
  }

  /** Toma todo el estado de `otro` (un eje recién construido): lo público y lo privado. */
  #adoptar(otro) {
    this.eventos = otro.eventos;
    this.orden = otro.orden;
    this.claves = otro.claves;
    this.hijos = otro.hijos;
    this.demostracion = otro.demostracion;
    this.#libro = otro.#libro;
    this.#series = otro.#series;
    this.#obtenidoDeSerie = otro.#obtenidoDeSerie;
    this.#tiposV2 = otro.#tiposV2;
    this.#hijosEn = otro.#hijosEn;
    this.#prefijos = otro.#prefijos;
    this.#porAutor = otro.#porAutor;
    this.#llegada = otro.#llegada;
    this.#prefijoV2 = otro.#prefijoV2;
    this.#tMax = otro.#tMax;
    this.#tPorAutor = otro.#tPorAutor;
    this.#relojExterno = otro.#relojExterno;
    this.#recibos = otro.#recibos;
    this.#sellos = otro.#sellos;
    this.#pagos = otro.#pagos;
    this.#bifurcaciones = otro.#bifurcaciones;
    this.#cota = otro.#cota;
    this.#epoca = otro.#epoca;
    this.#escritura = otro.#escritura;
    this.#deLaEpoca = otro.#deLaEpoca;
    this.#versiones = otro.#versiones;
    this.#enVigor = otro.#enVigor;
  }

  get genesisId() {
    return this.orden[0];
  }

  /**
   * Ids que empiezan por `prefijo`, en orden de entrada: lo mismo que
   * `eje.orden.filter((id) => id.startsWith(prefijo))`, sin recorrer el eje
   * entero cuando el prefijo tiene al menos PREFIJO caracteres (un índice por
   * los primeros; docs/notas/RENDIMIENTO.md). Lo usan las referencias por
   * prefijo («@25ddaa89», REF("25ddaa89")).
   */
  conPrefijo(prefijo) {
    if (typeof prefijo !== 'string' || prefijo.length < PREFIJO) return this.orden.filter((id) => id.startsWith(prefijo));
    return (this.#prefijos.get(prefijo.slice(0, PREFIJO)) ?? []).filter((id) => id.startsWith(prefijo));
  }

  obtener(id) {
    return this.eventos.get(id);
  }

  /** Identidades con cuenta en el libro, en el orden en que nacieron. */
  identidades() {
    return this.#libro.titulares();
  }

  /** Saldo disponible: lo que se puede consumir o transferir. Lo bloqueado no cuenta. */
  saldo(identidad, clave) {
    return this.#libro.saldo(identidad, clave);
  }

  /** Cantidad bloqueada de una serie en una identidad, sumando todas sus salidas (o solo la de `salida`, si se da). */
  bloqueado(identidad, clave, salida) {
    return this.#libro.bloqueado(identidad, clave, salida);
  }

  /**
   * Lo bloqueado de una serie con una salida, sumando todos los titulares:
   * comprometer P con una decisión es bloquearlo con ella como salida (mapa §15).
   */
  bloqueadoCon(clave, salida) {
    return this.#libro.bloqueadoPorSalida(salida, clave);
  }

  /** Bloqueos con una salida, de cualquier titular y serie: [{ identidad, clave, cantidad }] con cantidad > 0. */
  bloqueosCon(salida) {
    return this.#libro.bloqueosCon(salida).map(({ titular, serie, cantidad }) => ({ identidad: titular, clave: serie, cantidad }));
  }

  /** Bloqueos de una identidad: [{ clave, token, serie, ...campos, salida, cantidad }] con cantidad > 0. */
  bloqueos(identidad) {
    return this.#libro.bloqueos(identidad).map(({ serie: clave, salida, cantidad }) => ({ clave, ...partirClave(clave), salida, cantidad }));
  }

  /**
   * Obligación de un emisor por su R (doble entrada, V10): la cantidad de su R
   * que está en manos ajenas, disponible o bloqueada. Se deriva de los saldos;
   * no es un token. Mientras la R está en su cartera no obliga a nada.
   */
  obligaciones(emisor) {
    const clave = 'R:' + emisor;
    let total = 0;
    for (const id of this.#libro.titulares()) if (id !== emisor) total += this.saldo(id, clave) + this.bloqueado(id, clave);
    return total;
  }

  /**
   * T disponible en una escala el día de `t` (VG, 8-11: asignación diaria):
   * cada escala es su propio token (T:<escala>), sin conversión. Para una
   * persona dada de alta, lo que queda de su asignación de ese día
   * (tokens.asignacionT menos gastadoT): ningún T se acumula (VG, 8-11: no hay
   * T acumulable; el génesis no emite T). Solo quien viene del prefijo de la
   * versión 2 suma el T explícito que arrastre de entonces. Para una cosa, que
   * no tiene asignación, su T explícito: el que le dio su persona, que conserva
   * hasta gastarlo. Sin `t`, el día del último evento de esa identidad
   * (su propio reloj) o el de su alta. Las tres informativas son ilimitadas:
   * siempre queda 1. Semana, ciclo y año, en sus partes (tokens.PARTES_T).
   */
  saldoT(identidad, escala, t) {
    if (!ESCALAS_T.includes(escala)) throw new Error('escala T inválida: ' + escala);
    if (ESCALAS_INFORMATIVAS.includes(escala)) return 1;
    return this.saldo(identidad, 'T:' + escala) + this.#quedaAsignacion(identidad, escala, t);
  }

  /** Lo que queda de la asignación diaria de T de `identidad` en `escala` el día de `t` (0 si no es una persona con alta). */
  #quedaAsignacion(identidad, escala, t) {
    const alta = this.alta(identidad);
    if (!alta || this.esPersona(identidad) !== true) return 0;
    const a = asignacionT(t ?? this.#tPorAutor.get(identidad) ?? alta.t, escala);
    return Math.max(0, a.cantidad - this.gastadoT(identidad, escala, a.periodo));
  }

  /**
   * Lo que una identidad ha recibido de su emisor, por serie de E y de R (la vista `A.8.6`; VG, tras 3b-bis: la
   * obtención de P es un tope acumulado, diez por unidad neta recibida del emisor): [{ serie, emisor, recibido,
   * devuelto, neto }] por cada serie que le ha llegado alguna vez directamente de su emisor (también la que ya no tiene),
   * en el orden en que tocó cada serie. `recibido` es lo transferido del emisor a ella; `devuelto`, lo que ella ha
   * transferido al emisor; `neto` = recibido − devuelto (puede ser negativo si devuelve lo que compró a un tenedor).
   * Lo que pasa entre tenedores no cuenta. Un emisor no se recibe a sí mismo.
   */
  recibidoDelEmisor(identidad) {
    const claves = this.#libro.disponibles(identidad).map(([k]) => k);
    for (const b of this.#libro.bloqueos(identidad)) if (!claves.includes(b.serie)) claves.push(b.serie);
    const fuera = [];
    for (const k of claves) {
      const familia = k.slice(0, 2);
      if (familia !== 'E:' && familia !== 'R:') continue;
      const { emisor } = partirClave(k);
      if (!emisor || emisor === identidad) continue;
      const recibido = this.#libro.sumas({ primitiva: 'transferir', serie: k, de: emisor, a: identidad });
      if (!(recibido > 0)) continue;
      const devuelto = this.#libro.sumas({ primitiva: 'transferir', serie: k, de: identidad, a: emisor });
      fuera.push({ serie: k, emisor, recibido, devuelto, neto: recibido - devuelto });
    }
    return fuera;
  }

  /**
   * El P que la regla `regla` (su nombre) ha acuñado, de todos los orígenes, por lo recibido de la serie de E o R
   * `serie` (el tope por serie, VG tras 3b-bis: nunca pasa de diez por unidad acuñada de esa serie; la misma unidad no
   * da P dos veces aunque vuelva a su emisor por un tercero y salga otra vez).
   */
  obtenidoDeSerie(serie, regla) {
    return this.#obtenidoDeSerie.get(L2(regla, serie)) ?? 0;
  }

  /** Saldos de una familia por serie: [{ token, serie, ...campos de la serie, cantidad }] con saldo > 0. */
  #porSerie(identidad, token) {
    return this.#libro.disponibles(identidad)
      .filter(([k, v]) => k.startsWith(token + ':') && v > 0)
      .map(([k, v]) => ({ ...partirClave(k), cantidad: v }));
  }

  /** Tiempo de una identidad: [{ escala, cantidad }] en el orden de las escalas. */
  tiempos(identidad) {
    return this.#porSerie(identidad, 'T')
      .map(({ escala, cantidad }) => ({ escala, cantidad }))
      .sort((a, b) => ESCALAS_T.indexOf(a.escala) - ESCALAS_T.indexOf(b.escala));
  }

  /** Recursos de una identidad: [{ emisor, denominacion, registro (si la serie lo nombra), cantidad }]; cada serie de E es de su emisor. */
  recursos(identidad) {
    return this.#porSerie(identidad, 'E').map(({ emisor, denominacion, registro, cantidad }) => ({ emisor, denominacion, ...(registro ? { registro } : {}), cantidad }));
  }

  /**
   * Una serie tal como la leen las reglas, o null si no existe: su emisor y
   * su contrato (E: caduca, registro, divisible, emisores), con lo emitido
   * (lo acuñado como emisión), lo consumido (lo quemado, en E y T) y, en T,
   * lo que salió de asignaciones: todo del libro.
   */
  #serieCruda(clave) {
    const s = this.#series.get(clave);
    if (!s) return null;
    const emitido = this.#libro.sumas({ primitiva: 'acunar', serie: clave, clase: 'emision' });
    const token = clave.slice(0, clave.indexOf(':'));
    if (token === 'E') return { emisor: s.emisor, emitido, ...s.contrato, consumido: this.#libro.sumas({ primitiva: 'quemar', serie: clave }) };
    if (token === 'T') {
      return { emisor: s.emisor, emitido, consumido: this.#libro.sumas({ primitiva: 'quemar', serie: clave }), deAsignacion: this.#libro.sumas({ primitiva: 'acunar', serie: clave, clase: ASIGNACION }) };
    }
    // P (encargo 3b): lo acuñado es la obtención y la reposición, no una emisión.
    if (token === 'P') return { emisor: s.emisor, emitido: this.#libro.sumas({ primitiva: 'acunar', serie: clave }) };
    return { emisor: s.emisor, emitido };
  }

  /**
   * Una serie por su clave de saldo ('E:casa/EUR', 'R:casa', 'T:hora', 'P:<registro>/<origen>'): quién la emite (en P, su origen) y cuánto ha emitido,
   * y `caduca` si es una serie de E que la lleva. En T, `emisor` es quien la emitió o la consumió primero; lo de cada persona, saldoT.
   * Del contrato de una serie de E, también `divisible` (si admite fracciones) y `emisores` (si la emisión es conjunta).
   */
  serie(clave) {
    const s = this.#serieCruda(clave);
    return {
      emisor: s?.emisor ?? null,
      emitido: s?.emitido ?? 0,
      ...(s?.caduca ? { caduca: s.caduca } : {}),
      ...(s?.divisible ? { divisible: true } : {}),
      ...(s?.emisores ? { emisores: [...s.emisores] } : {}),
      // El precio de la serie (VG, tras 3b-bis: la orientación de una E es el token que la paga), si lo declaró su emisión.
      ...(s?.precio ? { precio: [...s.precio] } : {}),
      ...(s?.precios ? { precios: s.precios.map((p) => [...p]) } : {}),
    };
  }

  /**
   * E vivo de una serie (R2, VG 7-11 noche): lo emitido menos lo consumido, y
   * nada si ha caducado en `t` (caducada). Sin `t` no mira la caducidad.
   * Lo que no es una serie de E emitida da 0. Con la clave de una familia
   * (la franja «*», tokens.familiaDe), la suma de todas sus franjas.
   */
  vivo(clave, t) {
    if (!clave.startsWith('E:')) return 0;
    if (franjaDe(partirClave(clave).denominacion) === TODAS_LAS_FRANJAS) {
      let total = 0;
      for (const k of this.#series.keys()) if (k.startsWith('E:') && k !== clave && familiaDe(k) === clave) total += this.vivo(k, t);
      return total;
    }
    const s = this.#serieCruda(clave);
    if (!s) return 0;
    if (t !== undefined && caducada(this, clave, t)) return 0;
    return s.emitido - s.consumido;
  }

  /**
   * Registro al que está atada una serie de E: el que nombra su clave o, si no
   * nombra ninguno, el del propio emisor (su alta; el génesis para quien lo
   * escribió). null si la serie no existe.
   */
  registroDe(clave) {
    return this.#series.get(clave)?.contrato?.registro ?? null;
  }

  /**
   * Los topes de E que alcanzan a un registro (R2): cada registro de su hilo
   * (él mismo incluido, hasta el génesis) que declara capacidad
   * (tokens.capacidadDe sobre su payload raíz), del más cercano al génesis,
   * con el E vivo en `t` de ese registro y de todos sus descendientes POR
   * FRANJA (tokens.franjaDe), sumando todas las denominaciones y todos los
   * emisores de esa franja: [{ registro, capacidad, franja, vivo, libre }].
   * Con `franja`, una fila por registro para esa franja; sin ella, una por
   * cada franja que tenga alguna serie debajo (o la franja '' si no hay
   * ninguna), en orden de texto. Vacío si nadie en el hilo declara capacidad:
   * entonces no hay tope.
   */
  topes(registro, t, franja) {
    const declarados = this.#topesDe(registro);
    if (!declarados.length) return [];
    return declarados.flatMap(({ id, capacidad }) => {
      const porFranja = new Map();
      for (const [clave, s] of this.#series) {
        const reg = s.contrato?.registro;
        if (!clave.startsWith('E:') || !reg || !this.hilo(reg).some((e) => e.id === id)) continue;
        const f = franjaDe(partirClave(clave).denominacion);
        porFranja.set(f, (porFranja.get(f) ?? 0) + this.vivo(clave, t));
      }
      const franjas = franja !== undefined ? [franja] : porFranja.size ? [...porFranja.keys()].sort() : [''];
      return franjas.map((f) => {
        const vivo = porFranja.get(f) ?? 0;
        return { registro: id, capacidad, franja: f, vivo, libre: capacidad - vivo };
      });
    });
  }

  /** Registros del hilo de `registro` que declaran capacidad, del más cercano al génesis: [{ id, capacidad }]. */
  #topesDe(registro) {
    if (!registro || !this.eventos.has(registro)) return [];
    return this.hilo(registro).map((e) => ({ id: e.id, capacidad: capacidadDe(e.payload) })).filter((x) => x.capacidad !== undefined);
  }

  /**
   * Todas las series emitidas, de las cuatro familias, por orden de emisión:
   * [{ clave, token, serie, ...campos, emisor, emitido, bloqueado, caduca (solo en E: ISO o null) }].
   * `bloqueado` es lo que de esa serie está bloqueado, sumando todos los titulares.
   * En E, además (R2): `registro` (el que nombra la clave o el del emisor),
   * `consumido`, `divisible`, `emisores` (quienes la respaldan con su P
   * bloqueado) y `tope`: la capacidad del registro más cercano de su hilo que
   * la declara, o null, y entonces `nota` lo dice («sin capacidad declarada:
   * deuda del emisor»).
   */
  series() {
    const bloqueado = this.#libro.bloqueadoPorSerie();
    return [...this.#series.keys()].map((clave) => {
      const s = this.#serieCruda(clave);
      const partes = partirClave(clave);
      const base = { clave, ...partes, emisor: s.emisor, emitido: s.emitido, bloqueado: bloqueado.get(clave) ?? 0 };
      // T (VG, 8-11): lo consumido al escribir y lo que salió de la asignación diaria; lo de cada registro, tiempoSobre.
      // Las tres informativas, marcadas aparte (informativa: true; lo registrado, tiempoInformativo).
      if (partes.token === 'T') {
        if (ESCALAS_INFORMATIVAS.includes(partes.escala)) return { ...base, consumido: s.consumido ?? 0, informativa: true };
        return { ...base, consumido: s.consumido ?? 0, deAsignacion: s.deAsignacion ?? 0 };
      }
      if (partes.token !== 'E') return base;
      const tope = this.#topesDe(s.registro)[0]?.capacidad ?? null;
      return {
        ...base,
        caduca: s.caduca ?? null,
        registro: s.registro ?? null,
        consumido: s.consumido,
        divisible: s.divisible === true,
        emisores: s.emisores ? [...s.emisores] : [s.emisor],
        tope,
        ...(tope === null ? { nota: SIN_CAPACIDAD } : {}),
      };
    });
  }

  /** Poderes de una identidad: [{ ambito, origen, cantidad }], uno por serie (registro y origen). No hay P total. */
  poderes(identidad) {
    return this.#porSerie(identidad, 'P').map(({ ambito, origen, cantidad }) => ({ ambito, origen, cantidad }));
  }

  /**
   * El P de una identidad posicionado en un registro (mapa §15: «P son unidades acuñadas y posicionadas en
   * registros»), disponible y bloqueado. Ya no hay P sobre todo el eje ni P que cubra lo de debajo: el P de un
   * registro es criterio sobre él, y llevarlo a otro es reposicionarlo (subir deja una décima, bajar añade una).
   * Suma todos los orígenes (encargo 3b-bis): el que obtuvo ella y el que le delegaron; con `origen`, solo el de ese.
   * P por mirada (VG, tras 3b-bis): sin `mirada`, todo el P posicionado en el registro, el del registro entero y el de
   * cada una de sus miradas («r.d»); con `mirada` = d, lo que pesa en una decisión sobre la mirada d: el P sobre r
   * entero y el P sobre r.d (el de otras miradas no).
   */
  poderSobre(identidad, registro, origen, mirada) {
    let total = 0;
    for (const [k, v] of Object.entries(this.#libro.vista(identidad))) {
      const p = k.startsWith('P:') ? partirClave(k) : null;
      if (!p || p.raiz !== registro || (origen !== undefined && p.origen !== origen)) continue;
      if (mirada !== undefined && p.mirada !== undefined && p.mirada !== mirada) continue;
      total += v.disponible + Object.values(v.bloqueado).reduce((s, x) => s + x, 0);
    }
    return total;
  }

  /**
   * El P de un origen (encargo 3b-bis: «el P guarda su origen»): lo que obtuvo `origen`, esté en la mano que esté,
   * por ámbito (el registro entero, o una mirada suya «r.d»: VG, tras 3b-bis), disponible y bloqueado:
   * [{ registro, mirada, ambito, cantidad, titulares }] en el orden en que aparece cada ámbito.
   */
  obtenidoPor(origen) {
    const porAmbito = new Map();
    for (const id of this.#libro.titulares()) {
      for (const [k, v] of Object.entries(this.#libro.vista(id))) {
        if (!k.startsWith('P:')) continue;
        const p = partirClave(k);
        if (p.origen !== origen) continue;
        const c = v.disponible + Object.values(v.bloqueado).reduce((s, x) => s + x, 0);
        if (!(c > 0)) continue;
        if (!porAmbito.has(p.ambito)) porAmbito.set(p.ambito, { registro: p.raiz, ...(p.mirada === undefined ? {} : { mirada: p.mirada }), ambito: p.ambito, cantidad: 0, titulares: [] });
        const x = porAmbito.get(p.ambito);
        x.cantidad += c;
        if (!x.titulares.includes(id)) x.titulares.push(id);
      }
    }
    return [...porAmbito.values()];
  }

  /** Reputación de una identidad: [{ emisor, cantidad }], no fungible. */
  reputaciones(identidad) {
    return this.#porSerie(identidad, 'R').map(({ emisor, cantidad }) => ({ emisor, cantidad }));
  }

  /**
   * La transacción de la capa cero que asienta `ev` con el eje de ahora
   * (VG, 9-11; src/libro.js): un paso por movimiento, en su orden.
   *   de = null                       acuñar (clase «emision»)
   *   estado 'bloqueo' / 'liberacion' bloquear / liberar, con su salida
   *   salida en una transferencia     transferir de lo bloqueado con esa salida (delegar; recoger lo que guarda una invitación)
   *   P (de ≠ null)                   transferir (o quemar, si a = null) el P de ese mismo registro (mapa §15: sin ámbitos que lo cubran)
   *   T informativo                   acuñar (clase «informativo»: si lo gastas te vuelve a salir uno) y quemar
   *   T de la asignación del día      acuñar (clase «asignacion», etiqueta = el día civil, tope = la asignación del día)
   *                                   y transferir o quemar: lo que falte sale del T explícito
   *   lo demás                        transferir, o quemar si a = null
   * Detrás, la obtención de P: lo que colocan las reglas que escriben de la época (acuñar P, clase «obtencion»).
   * Un movimiento mal formado es un paso vacío (lo cuenta la forma). `sobre` y
   * `en` son el anclaje; el payload, el memo.
   */
  transaccion(ev) {
    const reglas3 = this.orden.length >= this.eventosV2;
    // La asignación del día es de las personas (B1): de quien escribió su alta, o de quien la escribe ahora.
    const conAsignacion = reglas3 && this.#escribePersona(ev);
    const paso = (m) => {
      if (!m || typeof m !== 'object' || validarMovimiento(m).length) return [];
      // El movimiento anunciado (VG 12-11, decisión 8) no toca saldos: un paso vacío; lo lee `moves` con la clase «anuncio».
      if (esAnunciado(m)) return [];
      const k = claveToken(m);
      const c = cantidadBase(m);
      // El P que se acuña a mano es una reposición (la regla «P is repositioned one step at a time» lo exige).
      if (m.de === null) return [acunar(k, m.a, c, m.token === 'P' ? { clase: REPOSICION_P } : {})];
      if (m.estado === 'bloqueo') return [bloquear(k, m.de, c, m.salida)];
      if (m.estado === 'liberacion') return [liberar(k, m.de, c, m.salida)];
      // La transferencia con salida (mapa §15, delegar; §16, la invitación): de lo bloqueado con esa salida.
      if (m.salida !== undefined) return [transferir(k, m.de, m.a, c, { salida: m.salida })];
      const sale = (opciones = {}) => (m.a === null ? quemar(k, m.de, c, opciones) : transferir(k, m.de, m.a, c, opciones));
      if (reglas3 && esInformativoT(m)) {
        return [acunar(k, m.de, c, { clase: INFORMATIVO }), quemar(k, m.de, c, { clase: INFORMATIVO, escala: m.escala, refiere: m.refiere, nota: m.nota })];
      }
      if (conAsignacion && gastaAsignacion(m, ev.autor, true)) {
        const a = asignacionT(ev.t, m.escala);
        return [acunar(k, m.de, c, { clase: ASIGNACION, etiqueta: a.periodo, tope: a.cantidad }), sale()];
      }
      return [sale()];
    };
    return transaccion({
      id: ev.id,
      autor: ev.autor,
      t: ev.t,
      ancla: { sobre: ev.sobre ?? null, en: ev.en ?? null },
      memo: ev.payload,
      firma: ev.firma ?? null,
      firmante: ev.firmante ?? null,
      abre: ev.contexto?.genesis === true && typeof ev.autor === 'string' ? [ev.autor] : [],
      movimientos: [...(Array.isArray(ev.movimientos) ? ev.movimientos : []).map(paso), ...(reglas3 ? this.#obtencion(ev) : [])],
    });
  }

  /**
   * La obtención de P (encargo 3b; mapa §15, N1, N2 y N3): lo que colocan las reglas que escriben de la época
   * («put» en su 4) sobre la candidata, como acuñaciones de P de la misma transacción, después de sus movimientos.
   * Cada colocación `put v at A.2.1.(r)` es un NIVEL (un estado BTML, no un incremento): «el P obtenido por A sobre r
   * por esta regla llega al menos a v». Es P posicionado en el registro r para la identidad A, de origen A (encargo
   * 3b-bis: el P guarda quién lo obtuvo): se acuña P:r/A a A con la clase «obtencion», la etiqueta = el nombre de la
   * regla y `tope: v` (la acuñación programada del libro): solo lo que falte para que lo acuñado por esa regla a A
   * sobre r llegue a v. Si ya llegó, no se acuña nada (y no se quema nada por bajar el nivel). Varias colocaciones
   * de la misma regla para el mismo A y r en una transacción: se queda el máximo nivel, no la suma. Es el tope
   * acumulado que decidió VG tras el 3b-bis (en vez de una sola obtención por regla, titular y registro): dos plazas
   * en dos transacciones dan lo mismo que en una, y una emisión de polvo solo da el P del polvo. Lo que coloca una
   * regla que no se resuelve no se acuña (la transacción mal formada ya la rechaza el suelo). No es código de negocio:
   * cuánto, a quién y dónde lo dicen las reglas.
   *
   * Un segundo tope, POR SERIE (revisión de la PR del tope acumulado): lo que una regla acuña por lo que llega de una
   * serie de E o R (la colocación lleva en `desde` el movimiento en que se hizo, src/bqlm.js) nunca pasa, sumando
   * todos los orígenes, de diez por unidad acuñada de esa serie (lo emitido antes más lo que la transacción acuña).
   * Así la misma unidad no da P dos veces aunque vuelva al emisor por un tercero y salga otra vez: lo que falte para
   * el nivel se acuña solo hasta donde llegue el cupo de sus series, y el paso apunta cuánto viene de cada una
   * (`series`), que el eje suma al asentar (obtenidoDeSerie).
   */
  #obtencion(ev) {
    // Un registro de la época no obtiene nada (la exención del génesis); mientras la época no está entera, nada se lee.
    if (esRegistroDeEpoca(ev) || (this.#escritura && !this.#epoca)) return [];
    const epoca = this.#epocaVigente();
    const reglas = epoca.escrituras;
    if (!reglas.length || !ev || typeof ev !== 'object' || typeof ev.id !== 'string') return [];
    const DIEZ_POR_UNIDAD = diezPorUnidad(epoca);
    let ctx;
    try {
      ctx = new ContextoEje(this, { ev, epoch: epoca });
    } catch {
      return [];
    }
    // El nivel por regla, titular y registro: el máximo de lo que la regla coloca en la transacción.
    const niveles = new Map();
    for (const regla of reglas) {
      let r;
      try {
        r = evaluarEscritura(regla, ctx);
      } catch {
        continue;
      }
      if (r.estado !== 'RESUELTO') continue;
      for (const w of r.escrituras) {
        if (w.camino.length !== 2 || w.camino[0] !== 2 || w.camino[1] !== 1) continue; // solo A.2.1: el P posicionado
        if (typeof w.sujeto !== 'string' || !w.sujeto || typeof w.clave !== 'string' || !w.clave || !(w.valor > 0) || !Number.isFinite(w.valor)) continue;
        if (/[|:/]/.test(w.sujeto) || /[|:/]/.test(w.clave)) continue; // separadores de la clave de serie
        // P por mirada (VG, tras 3b-bis): `put v at A.2.1.(r).d` coloca sobre la mirada d de r («r.d»); sin dígito, sobre r entero.
        if (w.posicion !== undefined && (w.posicion.length !== 1 || !Number.isInteger(w.posicion[0]) || w.posicion[0] < 0 || w.posicion[0] > 9)) continue;
        const ambito = ambitoDe(w.clave, w.posicion?.[0]);
        const etiqueta = nombreDeRegla(regla);
        const vez = JSON.stringify([etiqueta, w.sujeto, ambito]);
        if (!niveles.has(vez)) niveles.set(vez, { etiqueta, sujeto: w.sujeto, registro: ambito, valor: w.valor, desde: [] });
        const nivel = niveles.get(vez);
        if (w.valor > nivel.valor) nivel.valor = w.valor;
        // La serie de la que viene la colocación (el movimiento del where en que se hizo), para el tope por serie.
        const m = w.desde?.k === 'mov' ? w.desde.m : null;
        const fuente = m && typeof m === 'object' && !validarMovimiento(m).length && m.token !== 'P' && m.token !== 'T' ? claveToken(m) : null;
        if (fuente && !nivel.desde.includes(fuente)) nivel.desde.push(fuente);
      }
    }
    // El cupo de cada serie en esta transacción: diez por unidad acuñada (antes, y lo que acuña la candidata) menos lo
    // que la regla ya acuñó por ella, de todos los orígenes; lo que se reparte aquí también se descuenta.
    const acunadaAqui = (fuente) => (Array.isArray(ev.movimientos) ? ev.movimientos : []).reduce((s, m) => s + (m && typeof m === 'object' && m.de === null && !esAnunciado(m) && !validarMovimiento(m).length && claveToken(m) === fuente ? cantidadBase(m) : 0), 0);
    const usado = new Map();
    const cupo = (etiqueta, fuente) => DIEZ_POR_UNIDAD * (this.#libro.sumas({ primitiva: 'acunar', serie: fuente, clase: EMISION }) + acunadaAqui(fuente)) - this.obtenidoDeSerie(fuente, etiqueta) - (usado.get(L2(etiqueta, fuente)) ?? 0);
    const pasos = [];
    for (const { etiqueta, sujeto, registro, valor, desde } of niveles.values()) {
      const serie = claveToken({ token: 'P', ambito: registro, origen: sujeto });
      // Lo ya acuñado por esa regla a ese titular sobre ese registro: si llega al nivel, no hay paso (ni vacío).
      const ya = this.libro.sumas({ primitiva: 'acunar', serie, titular: sujeto, clase: OBTENCION, etiqueta });
      if (!(valor > ya)) continue;
      let falta = valor - ya;
      const opciones = { clase: OBTENCION, etiqueta, regla: etiqueta };
      if (desde.length) {
        // El tope por serie: lo que falta se cubre con el cupo de las series de donde viene, en su orden.
        const series = [];
        for (const fuente of desde) {
          const parte = Math.min(falta, Math.max(0, cupo(etiqueta, fuente)));
          if (!(parte > 0)) continue;
          series.push([fuente, parte]);
          usado.set(L2(etiqueta, fuente), (usado.get(L2(etiqueta, fuente)) ?? 0) + parte);
          falta -= parte;
          if (!(falta > 0)) break;
        }
        const cubierto = series.reduce((s, [, c]) => s + c, 0);
        if (!(cubierto > 0)) continue;
        opciones.series = series;
        falta = cubierto;
      }
      const tope = ya + falta;
      pasos.push([acunar(serie, sujeto, tope, { ...opciones, tope })]);
    }
    return pasos;
  }

  /**
   * Lo que leen las condiciones (src/condiciones/) de la transacción de `ev`:
   * el eje de antes del evento. `evento` es el registro; `ciclo`, `tope` y `r`,
   * los contextos de las reglas del ciclo, de la E atada y de R.
   */
  contexto(ev) {
    const eje = this;
    const reglas = this.orden.length < this.eventosV2 ? 2 : 3;
    let ciclo;
    let tope;
    let validos;
    return {
      evento: ev,
      reglas,
      tLaxo: reglas === 2,
      exigirFirmas: this.exigirFirmas,
      exigeClave: this.#exigeClave(),
      // Una vista en seco (vistaTanda): la firma no se comprueba (src/condiciones/identidad.js, FIRMA).
      enSeco: this.#enSeco,
      registrado: (id) => this.eventos.has(id),
      registro: (id) => this.eventos.get(id),
      clave: (id) => this.claves.get(id),
      tieneClave: (id) => this.claves.has(id),
      // B1: persona o cosa por autoría del alta (esPersona); en el prefijo de la versión 2, el tipo que se declaraba.
      persona: (id) => this.esPersona(id),
      tipoV2: (id) => this.tipoV2(id),
      tipoV2Declarado: (id) => this.#tiposV2.has(id),
      // Los movimientos bien formados del evento, con su índice: los leen varias condiciones.
      get validos() { return (validos ??= validosDe(ev)); },
      // Las reglas de la época (src/condiciones/reglas.js) leen el eje de antes con el BQL mínimo.
      contextoBqlm: (epoch) => new ContextoEje(eje, { ev, epoch }),
      // La época con que se juzga (#107): la del eje.
      epoca: eje.#epocaVigente(),
      get ciclo() { return (ciclo ??= eje.#contextoCiclo(ev)); },
      get tope() { return (tope ??= eje.#contextoTope()); },
    };
  }

  /**
   * Errores que impedirían añadir el evento; vacío si es admisible. Se valida
   * la copia que se guardaría (normalizarEvento), nunca lanza por la forma.
   * El evento se traduce a su transacción y el libro la prueba con las
   * condiciones (src/condiciones/index.js, CONDICIONES) y su aritmética.
   */
  async validar(crudo) {
    return (await this.motivos(crudo)).map((m) => m.texto);
  }

  /**
   * Lo mismo que validar, con forma (#100): [{ texto, regla, estado, causa }], en el mismo orden y con el mismo
   * `texto`. `regla`, el nombre de la regla de la época o de la condición que lo dice (null si es la aritmética del
   * libro, la forma o la época escrita); `estado`, 'pendiente' si una regla de la época no se resolvió y 'falla' si
   * no; `causa`, 'limit_exhausted' (CAUSA_LIMITE) si se paró por un límite de cálculo, null si no. Si alguna regla
   * falla con veredicto, solo cuentan esas (src/condiciones/reglas.js): la parada por límite no sale.
   */
  async motivos(crudo) {
    let ev;
    try {
      ev = normalizarEvento(crudo);
    } catch (e) {
      return formados(['no cabe en JSON: ' + e.message]);
    }
    if (!ev || typeof ev !== 'object') return formados(validarForma(ev, { tLaxo: this.orden.length < this.eventosV2 }));
    if (esMiembroDeTanda(ev)) return formados([MIEMBRO_SUELTO]);
    ev = this.#comoFirmado(ev);
    if (esRegistroDeEpoca(ev)) return formados(await this.#erroresDeEpoca(ev));
    if (this.#escritura && !this.#epoca) return formados([this.#faltaEpoca()]);
    const { motivos } = await this.#libro.probar(this.transaccion(ev), condicionesDe(this.#epocaVigente()), this.contexto(ev));
    return [...motivosDeTx(ev, motivos), ...delMotor(this.#motor(ev).motivos)];
  }

  /**
   * Lo que leen las reglas del ciclo (src/ciclo.js): el eje de antes del evento
   * `ev`. El alta de quien entró en el prefijo de la versión 2 cuenta, para el
   * reloj y el tope de T, desde el primer evento de la versión 3 (acotarAltaV2).
   */
  #contextoCiclo(ev) {
    const primeroV3 = () => (this.orden.length > this.eventosV2 ? this.obtener(this.orden[this.eventosV2]).t : ev.t);
    return {
      // B1: true, false (una cosa) o null (sin alta: si escribe, escribe su propia alta).
      persona: (id) => this.esPersona(id),
      // Las reglas de la versión 2 (suelo de persistencia) leen el tipo que se declaraba entonces.
      tipo: (id) => this.tipoV2(id),
      alta: (id) => {
        const a = this.alta(id);
        return a && this.#prefijoV2.has(a.id) ? acotarAltaV2(a, primeroV3()) : a;
      },
      tMaximo: () => this.#tMax,
      gastadoT: (id, escala, periodo) => this.gastadoT(id, escala, periodo),
      serie: (k) => this.#serieCruda(k),
      registro: (id) => this.eventos.get(id),
      saldo: (id, k) => this.saldo(id, k),
      reglas: this.orden.length < this.eventosV2 ? 2 : 3,
      genesisId: this.genesisId,
    };
  }

  /** Lo que leen las reglas del tope (reglasDelTope): el eje de antes del evento. */
  #contextoTope() {
    const hilos = new Map();
    const hiloDe = (id) => {
      if (!hilos.has(id)) hilos.set(id, new Set(this.hilo(id).map((e) => e.id)));
      return hilos.get(id);
    };
    return {
      reglas: this.orden.length < this.eventosV2 ? 2 : 3,
      tMaximo: (excluidos) => this.tMaximo(excluidos ?? []),
      registro: (id) => this.eventos.get(id),
      alta: (id) => this.alta(id),
      serie: (k) => this.#serieCruda(k),
      seriesE: () => [...this.#series.keys()].filter((k) => k.startsWith('E:')).map((k) => [k, this.#serieCruda(k)]),
      topes: (registro) => this.#topesDe(registro),
      dentro: (registro, ancestro) => Boolean(registro) && this.eventos.has(registro) && hiloDe(registro).has(ancestro),
      bloqueado: (id, k, salida) => this.bloqueado(id, k, salida),
      bloqueadoP: (id, salida) => this.bloqueos(id).filter((b) => b.token === 'P' && b.salida === salida).reduce((s, b) => s + b.cantidad, 0),
      bloqueosP: () => this.identidades().flatMap((id) => this.bloqueos(id).filter((b) => b.token === 'P').map((b) => ({ titular: id, clave: b.clave, salida: b.salida, cantidad: b.cantidad }))),
    };
  }

  /**
   * Añade un evento válido y aplica sus movimientos. Lanza si no es admisible.
   * Guarda y devuelve su copia normalizada y congelada, no el objeto recibido.
   * Es una transacción del libro con las condiciones de siempre: entera o nada.
   * El error del rechazo lleva `motivos` (la lista de eje.motivos) y, si alguno se paró por un límite de cálculo,
   * `code: 'limit_exhausted'` (#100); su mensaje, el de siempre.
   * Un miembro de una tanda (con `contexto.tanda`) no entra por aquí: solo con su tanda entera, por eje.anadirTanda.
   */
  async anadir(crudo) {
    const ev = copiaGuardable(crudo);
    if (esMiembroDeTanda(ev)) throw rechazo('evento rechazado: ' + MIEMBRO_SUELTO, formados([MIEMBRO_SUELTO]));
    return this.#anadir(ev);
  }

  /** eje.anadir sin mirar la marca de tanda (la tanda ya se ha comprobado entera): `ev`, la copia guardable. */
  async #anadir(copia) {
    const ev = this.#comoFirmado(copia);
    if (esRegistroDeEpoca(ev)) {
      const errores = await this.#erroresDeEpoca(ev);
      if (errores.length) throw rechazo('registro de la época rechazado: ' + errores.join('; '), formados(errores));
      this.#aplicar(ev);
      return ev;
    }
    if (this.#escritura && !this.#epoca) throw rechazo('evento rechazado: ' + this.#faltaEpoca(), formados([this.#faltaEpoca()]));
    const tx = this.transaccion(ev);
    const { motivos, simulacion } = await this.#libro.probar(tx, condicionesDe(this.#epocaVigente()), this.contexto(ev));
    // El núcleo como motor de versiones (A23): un cambio que no vale al proponerlo o al ponerlo en vigor se rechaza aquí.
    const motor = this.#motor(ev);
    if (motivos.length || motor.motivos.length) {
      const lista = [...motivosDeTx(ev, motivos), ...delMotor(motor.motivos)];
      const errores = lista.map((m) => m.texto);
      // Si todos los motivos callan aquí (el gasto del T del día lo dice TT-4), el texto crudo de cada uno, como siempre.
      throw rechazo('evento rechazado: ' + (errores.length ? errores : motivos.map((m) => m.texto)).join('; '), lista.length ? lista : motivosDeTx(ev, motivos, true));
    }
    this.#aplicar(ev, tx, simulacion, motor); // la copia de copiaGuardable ya está congelada entera: lo guardado no se modifica en sitio
    return ev;
  }

  /** El motivo con que se rechaza un registro mientras la época escrita no está entera en el libro. */
  #faltaEpoca() {
    const x = this.#escritura;
    return 'la época del eje (' + x.id.slice(0, 8) + ') no está entera en el libro (' + x.eventos.length + ' de ' + x.esperados + ' registros): sus registros van justo detrás del génesis, antes que nada (#107)';
  }

  /**
   * Por qué no entra un registro de la época (VG, 14-11, #107), o [] si entra: es parte de la apertura del génesis que
   * escribe su época (contexto.epocaEscrita: cuántos), justo detrás de él y en orden, de su autor (firmado con su clave
   * si la declaró), anclado en él, en su mismo instante, sin mover nada; el primero es la raíz, cuyo id es el que el
   * génesis referencia; el último completa la época, que ha de cargarse y resolverse (si no, se dice por qué).
   */
  async #erroresDeEpoca(ev) {
    const errores = validarForma(ev);
    const g = this.eventos.get(this.genesisId);
    if (!g) return [...errores, 'un registro de la época va detrás de su génesis'];
    const x = this.#escritura;
    if (!x) return [...errores, 'el génesis de este eje no escribe su época (la referencia: ' + String(g.contexto?.epoca).slice(0, 8) + '): no se le añaden registros de época'];
    if (x.eventos.length >= x.esperados) errores.push('la época del eje ya está entera: no se le añaden registros');
    if (this.orden.length !== 1 + x.eventos.length) errores.push('los registros de la época van justo detrás del génesis, antes que nada (una sola apertura)');
    if (ev.contexto?.epoca !== x.id) errores.push('el registro es de la época ' + String(ev.contexto?.epoca).slice(0, 8) + ' y el génesis referencia la ' + x.id.slice(0, 8));
    if (ev.autor !== g.autor) errores.push('la época la escribe el autor del génesis');
    if (ev.sobre !== g.id || (ev.en ?? RAIZ) !== RAIZ) errores.push('un registro de la época se ancla en el génesis, en su raíz');
    if (ev.t !== g.t) errores.push('un registro de la época lleva el instante del génesis (una sola apertura)');
    if (this.eventos.has(ev.id)) errores.push('evento ya registrado');
    if (typeof ev.id !== 'string' || !(await verificarId(ev))) errores.push('id no corresponde al cuerpo');
    const clave = this.claves.get(g.autor);
    if (clave) {
      if (!ev.firma || ev.firmante !== g.autor) errores.push('un registro de la época va firmado por el autor del génesis, con su clave');
      else if (!(await verificar(ev, clave))) errores.push('firma inválida de ' + g.autor);
    } else if (this.exigirFirmas) errores.push('autor sin clave: ' + g.autor);
    if (errores.length) return errores;
    const idPayload = idDeRegistro(ev.payload);
    // Los cambios (tramo 4, la época por referencia): detrás de la época de nacimiento, cada uno su raíz y sus registros,
    // en orden (1, 2…, sin saltos); su contexto dice a qué cambio pertenece y, el primero, que es su raíz.
    const cambio = ev.contexto?.cambio;
    const raizDelCambio = ev.contexto?.raizDelCambio;
    if (cambio !== undefined && !(Number.isSafeInteger(cambio) && cambio >= 1)) return ['un registro de un cambio dice en su contexto el número del cambio (1, 2…): «' + String(cambio) + '» no lo es'];
    if (raizDelCambio !== undefined && (raizDelCambio !== true || cambio === undefined)) return ['solo la raíz de un cambio lo dice en su contexto (raizDelCambio: true)'];
    const k = cambio ?? 0;
    // Si el primero es ya de un cambio, el libro nació con la época del código que nombra el génesis (no la escribe).
    if (x.eventos.length === 0 && k === 0 && idPayload !== x.id) return ['la raíz de la época (' + idPayload.slice(0, 8) + ') no casa con el id que referencia el génesis (' + x.id.slice(0, 8) + ')'];
    const ultimo = x.eventos.length ? x.eventos[x.eventos.length - 1].contexto?.cambio ?? 0 : 0;
    if (k < ultimo) return ['los cambios van en orden: tras un registro del cambio ' + ultimo + ' no va uno ' + (k ? 'del cambio ' + k : 'de la época de nacimiento')];
    if (k > ultimo + 1) return ['los cambios van en orden y sin saltos: tras ' + (ultimo ? 'el cambio ' + ultimo : 'la época de nacimiento') + ' va el cambio ' + (ultimo + 1) + ', no el ' + k];
    if (k === ultimo + 1 && raizDelCambio !== true) return ['el primer registro del cambio ' + k + ' es su raíz (raizDelCambio: true en su contexto)'];
    if (k === ultimo && raizDelCambio === true) return ['el cambio ' + k + ' ya tiene su raíz: sus demás registros no la dicen'];
    const contenido = k ? k + ':' + idPayload : idPayload;
    if (x.contenidos.has(contenido)) return ['registro de la época repetido: ' + idPayload.slice(0, 8)];
    if (x.eventos.length + 1 === x.esperados) {
      try {
        resolverEscrita(escritaDeRegistros([...x.eventos, ev], x.id));
      } catch (err) {
        return ['la época escrita no se carga: ' + err.message];
      }
    }
    return [];
  }

  /**
   * ¿Rige aquí «sin clave no se actúa» (R9)? Sí, salvo en un eje de
   * demostración y en los eventos del prefijo de la versión 2, que se validan
   * con las reglas de entonces.
   */
  #exigeClave() {
    return !this.demostracion && this.orden.length >= this.eventosV2;
  }

  /**
   * Crea, valida y añade en un paso. Con `privada`, firma antes de añadir.
   * `posesion` ({ identidad: privada }) añade la prueba de posesión de cada
   * clave que el evento declara en su contexto (R9): la clave nueva firma el id.
   * Cada privada puede ser un firmante ({ canonico, id }) → firma | { id, firma } (src/autoridad.js): su firma se
   * comprueba (la del autor, con su clave en el eje o la que declara su alta; la de posesión, con la declarada) y, si
   * no vale o el firmante rechaza, lanza antes de añadir: nada entra en el libro.
   */
  async escribir(datos, privada, posesion = {}) {
    let ev = await crearEvento(datos);
    for (const [id, priv] of Object.entries(posesion)) ev = await firmarPosesion(ev, id, priv);
    if (privada) ev = await firmar(ev, privada, undefined, { publica: this.clave(ev.autor) });
    return this.anadir(ev);
  }

  /**
   * Invitar (VG, 9-11, mapa §16 [D] «El árbol mínimo es la invitación»; encargo 3b): `autor` escribe la invitación
   * de `invitado`, una transacción suya anclada en el 3 de su alta, cuyo payload es la décupla de la invitación:
   *   0 «invitation»; 1 lo que te doy (mínimo mi R: te permite escribirme); 2 las reglas, la referencia a la época del eje (eje.epoca());
   *   3 yo (3.0), tú (3.1), el grupo común si lo hay (3.2) y tu clave (3.5); 4 aceptar: tu primera transacción
   *   firmada, tu alta; 5 el dominio al que te invito; 6 mi hilo (mi alta); 7 hasta cuándo vale; 8 el grupo de mi
   *   atención que te asigno (su zona); 9 el tema y el tutorial.
   * Lo que da (`da`: movimientos sin de ni a, por omisión una unidad de su R) lo bloquea con la salida = `invitado`:
   * quien acepta lo recoge en su alta (la salida nombra a quien lo recibe). Su R, si no la tiene, la acuña antes en la
   * misma transacción (emitir R exige T real: quema un minuto). `clave` es la clave pública del invitado (hex): si
   * va, solo vale una aceptación declarada y firmada con ella, y la invitación la declara también en `contexto.claves` (el
   * invitador responde por ella, sin prueba de posesión: el invitado aún no puede firmar; no da alta, H13: docs/CONTRATO.md
   * §15.2 bis) para que el servidor, que resuelve la clave de un autor por un evento anterior que la declare, acepte su alta. Devuelve la invitación.
   */
  async invitar({ autor, invitado, clave, da = [{ token: 'R', cantidad: 1 }], grupo = 0, dominio, comun, hasta, tema, t, privada } = {}) {
    const alta = this.alta(autor);
    if (!alta) throw new Error('invitar: ' + autor + ' no tiene alta');
    if (typeof invitado !== 'string' || !invitado || this.alta(invitado)) throw new Error('invitar: el invitado es una identidad nueva, sin alta: ' + invitado);
    const movimientos = [null]; // la quema del coste de escribir (VG 12-11, #64 b), cuando ya está el payload
    const acunada = new Map();
    for (const d of da) {
      const m = { ...d, ...(d.token === 'E' || d.token === 'R' ? { emisor: d.emisor ?? autor } : {}) };
      if (m.token === 'R' && m.emisor === autor) {
        const falta = m.cantidad - Math.max(0, this.saldo(autor, 'R:' + autor) - (acunada.get('usada') ?? 0));
        if (falta > 0) movimientos.push({ token: 'R', emisor: autor, cantidad: falta, de: null, a: autor });
        acunada.set('usada', (acunada.get('usada') ?? 0) + m.cantidad);
      }
      movimientos.push({ ...m, de: autor, a: autor, estado: 'bloqueo', salida: invitado });
    }
    const x = typeof clave === 'string' && clave ? clave : null;
    const tres = [[autor], [invitado], ...(comun || x ? [comun ? [{ ref: comun }] : ['sin grupo común']] : []), ...(x ? [['yo y tú'], ['te invito'], [x]] : [])];
    const payload = [
      ['invitation'],
      da.length ? da.map((d) => d.cantidad + ' ' + (d.token === 'R' || d.token === 'E' ? d.token + ':' + (d.emisor ?? autor) + (d.denominacion ? '/' + d.denominacion : '') : d.token === 'P' ? claveToken({ ...d, de: autor }) : d.token + ':' + d.ambito)) : ['nada'],
      [{ ref: this.epoca().id }],
      tres,
      ['tu primera transacción firmada, anclada sobre esta invitación: tu alta'],
      [{ ref: dominio ?? alta.id }],
      [{ ref: alta.id }],
      [hasta ?? 'sin plazo'],
      [grupo],
      [tema ?? 'invitación de ' + autor],
    ];
    movimientos[0] = quemaDelCoste(autor, payload, 'minuto', { eje: this });
    return this.escribir({ autor, sobre: alta.id, en: '3000000000', t, movimientos, payload, ...(x ? { contexto: { claves: { [invitado]: x } } } : {}) }, privada);
  }

  /**
   * Aceptar una invitación (mapa §16 [D]: «4 aceptar = tu primera transacción firmada = tu alta»; encargo 3b): la
   * primera transacción de la persona nueva, anclada sobre la invitación y firmada con su clave (`clave`: { publica,
   * privada }, o nada en un eje de demostración; `privada` puede ser un firmante, cuya firma se comprueba con `publica`). Recoge lo que la invitación le guarda (lo que quien invita bloqueó
   * con la salida = ella) y quema un minuto de su día. Es su alta: la escribe ella, así que es una persona (B1).
   * Sustituye a `entrar` (el alta propia abierta): sin invitación solo entra la primera identidad, la del génesis.
   */
  async aceptar(invitacion, clave = {}, { t, payload } = {}) {
    const inv = this.obtener(typeof invitacion === 'string' ? invitacion : invitacion?.id);
    if (!inv) throw new Error('aceptar: la invitación no está en el eje');
    const hoja = (x) => (Array.isArray(x) ? x[0] : x);
    const quien = hoja(inv.payload?.[3]?.[1]);
    if (typeof quien !== 'string') throw new Error('aceptar: la invitación no nombra a quién invita (su 3.1)');
    const regalos = this.bloqueos(inv.autor).filter((b) => b.salida === quien);
    const cuerpo = payload ?? ['Alta de ' + quien];
    const movimientos = [
      quemaDelCoste(quien, cuerpo, 'minuto', { eje: this }),
      ...regalos.map((b) => {
        const { token, emisor, denominacion, registro, ambito, origen } = b;
        return { token, ...(emisor ? { emisor } : {}), ...(denominacion ? { denominacion } : {}), ...(registro ? { registro } : {}), ...(ambito ? { ambito } : {}), ...(origen ? { origen } : {}), cantidad: b.cantidad, de: inv.autor, a: quien, salida: quien };
      }),
    ];
    return this.escribir({
      autor: quien,
      sobre: inv.id,
      t: t ?? inv.t,
      movimientos,
      payload: cuerpo,
      contexto: clave?.publica ? { claves: { [quien]: clave.publica } } : {},
    }, clave?.privada);
  }

  /** Hilo: desde el evento hasta el génesis siguiendo la referencia sobre. */
  hilo(id) {
    const cadena = [];
    let ev = this.eventos.get(id);
    while (ev) {
      cadena.push(ev);
      ev = ev.sobre === null ? undefined : this.eventos.get(ev.sobre);
    }
    return cadena;
  }

  /** Eventos escritos sobre un registro (sus hijos directos), opcionalmente solo en una posición. */
  sobre(id, en) {
    if (en === undefined) return this.hijos.get(id)?.slice() ?? [];
    // Lo mismo que filtrar los hijos por `e.en === en`, sin recorrerlos (docs/notas/RENDIMIENTO.md).
    return this.#hijosEn.get(id)?.get(en)?.slice() ?? [];
  }

  /**
   * Escritos anclados en (`id`, `en`) cuyos autores están en `autores` (un
   * Set), en orden de entrada: lo mismo que filtrar `sobre(id, en)` por autor,
   * sin recorrer lo de los demás (R8: el ruido ajeno no cuesta al dueño).
   */
  sobreDe(id, en, autores) {
    const porAutor = this.#porAutor.get(id)?.get(en);
    if (!porAutor) return [];
    const listas = [...autores].map((a) => porAutor.get(a)).filter(Boolean);
    if (listas.length === 1) return listas[0].slice();
    return listas.flat().sort((a, b) => this.#llegada.get(a.id) - this.#llegada.get(b.id));
  }

  /** Cuántos escritos hay anclados en (`id`, `en`), sin copiarlos. */
  cuantosSobre(id, en) {
    return this.#hijosEn.get(id)?.get(en)?.length ?? 0;
  }

  /**
   * Aplica un evento ya validado: asienta su transacción en el libro (la de
   * probar, `simulacion`, si es la de este momento) y lleva los índices del
   * eje (lo escrito sobre cada registro, por autor, por prefijo; el reloj; las
   * claves y los tipos; qué series existen y su contrato).
   */
  #aplicar(ev, tx = this.transaccion(ev), simulacion = undefined, motor = undefined) {
    // Demostración: solo la bandera firmada del génesis (SEG-02, revisión de main 7-11 noche). Un eje que viene
    // de la versión 2 no es de demostración por serlo: la exención de clave vale solo dentro de su prefijo
    // (#exigeClave), no para lo que se le añade después.
    if (ev.contexto?.genesis === true) {
      this.demostracion = ev.contexto.demostracion === true;
      // La época del eje (#107): si el génesis la escribe, se espera tras él; si no, la que referencia si el código la conoce, o la 0.
      const n = ev.contexto.epocaEscrita;
      if (Number.isSafeInteger(n) && n > 0 && typeof ev.contexto.epoca === 'string') this.#escritura = { id: ev.contexto.epoca, esperados: n, eventos: [], contenidos: new Set() };
      else this.#epoca = EPOCAS_POR_ID.get(ev.contexto.epoca) ?? EPOCA_0_BTML;
    }
    if (esRegistroDeEpoca(ev)) {
      // Un registro de la época está en el libro (se guarda, se sincroniza) pero no es un hijo del génesis ni mueve nada.
      this.#llegada.set(ev.id, this.orden.length);
      this.eventos.set(ev.id, ev);
      this.orden.push(ev.id);
      if (this.orden.length <= this.eventosV2) this.#prefijoV2.add(ev.id);
      this.#deLaEpoca.add(ev.id);
      const x = this.#escritura;
      if (x) {
        x.eventos.push(ev);
        const k = ev.contexto?.cambio ?? 0;
        x.contenidos.add(k ? k + ':' + idDeRegistro(ev.payload) : idDeRegistro(ev.payload));
        if (x.eventos.length === x.esperados) this.#epoca = resolverEscrita(escritaDeRegistros(x.eventos, x.id));
      }
      return;
    }
    // La asignación diaria de T (VG, 8-11) rige fuera del prefijo de la versión 2, para una persona (B1): quien
    // escribió su alta, o quien la escribe ahora. Se mira antes de asentar: después ya tiene cuenta.
    const reglas3 = this.orden.length >= this.eventosV2;
    const conAsignacion = reglas3 && this.#escribePersona(ev);
    // La entrada en vigor de un cambio (A23) se mira con el eje de antes del registro: la que ya resolvió anadir o, al
    // reaplicar lo ya validado (eje.antes), otra vez aquí (fundir es una lectura con memoria: src/versiones.js).
    const entrada = (motor ?? (dice(ev, PONER_EN_VIGOR) ? this.#motor(ev) : SIN_MOTOR)).entrada;
    const asientos = this.#libro.asentar(tx, simulacion);
    this.#llegada.set(ev.id, this.orden.length);
    this.eventos.set(ev.id, ev);
    this.orden.push(ev.id);
    if (this.orden.length <= this.eventosV2) this.#prefijoV2.add(ev.id);
    const ms = msDeGuardado(ev.t);
    if (ms > this.#tMax) this.#tMax = ms;
    if (ms > (this.#tPorAutor.get(ev.autor) ?? -Infinity)) this.#tPorAutor.set(ev.autor, ms);
    const cabeza = ev.id.slice(0, PREFIJO);
    if (!this.#prefijos.has(cabeza)) this.#prefijos.set(cabeza, []);
    this.#prefijos.get(cabeza).push(ev.id);
    if (ev.sobre !== null) {
      if (!this.hijos.has(ev.sobre)) this.hijos.set(ev.sobre, []);
      this.hijos.get(ev.sobre).push(ev);
      if (!this.#hijosEn.has(ev.sobre)) this.#hijosEn.set(ev.sobre, new Map());
      const porEn = this.#hijosEn.get(ev.sobre);
      if (!porEn.has(ev.en)) porEn.set(ev.en, []);
      porEn.get(ev.en).push(ev);
      // El índice por autor (R8, sobreDe): id → en → autor → eventos.
      if (!this.#porAutor.has(ev.sobre)) this.#porAutor.set(ev.sobre, new Map());
      const enDe = this.#porAutor.get(ev.sobre);
      if (!enDe.has(ev.en)) enDe.set(ev.en, new Map());
      const deAutor = enDe.get(ev.en);
      if (!deAutor.has(ev.autor)) deAutor.set(ev.autor, []);
      deAutor.get(ev.autor).push(ev);
    }
    for (const [id, clave] of Object.entries(ev.contexto?.claves ?? {})) this.claves.set(id, clave);
    // Los tipos solo se leen en el prefijo de la versión 2 (suelo de persistencia); fuera no hay tipo (B1).
    if (!reglas3) for (const [id, tipo] of Object.entries(ev.contexto?.tipos ?? {})) this.#tiposV2.set(id, tipo);
    // Qué series existen, en orden de aparición, con su emisor y su contrato (las cantidades son del libro). Una
    // serie aparece con su primera emisión; una de T, también con su primer consumo o con la primera asignación que
    // sale de las manos de su persona.
    const deAsignacion = (i) => asientos.some((a) => a.paso === i && a.primitiva === 'acunar' && a.clase === ASIGNACION && a.cantidad > 0);
    const registrar = (k, emisor, contrato) => {
      if (!this.#series.has(k)) this.#series.set(k, { emisor, ...(contrato ? { contrato } : {}) });
    };
    ev.movimientos.forEach((m, i) => {
      if (m.estado === 'bloqueo' || m.estado === 'liberacion' || esAnunciado(m)) return;
      const k = claveToken(m);
      if (m.de === null) {
        const emisor = m.token === 'E' || m.token === 'R' ? m.emisor : ev.autor;
        if (m.token !== 'E') return registrar(k, emisor);
        const { consumido: _consumido, ...contrato } = contratoE(m, this.alta(m.emisor)?.id);
        return registrar(k, emisor, contrato);
      }
      if (m.token !== 'T') return undefined;
      if (reglas3 && esInformativoT(m)) return registrar(k, ev.autor);
      if ((conAsignacion && gastaAsignacion(m, ev.autor, true)) || esConsumoT(m, ev.autor)) {
        if (m.a === null || deAsignacion(i)) registrar(k, ev.autor);
      }
      return undefined;
    });
    // El P obtenido (encargo 3b: lo que acuñan las reglas que escriben) también abre su serie, a nombre de su origen; y
    // lo que viene de cada serie de E o R se apunta para el tope por serie (VG, tras 3b-bis).
    for (const a of asientos) {
      if (a.clase !== OBTENCION || a.primitiva !== 'acunar') continue;
      registrar(a.serie, a.a);
      for (const [serie, cantidad] of a.origen?.series ?? []) {
        const k = L2(a.etiqueta, serie);
        this.#obtenidoDeSerie.set(k, (this.#obtenidoDeSerie.get(k) ?? 0) + cantidad);
      }
    }
    // Una versión nueva de la época (A23): rige desde el registro siguiente; este se juzgó con la anterior.
    if (entrada?.version && !this.#enVigor.has(entrada.propuesta)) {
      this.#versiones.push({ epoca: entrada.version, anterior: this.#epoca, registro: ev.id, propuesta: entrada.propuesta, posicion: this.orden.length });
      this.#enVigor.set(entrada.propuesta, ev.id);
      this.#epoca = entrada.version;
    }
  }

}

/**
 * Los motivos de una transacción del eje, en orden, con forma (#100, eje.motivos): [{ texto, regla, estado, causa }].
 * Los textos: los de las condiciones tal cual y los fallos de la aritmética del libro con el texto de siempre (el del
 * movimiento que falla). El gasto de la asignación del día que no alcanza no tiene texto aquí: lo dice TT-4 («T del
 * día agotado»). `crudos`: el texto de cada motivo tal cual, sin callar ninguno (el respaldo del error de anadir).
 */
function motivosDeTx(ev, motivos, crudos = false) {
  return motivos
    .map((m) => conForma({
      texto: m.fallo && !crudos ? textoDeFallo(ev, m.fallo) : m.texto,
      regla: typeof m.condicion === 'string' ? m.condicion : null,
      estado: m.estado === 'pendiente' ? 'pendiente' : 'falla',
      causa: m.causa === CAUSA_LIMITE ? CAUSA_LIMITE : null,
    }, m.fallo && !crudos ? claveDeFallo(ev, m.fallo) : {}))
    .filter((m) => m.texto !== null);
}

/** Textos sueltos (la forma, la época escrita) como motivos de eje.motivos: fallan, sin regla ni causa. */
const formados = (errores) => errores.map((texto) => ({ texto, regla: null, estado: 'falla', causa: null }));

/** El nombre con que eje.motivos firma lo que rechaza el motor de versiones (A23, src/versiones.js). */
export const REGLA_DEL_MOTOR = 'núcleo:versiones';
/** Los textos del motor de versiones como motivos de eje.motivos: fallan, con la regla REGLA_DEL_MOTOR. */
const delMotor = (textos) => textos.map((texto) => ({ texto, regla: REGLA_DEL_MOTOR, estado: 'falla', causa: null }));
/** Lo que dice el motor de versiones de un registro que no es un cambio de reglas: nada. */
const SIN_MOTOR = Object.freeze({ motivos: Object.freeze([]), entrada: null });

/** Por qué no entra un miembro de tanda suelto (CONTRATO_TANDA: un miembro nunca entra suelto). */
const MIEMBRO_SUELTO = 'un miembro de una tanda (contexto.tanda) no entra suelto: solo con su tanda entera (eje.anadirTanda)';

/** La firma de mentira de una vista en seco (eje.vistaTanda): no es hexadecimal, así que no verifica con ninguna clave. */
const FIRMA_EN_SECO = 'sin firmar: prueba en seco de la bandeja';

/** El id de un registro, o null. */
const idDe = (ev) => (ev && typeof ev === 'object' && typeof ev.id === 'string' ? ev.id : null);

/** El motivo de eje.anadirTanda cuando la tanda entera ya está en el libro (CONTRATO_TANDA, precisión 11). */
export const TANDA_YA_REGISTRADA = 'tanda ya registrada';

/**
 * El motivo, uno para todos sus miembros, con que se rechaza entera una tanda al rehacer o al bajar un libro (reordenar,
 * desde, src/sincronia.js): `parte`, la de partirTandas; `r`, lo que dio su validación ({ indice, motivos }; sin él,
 * los errores de la parte).
 */
export function motivoDeTanda(parte, r = {}) {
  const quien = parte?.tanda ? 'la tanda ' + parte.tanda.slice(0, 8) : 'un miembro de tanda';
  if (parte?.errores?.length) return quien + ' se rechaza entera: ' + parte.errores.join('; ');
  const textos = (r.motivos ?? []).map((m) => (typeof m === 'string' ? m : m?.texto)).join('; ');
  if (!Number.isInteger(r.indice)) return quien + ' se rechaza entera: ' + textos;
  return quien + ' se rechaza entera: el miembro ' + (r.indice + 1) + ' no pasa: ' + textos;
}

/** El error de un rechazo (#100): su mensaje, de siempre; `motivos`, con forma; `code`, la causa si es por límite. */
function rechazo(mensaje, motivos) {
  const e = new Error(mensaje);
  e.motivos = motivos;
  if (motivos.some((m) => m.causa === CAUSA_LIMITE)) e.code = CAUSA_LIMITE;
  return e;
}

/**
 * Un motivo con su forma para decirlo en el idioma de quien lee (contrato.motivoEnLlano): `que` y `partes` como propiedades
 * que no se enumeran, así que la forma pública de un motivo ({ texto, regla, estado, causa }) no cambia: ni en JSON (lo que
 * viaja, test/vectores/tanda-de-tres.json) ni al compararla.
 */
function conForma(motivo, { que, partes } = {}) {
  if (typeof que === 'string') Object.defineProperties(motivo, { que: { value: que }, partes: { value: Object.freeze({ ...partes }) } });
  return motivo;
}

/**
 * Lo mismo que textoDeFallo, con forma (Core AGRAM 19-11): { que, partes }, la clave «reason <que>» de los textos (en la
 * época o, mientras no esté, en datos/provisional/textos/) y sus valores en crudo (la serie, el titular, la salida), que
 * pone en llano contrato.motivoEnLlano. {} donde textoDeFallo calla.
 */
function claveDeFallo(ev, fallo) {
  const m = ev.movimientos[fallo.paso];
  const k = claveToken(m);
  if (fallo.falta === 'finito') return { que: 'series does not admit so much', partes: { series: k } };
  if (m.estado === 'bloqueo') return { que: 'insufficient available to lock', partes: { series: k, holder: m.de } };
  if (m.estado === 'liberacion' || (m.salida !== undefined && m.estado === undefined)) return { que: 'nothing locked with that exit', partes: { amount: m.cantidad, series: k, holder: m.de, exit: m.salida } };
  if (m.token === 'P') return { que: origenDe(m) === m.de ? 'insufficient P' : 'insufficient P of origin', partes: { scope: m.ambito === AMBITO_GENESIS ? null : m.ambito, origin: origenDe(m), holder: m.de } };
  if (fallo.grupo.some((x) => x.primitiva === 'acunar' && x.clase === ASIGNACION)) return {};
  return { que: 'insufficient balance', partes: { series: k, holder: m.de } };
}

function textoDeFallo(ev, fallo) {
  const m = ev.movimientos[fallo.paso];
  const k = claveToken(m);
  if (fallo.falta === 'finito') return 'la serie ' + k + ' no admite tanto';
  if (m.estado === 'bloqueo') return 'saldo disponible insuficiente para bloquear ' + k + ' en ' + m.de;
  if (m.estado === 'liberacion' || (m.salida !== undefined && m.estado === undefined)) return 'no hay ' + m.cantidad + ' de ' + k + ' bloqueado en ' + m.de + ' con la salida «' + m.salida + '»';
  if (m.token === 'P') return 'saldo insuficiente de P sobre ' + (m.ambito === AMBITO_GENESIS ? 'el eje' : m.ambito.slice(0, 8)) + (origenDe(m) === m.de ? '' : ' de origen ' + origenDe(m)) + ' en ' + m.de;
  if (fallo.grupo.some((x) => x.primitiva === 'acunar' && x.clase === ASIGNACION)) return null; // lo dice TT-4
  return 'saldo insuficiente de ' + k + ' en ' + m.de;
}

/**
 * ¿Ha caducado la serie `clave` en el instante `t`? Solo las series de E
 * pueden llevar caducidad, y la fija su primera emisión. Es un campo del
 * contrato de la serie: nada se ejecuta solo al caducar; BQL o el motor
 * pueden leerlo (VG, 7-11 noche).
 */
export function caducada(eje, clave, t) {
  const caduca = eje.serie(clave).caduca;
  if (!caduca) return false;
  const ahora = segundosUTC(t);
  if (Number.isNaN(ahora)) throw new Error('caducada: t debe ser instante ISO-8601 con zona explícita');
  return ahora >= segundosUTC(caduca); // en segundos (VG, 10-11, C2)
}

/** La copia que guarda el eje (normalizarEvento); lo que no cabe en JSON se rechaza. */
function copiaGuardable(ev) {
  try {
    return normalizarEvento(ev);
  } catch (e) {
    throw new Error('evento rechazado: no cabe en JSON (' + e.message + ')');
  }
}

/**
 * Cuántos niveles del sello en cascada alcanza una prueba copiada (encargo A18: una prueba mejor sustituye a la anterior en
 * eje.marcarSello): los niveles distintos de su cadena (el primer ocupante de cada 9.k.1) por la vía «cascada»; 1 (Bitcoin) por
 * la vía «taproot»; 0 sin décupla. Solo cuenta la forma: si vale lo dicen «sealed» y «firm».
 */
export function nivelesDeSello(decupla) {
  if (!Array.isArray(decupla)) return 0;
  if (decupla[6] !== 'cascada') return 1;
  const cadena = Array.isArray(decupla[9]) ? decupla[9].filter(Array.isArray) : [];
  const niveles = new Set(cadena.map((e) => (Array.isArray(e[1]) ? e[1][0] : e[1])).filter(Number.isSafeInteger));
  return Math.max(1, niveles.size);
}
