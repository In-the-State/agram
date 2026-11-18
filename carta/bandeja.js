// La bandeja (A33; agram-equipo/DISENO_BANDEJA_PV4.md, paso 1; agram-equipo/CONTRATO_TANDA.md, precisión 12): el
// borrador de lo que la persona compone y el único camino para lanzarlo, sin pantalla.
//
// Qué es dato, qué es código y por qué:
//   - El BORRADOR es dato del dispositivo, con la forma del registro que será (acción, sobre qué, valores) y dónde se
//     compuso. No es del libro hasta que se firma: no se sube ni se sincroniza. Se guarda en un almacén que se inyecta
//     ({ leer(clave), guardar(clave, valor) }: en la carta, leerLocal/guardarLocal de carta/cuentas.js) y se lee como
//     dato hostil: uno corrupto, de otra versión o fuera de los topes se ignora entero, sin romper.
//   - Qué acciones hay, qué piden y lo que exige un mensaje antes (la reserva) es dato de la época: aquí solo se lee
//     (acciones.transaccion, carta.antesDelMensaje).
//   - Validar en seco, marcar, firmar y asentar todo o nada es el mecanismo del núcleo (eje.vistaTanda, probarTanda,
//     marcarTanda, anadirTanda, anadir): la bandeja solo lo llama en el orden de la precisión 12.
//   - El RESUMEN de cada entrada es código de la lente y sale SOLO del candidato compuesto (su autor, de qué cuelga,
//     dónde, sus movimientos y su quema de T): nunca de un texto del libro, para que un libro ajeno no pueda enseñar una
//     cosa y hacer firmar otra. Devuelve datos, no texto pintado.
//
// La referencia a otra entrada pendiente es { pendiente: <id local> }, en X o en cualquier sitio de los valores. Al
// componer se cambia por el id del candidato ya compuesto de esa entrada; al marcar la tanda, marcarTanda cambia ese id
// por el definitivo (reescribe los ids enteros).
//
// Varios libros (VG 18-11: «vas añadiendo y se acumula; al ejecutar te exige dos o más ejecuciones sucesivas: primero en
// el libro tal, después en el libro cual»): el BORRADOR COMÚN de una persona (`comun`: su clave pública, o quien mira en
// un ejemplo) es uno y acumula las entradas de todos sus libros; cada entrada sabe de qué libro es (`libro`, el id de su
// génesis) y con qué identidad se compone allí (`cuenta`). crearBandeja con `comun` es la bandeja de UN libro sobre ese
// borrador (lo que se compone, se prueba y se ejecuta allí); probarPorLibros y ejecutarPorLibros recorren el borrador
// entero, un libro tras otro (planDeLibros: en el orden en que aparecen, salvo que uno se apoye en otro). Cada ejecución
// es todo o nada en su libro; entre libros no se promete nada: lo hecho en uno queda hecho aunque el siguiente falle.
// Una entrada que se apoya en lo que escriba otra de otro libro la nombra igual ({ pendiente }); se resuelve con el id
// real cuando su libro ya se ejecutó (y, en la prueba en seco, con el que tendría: se dice).

import * as acciones from '../src/acciones.js';
import * as salida from '../src/escritura.js';
import { tope as topeDelModo, contarPosiciones } from '../src/modos.js';
import { crearEvento, marcarTanda, TANDA_MINIMA, TANDA_MAXIMA, TANDA_TOPES, bytesDeMiembro, bytesDeTanda } from '../src/evento.js';
import { SEGUNDOS } from '../src/tokens.js';
import { antesDelMensaje, horaDeEscribir } from './carta.js';

// ---------- los topes ----------

/** La versión del borrador guardado: otra se ignora. */
export const VERSION_DEL_BORRADOR = 1;
/** Cuántas entradas guarda un borrador como mucho (más que una tanda: se puede componer de más y quitar). */
export const MAXIMO_DE_ENTRADAS = 64;
/** El borrador entero, guardado, en caracteres. */
export const MAXIMO_DEL_BORRADOR = 2 * 1024 * 1024;
/** Los valores de una entrada, en JSON. */
export const MAXIMO_DE_VALORES = 256 * 1024;
/** Lo hondo que pueden anidar los valores. */
export const HONDURA_MAXIMA = 32;
/** Un texto corto del borrador (id local, acción, X). */
const TEXTO_CORTO = 256;
/** Cada registro, marcado y firmado: el tope del núcleo y de la puerta (TANDA_TOPES, CONTRATO_TANDA, precisión 9). */
export const TOPE_POR_REGISTRO = TANDA_TOPES.porMiembro;
/** La tanda entera, marcada y firmada: el del núcleo y de la puerta (TANDA_TOPES). */
export const TOPE_DE_LA_TANDA = TANDA_TOPES.porPeticion;

/** La clave del borrador en el almacén: el libro (id del génesis) y la cuenta. */
export const claveDelBorrador = (libro, cuenta) => 'agram.bandeja.' + libro + '.' + cuenta;
/** La clave del borrador común de una persona (su clave pública, o quien mira en un ejemplo), con las entradas de todos sus libros. */
export const claveDelBorradorComun = (persona) => 'agram.bandeja.comun.' + persona;

// ---------- el borrador ----------

const esObjetoPlano = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const esTextoCorto = (x) => typeof x === 'string' && x.length > 0 && x.length <= TEXTO_CORTO;
const esRefPendiente = (x) => esObjetoPlano(x) && Object.keys(x).length === 1 && esTextoCorto(x.pendiente);

/** ¿Anida `x` dentro de la hondura máxima? (lo que se lee del dispositivo no se recorre sin tope). */
function cabeLaHondura(x, d = 0) {
  if (d > HONDURA_MAXIMA) return false;
  if (Array.isArray(x)) return x.every((v) => cabeLaHondura(v, d + 1));
  if (x !== null && typeof x === 'object') return Object.values(x).every((v) => cabeLaHondura(v, d + 1));
  return true;
}

/** Los ids locales que nombra `x` ({ pendiente }), en profundidad. */
function pendientesEn(x, fuera = new Set()) {
  if (esRefPendiente(x)) fuera.add(x.pendiente);
  else if (Array.isArray(x)) for (const v of x) pendientesEn(v, fuera);
  else if (x !== null && typeof x === 'object') for (const v of Object.values(x)) pendientesEn(v, fuera);
  return fuera;
}

/** De qué entradas depende una entrada: las que nombra en X o en sus valores, sin repetir, en el orden en que salen. */
const dependenciasDe = (e) => [...pendientesEn([e.X, e.valores])];

/** Copia de `x` con cada { pendiente } cambiado por el id compuesto de esa entrada (`ids`: id local → id). */
function resolver(x, ids) {
  if (esRefPendiente(x)) return ids.get(x.pendiente);
  if (Array.isArray(x)) return x.map((v) => resolver(v, ids));
  if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, resolver(v, ids)]));
  return x;
}

/** ¿Es `pv` un punto de vista (0 a 9) o null? */
const esPv = (pv) => pv === null || (Number.isInteger(pv) && pv >= 0 && pv <= 9);

/** Por qué una entrada no vale como dato del borrador, o null si vale. `ids`: los ids locales que existen. */
function fallaDeEntrada(e, ids) {
  if (!esObjetoPlano(e)) return 'la entrada no es un objeto';
  if (!esTextoCorto(e.id)) return 'la entrada no tiene id local';
  if (e.libro !== undefined && !esTextoCorto(e.libro)) return 'el libro de la entrada es el id de su génesis';
  if (e.cuenta !== undefined && !esTextoCorto(e.cuenta)) return 'la cuenta de la entrada es quien la compone en su libro';
  if (e.tipo !== undefined && e.tipo !== 'campo' && e.tipo !== 'registro') return 'una entrada es una acción, un campo o un registro';
  if (e.tipo === 'registro') {
    // Un registro que la lente ya trae hecho (preferencias, ajustes de la guía y de fuera, formato): su payload, escrito
    // desde un modo (sequenced…) en la posición `en` de X, sin acción; lo que escribía escribirDesde.
    if (e.accion !== null) return 'un registro no lleva acción';
    if (!esTextoCorto(e.modo)) return 'un registro dice desde qué modo se escribe';
    if (typeof e.en !== 'string' || !/^[0-9]{10}$/.test(e.en)) return 'un registro dice en qué posición (diez dígitos)';
    if (!esObjetoPlano(e.valores) || !Array.isArray(e.valores.payload) || Object.keys(e.valores).length !== 1) return 'un registro lleva su payload y nada más';
  } else if (e.tipo === 'campo') {
    // Tocar un valor en un campo (A33): un registro «pointed» en la posición `en` de X, sin acción.
    if (e.accion !== null) return 'un campo no lleva acción';
    if (typeof e.en !== 'string' || !/^[0-9]{10}$/.test(e.en)) return 'un campo dice en qué posición (diez dígitos)';
    if (!esObjetoPlano(e.valores) || typeof e.valores.texto !== 'string' || !e.valores.texto.trim() || Object.keys(e.valores).length !== 1) return 'un campo lleva su texto y nada más';
  } else if (!esTextoCorto(e.accion)) return 'falta la acción (su id)';
  if (!(esTextoCorto(e.X) || esRefPendiente(e.X))) return 'falta sobre qué (X): un id o { pendiente }';
  if (!esObjetoPlano(e.valores)) return 'los valores no son un objeto';
  if (!cabeLaHondura(e.valores)) return 'los valores anidan demasiado';
  let json;
  try {
    json = JSON.stringify(e.valores);
  } catch {
    return 'los valores no caben en JSON';
  }
  if (json.length > MAXIMO_DE_VALORES) return 'los valores pasan de ' + MAXIMO_DE_VALORES + ' caracteres';
  if (!esObjetoPlano(e.donde) || !(e.donde.X === null || esTextoCorto(e.donde.X)) || !esPv(e.donde.pv)) return 'dónde se compuso: { X, pv }';
  if (typeof e.completa !== 'boolean') return '«completa» es sí o no';
  if (!Array.isArray(e.de) || e.de.some((d) => !esTextoCorto(d))) return '«de» es la lista de entradas de las que depende';
  const deVerdad = dependenciasDe(e);
  if (deVerdad.length !== e.de.length || deVerdad.some((d, k) => d !== e.de[k])) return '«de» no casa con lo que nombra';
  if (e.de.includes(e.id)) return 'la entrada se nombra a sí misma';
  if (ids && e.de.some((d) => !ids.has(d))) return 'nombra una entrada pendiente que no está en el borrador';
  return null;
}

/** El borrador vacío. */
const vacio = () => ({ v: VERSION_DEL_BORRADOR, siguiente: 1, entradas: [] });

/** Lee el borrador guardado como dato hostil: si algo no cuadra, el vacío (y `ignorado`, por qué). */
function leerBorrador(almacen, clave, { comun = false } = {}) {
  let texto;
  try {
    texto = almacen?.leer?.(clave) ?? null;
  } catch {
    return { ...vacio(), ignorado: 'el almacén no se puede leer' };
  }
  if (texto === null || texto === undefined) return vacio();
  if (typeof texto !== 'string' || texto.length > MAXIMO_DEL_BORRADOR) return { ...vacio(), ignorado: 'el borrador guardado no cabe' };
  let b;
  try {
    b = JSON.parse(texto);
  } catch {
    return { ...vacio(), ignorado: 'el borrador guardado no es JSON' };
  }
  if (!esObjetoPlano(b) || b.v !== VERSION_DEL_BORRADOR) return { ...vacio(), ignorado: 'el borrador guardado es de otra versión' };
  if (!Number.isSafeInteger(b.siguiente) || b.siguiente < 1 || !Array.isArray(b.entradas) || b.entradas.length > MAXIMO_DE_ENTRADAS) {
    return { ...vacio(), ignorado: 'el borrador guardado no tiene la forma de un borrador' };
  }
  const ids = new Set();
  for (const e of b.entradas) {
    if (esObjetoPlano(e) && esTextoCorto(e.id)) {
      if (ids.has(e.id)) return { ...vacio(), ignorado: 'el borrador guardado repite un id local' };
      ids.add(e.id);
    }
  }
  for (const e of b.entradas) {
    const falla = fallaDeEntrada(e, ids) ?? (comun && (e.libro === undefined || e.cuenta === undefined) ? 'en el borrador común cada entrada dice su libro y su cuenta' : null);
    if (falla) return { ...vacio(), ignorado: 'el borrador guardado tiene una entrada que no vale: ' + falla };
  }
  return { v: b.v, siguiente: b.siguiente, entradas: b.entradas.map(limpia) };
}

/** Solo los campos de una entrada (lo demás que trajera, fuera). */
const limpia = (e) => ({ id: e.id, ...(e.libro !== undefined ? { libro: e.libro, cuenta: e.cuenta } : {}), ...(e.tipo === 'campo' ? { tipo: 'campo', en: e.en } : e.tipo === 'registro' ? { tipo: 'registro', en: e.en, modo: e.modo } : {}), accion: e.accion, X: e.X, valores: e.valores, donde: { X: e.donde.X, pv: e.donde.pv }, completa: e.completa, de: [...e.de] });

function guardarBorrador(almacen, clave, b) {
  const texto = JSON.stringify({ v: VERSION_DEL_BORRADOR, siguiente: b.siguiente, entradas: b.entradas.map(limpia) });
  if (texto.length > MAXIMO_DEL_BORRADOR) return false;
  try {
    return almacen?.guardar?.(clave, texto) !== false;
  } catch {
    return false;
  }
}

/** La misma entrada, para «poner»: misma acción, mismo X, compuesta en el mismo sitio (X y punto de vista). */
const mismoSitio = (a, b) => (a.tipo ?? null) === (b.tipo ?? null) && (a.en ?? null) === (b.en ?? null) && (a.modo ?? null) === (b.modo ?? null) && a.accion === b.accion && JSON.stringify(a.X) === JSON.stringify(b.X) && a.donde.X === b.donde.X && a.donde.pv === b.donde.pv;

/** Las entradas en el orden en que se componen: el de composición, con cada una después de las que nombra (estable). */
function enOrden(entradas) {
  const porId = new Map(entradas.map((e) => [e.id, e]));
  const fuera = [];
  const puestas = new Set();
  const enCurso = new Set();
  const circulares = new Set();
  const visitar = (e) => {
    if (puestas.has(e.id)) return;
    if (enCurso.has(e.id)) {
      circulares.add(e.id);
      return;
    }
    enCurso.add(e.id);
    for (const d of e.de) if (porId.has(d)) visitar(porId.get(d));
    enCurso.delete(e.id);
    puestas.add(e.id);
    fuera.push(e);
  };
  for (const e of entradas) visitar(e);
  return { orden: fuera, circulares };
}

/**
 * La bandeja de un libro y una cuenta: su borrador (en `almacen`, { leer(clave) → texto|null, guardar(clave, texto) →
 * bool }) y el camino de lanzarlo. Sin estado propio: cada operación lee el almacén, así que un objeto nuevo sobre el
 * mismo almacén ve lo mismo (recargar). Con `comun` (la persona), el borrador es el común de todos sus libros: esta
 * bandeja lista, pone, prueba y ejecuta las entradas de SU libro, y lo demás del borrador lo deja como estaba; quitar y
 * mover van sobre cualquier entrada del borrador (mover, dentro de su libro).
 */
export function crearBandeja({ almacen, libro, cuenta, comun = null }) {
  if (!esTextoCorto(libro) || !esTextoCorto(cuenta)) throw new Error('crearBandeja: hace falta el libro (id del génesis) y la cuenta');
  if (comun !== null && !esTextoCorto(comun)) throw new Error('crearBandeja: el borrador común es de una persona');
  const clave = comun ? claveDelBorradorComun(comun) : claveDelBorrador(libro, cuenta);
  /** Las entradas de esta bandeja: en el común, las de su libro; si no, todas. */
  const esDeAqui = comun ? (e) => e.libro === libro : () => true;
  /** El borrador entero (en el común, el de todos los libros). */
  const leerTodo = () => leerBorrador(almacen, clave, { comun: Boolean(comun) });
  /** El borrador de esta bandeja: el entero con solo sus entradas. */
  const leer = () => {
    const b = leerTodo();
    return comun ? { ...b, entradas: b.entradas.filter(esDeAqui) } : b;
  };
  const guardar = (b) => guardarBorrador(almacen, clave, b);

  return {
    clave,

    /** Las entradas, en el orden en que se compusieron (copias). `ignorado`: por qué se ignoró lo guardado, si se ignoró. */
    listar() {
      const b = leer();
      return b.ignorado ? { entradas: [], ignorado: b.ignorado } : { entradas: b.entradas.map(limpia) };
    },

    /**
     * Pone o actualiza una entrada: { accion, X, valores, donde: { X, pv }, completa, id?, nueva? }.
     * La regla de actualizar: con `id`, la entrada de ese id (si no existe, no se pone); sin `id`, la primera con la misma
     * acción, el mismo X y compuesta en el mismo sitio (mismo X y mismo punto de vista de `donde`); `nueva: true` pone
     * otra aunque la haya. Actualizar cambia sus valores y si está completa, y la deja en su sitio del orden.
     * → { ok: true, entrada, actualizada } o { ok: false, motivo }.
     */
    poner({ tipo, en, modo, accion = null, X, valores = {}, donde = {}, completa = true, id = null, nueva = false } = {}) {
      const deCampo = tipo === 'campo' ? { tipo, en } : tipo === 'registro' ? { tipo, en, modo } : {};
      const b = leerTodo();
      // En el común, los ids son del borrador entero (una entrada puede nombrar otra de otro libro).
      const ids = new Set(b.entradas.map((e) => e.id));
      const propias = b.entradas.filter(esDeAqui);
      const previa = id !== null ? propias.find((e) => e.id === id) : nueva ? null : propias.find((e) => mismoSitio(e, { ...deCampo, accion, X, donde: { X: donde?.X ?? null, pv: donde?.pv ?? null } }));
      if (id !== null && !previa) return { ok: false, motivo: 'no hay ninguna entrada ' + id + ' en el borrador' };
      if (!previa && b.entradas.length >= MAXIMO_DE_ENTRADAS) return { ok: false, motivo: 'el borrador está lleno: ' + MAXIMO_DE_ENTRADAS + ' entradas' };
      const entrada = { id: previa ? previa.id : 'b' + b.siguiente, ...(comun ? { libro, cuenta } : {}), ...deCampo, accion, X, valores, donde: { X: donde?.X ?? null, pv: donde?.pv ?? null }, completa, de: [] };
      try {
        entrada.de = dependenciasDe(entrada);
      } catch {
        return { ok: false, motivo: 'los valores no se pueden leer' };
      }
      const falla = fallaDeEntrada(entrada, ids);
      if (falla) return { ok: false, motivo: falla };
      // Que no cierre un círculo: lo que la entrada nombra no puede depender, de lejos, de ella.
      const entradas = previa ? b.entradas.map((e) => (e.id === previa.id ? entrada : e)) : [...b.entradas, entrada];
      if (enOrden(entradas).circulares.size) return { ok: false, motivo: 'las entradas se nombrarían unas a otras en círculo' };
      const nuevo = { siguiente: previa ? b.siguiente : b.siguiente + 1, entradas };
      if (!guardar(nuevo)) return { ok: false, motivo: 'no se puede guardar el borrador en este dispositivo' };
      return { ok: true, entrada: limpia(entrada), actualizada: Boolean(previa) };
    },

    /**
     * Quita una entrada y, con ella, las que dependen de ella (de cerca o de lejos; en el común, también las de otros
     * libros). → { ok, quitadas: [ids, la pedida primero], dependientes: [las que se fueron por depender] } o { ok: false,
     * motivo }.
     */
    quitar(id) {
      const b = leerTodo();
      if (!b.entradas.some((e) => e.id === id)) return { ok: false, motivo: 'no hay ninguna entrada ' + id + ' en el borrador', quitadas: [], dependientes: [] };
      const fuera = new Set([id]);
      for (let cambia = true; cambia;) {
        cambia = false;
        for (const e of b.entradas) {
          if (!fuera.has(e.id) && e.de.some((d) => fuera.has(d))) {
            fuera.add(e.id);
            cambia = true;
          }
        }
      }
      const ok = guardar({ siguiente: b.siguiente, entradas: b.entradas.filter((e) => !fuera.has(e.id)) });
      const dependientes = b.entradas.filter((e) => e.id !== id && fuera.has(e.id)).map((e) => e.id);
      return ok ? { ok, quitadas: [id, ...dependientes], dependientes } : { ok, motivo: 'no se puede guardar el borrador en este dispositivo', quitadas: [], dependientes: [] };
    },

    /**
     * Mueve una entrada un puesto antes (delta < 0) o después (delta > 0) en el orden de la tanda de su libro: en un todo o
     * nada el orden cuenta. No pasa por delante de una de la que depende ni por detrás de una que depende de ella (al
     * componer, la que nombra va siempre detrás de la nombrada). → { ok, orden: [ids de su libro] } o { ok: false, porque:
     * 'no-esta' | 'borde' | 'depende' }.
     */
    mover(id, delta) {
      const b = leerTodo();
      const esta = b.entradas.find((e) => e.id === id);
      if (!esta) return { ok: false, porque: 'no-esta' };
      // Los puestos de su libro dentro del borrador entero (en el de un solo libro, todos).
      const puestos = b.entradas.map((e, k) => (e.libro === esta.libro ? k : -1)).filter((k) => k >= 0);
      const p = puestos.indexOf(b.entradas.indexOf(esta));
      const q = p + (delta < 0 ? -1 : 1);
      if (!delta || q < 0 || q >= puestos.length) return { ok: false, porque: 'borde' };
      const [k, j] = [puestos[p], puestos[q]];
      // Tras el cambio, `va` queda delante de `queda`: no puede depender de ella.
      const [va, queda] = delta < 0 ? [b.entradas[k], b.entradas[j]] : [b.entradas[j], b.entradas[k]];
      if (va.de.includes(queda.id)) return { ok: false, porque: 'depende' };
      const entradas = [...b.entradas];
      [entradas[k], entradas[j]] = [entradas[j], entradas[k]];
      if (!guardar({ siguiente: b.siguiente, entradas })) return { ok: false, porque: 'no-se-guarda' };
      return { ok: true, orden: entradas.filter((e) => e.libro === esta.libro).map((e) => e.id) };
    },

    /** Vacía el borrador (en el común, lo de este libro). → bool (si se pudo guardar). */
    vaciar() {
      const b = leerTodo();
      return guardar({ siguiente: b.siguiente, entradas: b.entradas.filter((e) => !esDeAqui(e)) });
    },

    /**
     * Prueba en seco el borrador (componer); no toca el libro ni el borrador. `opciones.resueltas` (id local → id) y
     * `opciones.provisionales` (ids locales): lo ya escrito, o lo que se escribiría, en otros libros (probarPorLibros).
     */
    async probar(eje, yo, opciones = {}) {
      const b = leer();
      const r = await componer(eje, yo, b.entradas, opciones);
      return b.ignorado ? { ...r, ignorado: b.ignorado } : r;
    },

    /**
     * Lanza el borrador, todo o nada (lanzar). Si entra, quita del borrador lo lanzado (lo que no cambió mientras se
     * firmaba: lo que se retocó entretanto se queda, y se dice en `quedan`); lo de otros libros, como estaba.
     */
    async ejecutar(eje, yo, firmar, opciones = {}) {
      const b = leer();
      const r = await lanzar(eje, yo, firmar, b.entradas, opciones);
      if (!r.ok) return r;
      const lanzadas = new Map(b.entradas.map((e) => [e.id, JSON.stringify(limpia(e))]));
      const ahora = leerTodo();
      const quedan = ahora.entradas.filter((e) => lanzadas.has(e.id) && lanzadas.get(e.id) !== JSON.stringify(limpia(e))).map((e) => e.id);
      // Lo que se queda y nombraba algo ya escrito (otra entrada de otro libro, o compuesta mientras se firmaba) pasa a
      // nombrar su id real: la referencia a la entrada se resuelve cuando su libro ya se ha ejecutado.
      const hechas = new Map(Object.entries(r.ids ?? {}).filter(([id]) => lanzadas.has(id) && !quedan.includes(id)));
      const fijar = (x) => {
        if (esRefPendiente(x)) return hechas.get(x.pendiente) ?? x;
        if (Array.isArray(x)) return x.map(fijar);
        if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fijar(v)]));
        return x;
      };
      const restantes = ahora.entradas.filter((e) => !lanzadas.has(e.id) || quedan.includes(e.id)).map((e) => {
        if (!e.de.some((d) => hechas.has(d))) return e;
        const n = { ...e, X: fijar(e.X), valores: fijar(e.valores) };
        return { ...n, de: dependenciasDe(n) };
      });
      const vaciado = guardar({ siguiente: ahora.siguiente, entradas: restantes });
      return { ...r, quedan, vaciado };
    },
  };
}

// ---------- componer en seco ----------

/** Las opciones que pasan a acciones.transaccion: sin lo de la bandeja ni `firmar` (la candidata va SIN firmar). */
function opcionesDeTransaccion(opciones) {
  const { firmar: _f, firmarTanda: _ft, posesion: _p, topeDePropuesta: _tp, revisar: _r, resueltas: _rs, provisionales: _pr, ...resto } = opciones ?? {};
  return resto;
}

/** Las opciones con la hora de escribir sobre `vista` (como conHora de carta/carta.js), si no la traen ya. */
function conHora(vista, o) {
  if (o?.t) return o;
  const t = horaDeEscribir(vista);
  return t ? { ...o, t } : o;
}

const motivo = (mensaje, extra = {}) => ({ regla: null, mensaje, ...extra });
const MOTIVOS = Object.freeze({
  falta: 'falta por rellenar',
  depende: (id) => 'depende de la entrada ' + id + ', que no entra',
  circular: 'se nombra en círculo con otra entrada',
  antes: 'lo que exige antes no entra',
  noEscribe: 'esta acción no escribe ningún registro',
  vacia: 'la bandeja está vacía',
  muchas: (n) => 'no cabe: una tanda lleva como mucho ' + TANDA_MAXIMA + ' registros y esta lleva ' + n,
  grande: (b) => 'no cabe: el registro pasa de ' + TOPE_POR_REGISTRO + ' bytes (' + b + ')',
  tanda: (b) => 'no cabe: la tanda entera pasa de ' + TOPE_DE_LA_TANDA + ' bytes (' + b + ')',
  propuesta: (b, tope) => 'no cabe en la propuesta para la app: ' + b + ' bytes y admite ' + tope,
});

/** La clave de la serie de un movimiento (T:minuto, R:ana, E:casa/EUR, P:<ámbito>/<origen>). */
function serieDe(m) {
  if (m.token === 'T') return 'T:' + m.escala;
  if (m.token === 'E') return 'E:' + m.emisor + '/' + m.denominacion;
  if (m.token === 'R') return 'R:' + m.emisor;
  if (m.token === 'P') return 'P:' + m.ambito + (m.origen ? '/' + m.origen : '');
  return String(m.token);
}

/**
 * El resumen de lo que se va a firmar, sacado SOLO del candidato: qué registro nace (la acción pedida, su autor, de qué
 * cuelga y dónde), qué mueve (de quién, a quién, cuánto, de qué serie) y lo que cuesta (la T de su autor que se quema:
 * lo que va de él a nadie). Datos, no texto.
 */
export function resumenDe(candidato, accion) {
  const movimientos = (Array.isArray(candidato?.movimientos) ? candidato.movimientos : []).map((m) => ({
    token: m.token, serie: serieDe(m), cantidad: m.cantidad, de: m.de ?? null, a: m.a ?? null,
    ...(m.estado ? { estado: m.estado } : {}), ...(m.salida ? { salida: m.salida } : {}),
  }));
  const quema = movimientos.filter((m) => m.token === 'T' && m.de === candidato.autor && m.a === null && !m.estado);
  const segundos = quema.reduce((s, m) => s + (SEGUNDOS[m.serie.slice(2)] ?? 0) * m.cantidad, 0);
  const claves = Object.keys(candidato?.contexto?.claves ?? {});
  return {
    nace: { accion, autor: candidato.autor, sobre: candidato.sobre ?? null, en: candidato.en ?? null, t: candidato.t ?? null },
    movimientos,
    cuesta: { segundos, piezas: quema.map((m) => ({ serie: m.serie, cantidad: m.cantidad })) },
    ...(claves.length ? { claves } : {}),
  };
}

/** Bytes del registro en JSON (UTF-8), con lo que le añadirá la firma. */

/** Las identidades nuevas cuya clave declara el candidato (las de otros: la del autor la prueba su firma). */
const clavesDeOtros = (ev) => Object.keys(ev?.contexto?.claves ?? {}).filter((k) => k !== ev.autor);

/** Rehace las pruebas de posesión de `ev` con `opciones.posesion` (async (evento, identidad) → evento con la prueba). */
async function conPruebas(ev, opciones) {
  let fuera = ev;
  for (const identidad of clavesDeOtros(ev)) fuera = (await opciones.posesion(fuera, identidad)) ?? fuera;
  if (fuera.id !== ev.id) throw new Error('la prueba de posesión cambió el registro');
  return fuera;
}

/**
 * Compone una acción sobre la vista en seco: el candidato SIN firmar (acciones.transaccion), validado viendo lo de
 * antes; si pasa, entra en la vista. → { entra, motivos, candidato, r }.
 */
async function componerUna(vista, yo, accion, X, valores, opciones, { hecho = null } = {}) {
  const o = conHora(vista, opcionesDeTransaccion(opciones));
  // `hecho`: un candidato ya construido (un campo, componerCampo) que solo falta validar y meter en la vista.
  const r = hecho ?? await acciones.transaccion(vista, accion, { X, ...valores }, yo, o);
  if (!r.evento) return { entra: false, motivos: r.ok ? [motivo(MOTIVOS.noEscribe)] : r.motivos ?? [], candidato: null, r };
  let candidato = r.evento;
  let motivos = r.ok ? [] : r.motivos ?? [];
  // Las pruebas de posesión: quien tiene la clave de lo que se da de alta las firma sobre el id del candidato.
  if (clavesDeOtros(candidato).length && typeof opciones.posesion === 'function') {
    try {
      candidato = await conPruebas(candidato, opciones);
      motivos = (await vista.validar(candidato)).map((m) => motivo(m));
    } catch (e) {
      motivos = [motivo(String(e?.message ?? e))];
    }
  }
  if (motivos.length) return { entra: false, motivos, candidato, r };
  try {
    await vista.anadir(candidato);
  } catch (e) {
    return { entra: false, motivos: (e.motivos ?? [{ texto: e.message }]).map((m) => motivo(m.texto ?? m.mensaje ?? String(m))), candidato, r };
  }
  return { entra: true, motivos: [], candidato, r };
}

/**
 * Compone un campo (tocar un valor): el registro «pointed» que escribía escribirDesde (src/escritura.js), sin firmar, con
 * su texto como terminal y la quema del coste de escribir de quien lo escribe, validado sobre la vista y, si pasa, dentro.
 */
async function componerCampo(vista, yo, X, en, texto, opciones) {
  let payload;
  try {
    payload = salida.desdePointed(vista, texto);
  } catch (e) {
    return { entra: false, motivos: [motivo(String(e?.message ?? e))], candidato: null };
  }
  return componerEscrito(vista, yo, X, en, payload, 'pointed', opciones);
}

/**
 * Compone lo que escribía escribirDesde (src/escritura.js, sin celda ni herencia): el payload desde un modo en la posición
 * `en` de X, con la quema del coste de escribir de quien lo escribe y el modo en su contexto; lo que pasa del tope de
 * posiciones del modo no entra. Sin firmar, validado sobre la vista y, si pasa, dentro.
 */
async function componerEscrito(vista, yo, X, en, payload, modo, opciones) {
  let candidato;
  try {
    const posiciones = contarPosiciones(payload);
    if (posiciones < 1) throw new Error('nada que emitir: el registro no tiene ninguna posición con contenido');
    if (posiciones > topeDelModo(modo)) throw new Error(modo + ' emite como mucho ' + topeDelModo(modo) + ' posiciones; este registro tiene ' + posiciones);
    const ms = vista.tMaximo?.();
    const t = opciones.t ?? horaDeEscribir(vista) ?? (Number.isFinite(ms) ? new Date(ms).toISOString().replace('.000Z', 'Z') : new Date().toISOString());
    candidato = await crearEvento({ autor: yo, sobre: X, en, t, movimientos: [salida.quemaDelCoste(yo, payload, 'minuto', { eje: vista })], payload, contexto: { modo } });
  } catch (e) {
    return { entra: false, motivos: [motivo(String(e?.message ?? e))], candidato: null };
  }
  const textos = await vista.validar(candidato);
  return componerUna(vista, yo, null, X, null, opciones, { hecho: { ok: textos.length === 0, evento: candidato, motivos: textos.map((m) => motivo(String(m))) } });
}

/** Lo que le falta por rellenar a una entrada (los parámetros requeridos sin valor ni defecto), si se puede saber. */
function faltanDe(vista, yo, accion, X, valores, opciones) {
  try {
    const e = acciones.ejecucion(vista, accion, { X, ...valores }, yo, opcionesDeTransaccion(opciones));
    return (e.motivos ?? []).filter((m) => m.parametro && valores?.[m.parametro] === undefined).map((m) => m.parametro);
  } catch {
    return [];
  }
}

/**
 * Compone una lista de entradas sobre una vista en seco fresca del libro, en orden, cada una viendo las anteriores; lo
 * que una acción exige antes (la reserva de un mensaje: carta.antesDelMensaje, leída sobre la vista, así que no se
 * duplica si ya está en el libro o la puso antes otra entrada) entra como item propio delante, `puesta: true`.
 * → { ok, items: [{ id (local; null en una puesta), puesta, para?, accion, entra, motivos, faltan?, resumen, candidato,
 * bytes, provisional? }], motivos (los de la bandeja entera: vacía, no cabe), cuesta: { segundos } }.
 * Lo de otros libros (varios libros): `opciones.resueltas` (id local → id; un Map o un objeto) da el id de las entradas de
 * otro libro ya escritas o, en la prueba en seco, el que tendrían; esas últimas van en `opciones.provisionales`, y el
 * item que se apoya en una lleva `provisional` (sus ids locales): se probó con un id que aún no es el suyo.
 */
async function componer(eje, yo, entradas, opciones = {}) {
  // La época del libro, para leer sus acciones (lo que hace conEpoca en src/acciones.js).
  if (!opciones.epoca && typeof eje?.epoca === 'function') opciones = { ...opciones, epoca: eje.epoca() };
  const { vista } = await eje.vistaTanda();
  const { orden, circulares } = enOrden(entradas);
  const items = [];
  const ids = new Map(opciones.resueltas instanceof Map ? opciones.resueltas : Object.entries(opciones.resueltas ?? {})); // id local → id del candidato compuesto (solo las que entran)
  const provisionales = new Set(opciones.provisionales ?? []);
  const nombreDe = (accion) => {
    const p = acciones.plantillaDeTransaccion(accion, opcionesDeTransaccion(opciones));
    return p ? acciones.nombreDeAccion(p) : String(accion);
  };
  const item = (base, c) => ({
    ...base, entra: c.entra, motivos: c.motivos, candidato: c.candidato,
    resumen: c.candidato ? resumenDe(c.candidato, base.accion) : null,
    bytes: 0, // se mide al final (topes), cuando se sabe cuántos van en la tanda
  });
  for (const e of orden) {
    const base = { id: e.id, puesta: false, accion: e.tipo === 'campo' || e.tipo === 'registro' ? null : nombreDe(e.accion), entrada: limpia(e) };
    if (circulares.has(e.id)) {
      items.push(item(base, { entra: false, motivos: [motivo(MOTIVOS.circular)], candidato: null }));
      continue;
    }
    const sinResolver = e.de.find((d) => !ids.has(d));
    const deOtroLibro = e.de.filter((d) => provisionales.has(d));
    if (deOtroLibro.length) base.provisional = deOtroLibro;
    const X = sinResolver ? null : resolver(e.X, ids);
    const valores = sinResolver ? e.valores : resolver(e.valores, ids);
    if (!e.completa) {
      const faltan = sinResolver ? [] : faltanDe(vista, yo, e.accion, X, valores, opciones);
      items.push({ ...item(base, { entra: false, motivos: [motivo(MOTIVOS.falta, { faltan })], candidato: null }), faltan });
      continue;
    }
    if (sinResolver) {
      items.push(item(base, { entra: false, motivos: [motivo(MOTIVOS.depende(sinResolver))], candidato: null }));
      continue;
    }
    // Lo que la lente sabe que falta fuera del libro (opciones.revisar(entrada) → texto o null): un archivo que ya no está en este aparato.
    const fuera = typeof opciones.revisar === 'function' ? opciones.revisar(limpia(e)) : null;
    if (fuera) {
      items.push(item(base, { entra: false, motivos: [motivo(String(fuera))], candidato: null }));
      continue;
    }
    if (e.tipo === 'campo' || e.tipo === 'registro') {
      const c = e.tipo === 'campo' ? await componerCampo(vista, yo, X, e.en, valores.texto, opciones) : await componerEscrito(vista, yo, X, e.en, valores.payload, e.modo, opciones);
      if (c.entra) ids.set(e.id, c.candidato.id);
      items.push(item(base, c));
      continue;
    }
    // Lo que la acción exige antes: entradas propias, delante, con su coste.
    let antes = { registros: [] };
    try {
      antes = await antesDelMensaje(vista, X, e.accion, valores, yo, opcionesDeTransaccion(opciones));
    } catch { /* sin ayuda: el mensaje se compone solo y la regla dirá si le falta algo */ }
    let antesEntra = true;
    for (const reg of antes.registros ?? []) {
      const c = await componerUna(vista, yo, reg.plantilla, reg.X, reg.valores, opciones);
      items.push(item({ id: null, puesta: true, para: e.id, accion: reg.plantilla }, c));
      if (!c.entra) antesEntra = false;
    }
    if (!antesEntra) {
      items.push(item(base, { entra: false, motivos: [motivo(MOTIVOS.antes)], candidato: null }));
      continue;
    }
    const c = await componerUna(vista, yo, e.accion, X, valores, opciones);
    if (c.entra) ids.set(e.id, c.candidato.id);
    items.push(item(base, c));
  }
  const motivos = topes(items.filter((x) => x.candidato).map((x) => x.candidato), items, opciones);
  return {
    ok: items.length > 0 && items.every((x) => x.entra) && motivos.length === 0,
    items, motivos,
    cuesta: { segundos: items.reduce((s, x) => s + (x.resumen?.cuesta.segundos ?? 0), 0) },
  };
}

/**
 * Los topes antes de firmar (CONTRATO_TANDA, precisión 9; DISENO_BANDEJA_PV4, «El 4»): de 1 a 32 registros, cada uno
 * dentro de 256 KiB y todos juntos dentro de 1 MiB; y `opciones.topeDePropuesta` (bytes) si firma la app emparejada.
 * Lo de cada registro va también en su item. → los motivos de la bandeja entera.
 */
function topes(eventos, items, opciones) {
  const motivos = [];
  if (items.length === 0) motivos.push(motivo(MOTIVOS.vacia));
  if (items.length > TANDA_MAXIMA) motivos.push(motivo(MOTIVOS.muchas(items.length)));
  // Se mide como la puerta (src/evento.js bytesDeMiembro, bytesDeTanda): el JSON canónico de cada uno marcado y firmado.
  const n = eventos.length;
  eventos.forEach((ev, k) => {
    const b = bytesDeMiembro(ev, k, n);
    const it = items.find((x) => x.candidato === ev);
    if (it) it.bytes = b;
    if (b > TOPE_POR_REGISTRO) {
      const m = motivo(MOTIVOS.grande(b), { indice: k });
      if (it) {
        it.entra = false;
        it.motivos = [...it.motivos, m];
      } else motivos.push(m);
    }
  });
  const total = n >= TANDA_MINIMA ? bytesDeTanda(eventos) : n === 1 ? bytesDeMiembro(eventos[0], 0, 1) : 0;
  if (n >= TANDA_MINIMA && total > TOPE_DE_LA_TANDA) motivos.push(motivo(MOTIVOS.tanda(total)));
  const tope = opciones?.topeDePropuesta;
  if (Number.isFinite(tope) && tope > 0 && total > tope) motivos.push(motivo(MOTIVOS.propuesta(total, tope)));
  return motivos;
}

// ---------- ejecutar ----------

/**
 * El camino de ejecutar, todo o nada, en el orden de la precisión 12 de CONTRATO_TANDA:
 *   1. recomponer todas las entradas sobre una vista fresca (si alguna no entra o está incompleta, no se lanza nada);
 *   2. una sola: registro suelto; dos o más: marcarTanda;
 *   3. rehacer las pruebas de posesión sobre los ids nuevos (opciones.posesion) y probar en seco otra vez (probarTanda),
 *      con los topes medidos sobre lo marcado;
 *   4. firmar: opciones.firmarTanda (async (eventos) → eventos firmados, un solo diálogo) o `firmar` de uno en uno; nada se
 *      asienta hasta tener TODAS las firmas;
 *   5. asentar: eje.anadir para uno, eje.anadirTanda para varios.
 * Si algo falla, el libro no se ha tocado: { ok: false, fase, motivos, indice?, id?, items? }. Si entra: { ok: true,
 * eventos (los guardados), tanda (id del miembro 1, o null si es suelto), items, ids (id local → id definitivo) }.
 */
async function lanzar(eje, yo, firmar, entradas, opciones = {}) {
  // 1. Recomponer sobre lo fresco.
  const c = await componer(eje, yo, entradas, opciones);
  if (!c.ok) return { ok: false, fase: 'componer', motivos: [...c.motivos, ...c.items.filter((x) => !x.entra).flatMap((x) => x.motivos.map((m) => ({ ...m, id: x.id, para: x.para ?? null })))], items: c.items };
  const candidatos = c.items.map((x) => x.candidato);
  // 2. Suelto o tanda.
  let eventos;
  try {
    eventos = candidatos.length === 1 ? [candidatos[0]] : await marcarTanda(candidatos);
  } catch (e) {
    return { ok: false, fase: 'marcar', motivos: [motivo(String(e?.message ?? e))], items: c.items };
  }
  // 3. Las pruebas de posesión sobre los ids nuevos, y otra vez en seco lo ya marcado.
  for (let k = 0; k < eventos.length; k++) {
    const antes = candidatos[k];
    const otros = clavesDeOtros(eventos[k]);
    if (!otros.length) continue;
    if (typeof opciones.posesion === 'function') {
      try {
        eventos[k] = await conPruebas(eventos[k], opciones);
      } catch (e) {
        return { ok: false, fase: 'posesion', indice: k, id: eventos[k].id, motivos: [motivo(String(e?.message ?? e))], items: c.items };
      }
    } else if (antes.posesion && eventos[k].id !== antes.id) {
      return { ok: false, fase: 'posesion', indice: k, id: eventos[k].id, motivos: [motivo('la prueba de posesión de ' + otros.join(', ') + ' firmaba el id de antes de marcar la tanda: hace falta rehacerla (opciones.posesion)')], items: c.items };
    } else if (antes.posesion) {
      eventos[k] = Object.freeze({ ...eventos[k], posesion: antes.posesion });
    }
  }
  const motivosDeTope = topes(eventos, eventos.map(() => ({ entra: true, motivos: [] })), opciones);
  if (motivosDeTope.length) return { ok: false, fase: 'topes', motivos: motivosDeTope, items: c.items };
  // Otra vez en seco, con los topes del contrato medidos por el núcleo sobre lo ya marcado.
  const enSeco = await eje.probarTanda(eventos, { topes: TANDA_TOPES });
  if (enSeco.peticion && !enSeco.peticion.ok) return { ok: false, fase: 'probar', indice: null, id: null, motivos: enSeco.peticion.motivos.map((m) => motivo(m.texto ?? String(m))), items: c.items };
  const falla = enSeco.findIndex((x) => !x.ok);
  if (falla >= 0) return { ok: false, fase: 'probar', indice: falla, id: eventos[falla].id, motivos: enSeco[falla].motivos.map((m) => motivo(m.texto ?? String(m))), items: c.items };
  // 4. Firmar todo antes de asentar nada.
  let firmados;
  try {
    if (typeof opciones.firmarTanda === 'function') {
      firmados = await opciones.firmarTanda(eventos);
      if (!Array.isArray(firmados) || firmados.length !== eventos.length) throw new Error('la firma de la tanda no devolvió un registro firmado por miembro');
    } else {
      // Sin con qué firmar (un libro de ejemplo sin claves), los registros van sin firma, como con enviar: el libro dice si los quiere.
      firmados = [];
      for (const ev of eventos) {
        const f = typeof firmar === 'function' ? await firmar(ev) : ev;
        if (!f) throw new Error('firma cancelada');
        firmados.push(f);
      }
    }
    firmados.forEach((f, k) => {
      if (!f || f.id !== eventos[k].id) throw new Error('la firma cambió el registro ' + (k + 1) + ': no se asienta nada');
    });
  } catch (e) {
    return { ok: false, fase: 'firmar', motivos: [motivo(String(e?.message ?? e))], items: c.items };
  }
  // 5. Asentar, entera.
  let guardados;
  let tanda = null;
  if (firmados.length === 1) {
    try {
      guardados = [await eje.anadir(firmados[0])];
    } catch (e) {
      return { ok: false, fase: 'asentar', indice: 0, id: firmados[0].id, motivos: (e.motivos ?? [{ texto: e.message }]).map((m) => motivo(m.texto ?? String(m))), items: c.items };
    }
  } else {
    let r;
    try {
      r = await eje.anadirTanda(firmados);
    } catch (e) {
      return { ok: false, fase: 'asentar', indice: null, id: null, motivos: [motivo(String(e?.message ?? e))], items: c.items };
    }
    if (!r.ok) return { ok: false, fase: 'asentar', indice: r.indice ?? null, id: r.id ?? null, motivos: (r.motivos ?? []).map((m) => motivo(m.texto ?? String(m))), items: c.items };
    guardados = r.eventos;
    tanda = r.tanda;
  }
  const ids = Object.fromEntries(c.items.map((x, k) => [x.id, guardados[k].id]).filter(([id]) => id !== null));
  return { ok: true, eventos: guardados, tanda, items: c.items, ids };
}

/**
 * «Ejecutar ahora» desde el aro: una bandeja de un solo uso con esa acción y lo que exige antes, por el MISMO camino que
 * el 4 (lanzar desde el paso 1). No lee ni toca el borrador guardado.
 */
export async function ejecutarAhora(eje, yo, firmar, { tipo, en, modo, accion = null, X, valores = {} } = {}, opciones = {}) {
  const entrada = { id: 'ahora', ...(tipo === 'campo' ? { tipo, en } : tipo === 'registro' ? { tipo, en, modo } : {}), accion, X, valores, donde: { X: null, pv: null }, completa: true, de: [] };
  const falla = fallaDeEntrada(entrada, new Set());
  if (falla) return { ok: false, fase: 'componer', motivos: [motivo(falla)] };
  return lanzar(eje, yo, firmar, [entrada], opciones);
}

/**
 * Lo que enseña el aro antes de «ejecutar ahora»: la misma prueba en seco que el 4 (componer), con esa acción y lo que
 * exige antes, sin borrador. → lo que da probar.
 */
export async function probarAhora(eje, yo, { tipo, en, modo, accion = null, X, valores = {} } = {}, opciones = {}) {
  const entrada = { id: 'ahora', ...(tipo === 'campo' ? { tipo, en } : tipo === 'registro' ? { tipo, en, modo } : {}), accion, X, valores, donde: { X: null, pv: null }, completa: true, de: [] };
  const falla = fallaDeEntrada(entrada, new Set());
  if (falla) return { ok: false, items: [], motivos: [motivo(falla)], cuesta: { segundos: 0 } };
  return componer(eje, yo, [entrada], opciones);
}

// ---------- varios libros (VG 18-11: «primero en el libro tal, después en el libro cual») ----------

/**
 * El orden en que se ejecutan los libros del borrador común: el orden en que aparece cada uno por primera vez, salvo que
 * una entrada se apoye en otra de otro libro ({ pendiente } que nombra una entrada de allí): entonces el libro del que
 * depende va antes (decisión de Core, 18-11). → { libros: [{ libro, cuenta, entradas: [ids locales], despuesDe: [libros]
 * }], circular } (`circular`: dos libros se esperan el uno al otro; van en el orden en que aparecen y no se ejecutan).
 */
export function planDeLibros(entradas) {
  const libros = [];
  const porLibro = new Map();
  for (const e of entradas ?? []) {
    if (!porLibro.has(e.libro)) {
      const l = { libro: e.libro, cuenta: e.cuenta, entradas: [] };
      porLibro.set(e.libro, l);
      libros.push(l);
    }
    porLibro.get(e.libro).entradas.push(e.id);
  }
  const libroDe = new Map((entradas ?? []).map((e) => [e.id, e.libro]));
  const necesita = new Map(libros.map((l) => [l.libro, new Set()]));
  for (const e of entradas ?? []) {
    for (const d of e.de ?? []) {
      const otro = libroDe.get(d);
      if (otro !== undefined && otro !== e.libro) necesita.get(e.libro).add(otro);
    }
  }
  const conLoQueEspera = (l) => ({ ...l, despuesDe: [...necesita.get(l.libro)] });
  const orden = [];
  const puestos = new Set();
  while (orden.length < libros.length) {
    const siguiente = libros.find((l) => !puestos.has(l.libro) && [...necesita.get(l.libro)].every((o) => puestos.has(o)));
    if (!siguiente) return { libros: [...orden, ...libros.filter((l) => !puestos.has(l.libro))].map(conLoQueEspera), circular: true };
    orden.push(siguiente);
    puestos.add(siguiente.libro);
  }
  return { libros: orden.map(conLoQueEspera), circular: false };
}

const MOTIVOS_DE_LIBROS = Object.freeze({
  noAbre: (m) => 'no se puede abrir este libro en este dispositivo' + (m ? ': ' + m : ''),
  circulo: 'los libros se esperan el uno al otro (una entrada de cada uno se apoya en otra del otro): así no se pueden ejecutar uno tras otro',
});

/** Abre un libro con lo que da la app, a salvo: { eje, yo, firmar, opciones?, nombre?, hecho? } o { motivo, nombre? }. */
async function abrirLibro(abrir, l) {
  try {
    const a = await abrir(l.libro, l.cuenta);
    return a?.eje ? a : { motivo: a?.motivo ?? null, nombre: a?.nombre ?? null };
  } catch (e) {
    return { motivo: String(e?.message ?? e) };
  }
}

/** Los items de las entradas de un libro que no se abre: cada una no entra, con el motivo. */
function itemsSinAbrir(entradas, l, m) {
  return entradas.filter((e) => e.libro === l.libro).map((e) => ({
    id: e.id, puesta: false, accion: e.tipo === 'campo' || e.tipo === 'registro' ? null : e.accion, entrada: limpia(e),
    entra: false, motivos: [motivo(MOTIVOS_DE_LIBROS.noAbre(m))], candidato: null, resumen: null, bytes: 0,
  }));
}

/**
 * La prueba en seco del borrador común, libro por libro y en el orden de planDeLibros: cada libro por separado, con su
 * eje, quien mira allí y sus opciones (`abrir(libro, cuenta)` → { eje, yo, opciones?, nombre? } o { motivo }). Lo que se
 * apoya en una entrada de un libro anterior se prueba con el id que tendría (el de su candidato en seco: `provisional`),
 * hasta donde se puede; si aquella no entra, dice que depende de ella. Nada se escribe.
 * → { ok, libros: [{ libro, cuenta, nombre, abierto, ok, items, motivos, cuesta, despuesDe }], motivos, cuesta, ignorado? }.
 */
export async function probarPorLibros({ almacen, persona, abrir, opciones = {} } = {}) {
  const b = leerBorrador(almacen, claveDelBorradorComun(persona), { comun: true });
  const plan = planDeLibros(b.entradas);
  const resueltas = new Map();
  const provisionales = new Set();
  const libros = [];
  for (const l of plan.libros) {
    const a = await abrirLibro(abrir, l);
    if (!a.eje) {
      libros.push({ ...l, nombre: a.nombre ?? null, abierto: false, ok: false, items: itemsSinAbrir(b.entradas, l, a.motivo), motivos: [motivo(MOTIVOS_DE_LIBROS.noAbre(a.motivo))], cuesta: { segundos: 0 } });
      continue;
    }
    const vista = crearBandeja({ almacen, libro: l.libro, cuenta: l.cuenta, comun: persona });
    let r;
    try {
      r = await vista.probar(a.eje, a.yo, { ...opciones, ...(a.opciones ?? {}), resueltas, provisionales });
    } catch (e) {
      r = { ok: false, items: [], motivos: [motivo(String(e?.message ?? e))], cuesta: { segundos: 0 } };
    }
    for (const x of r.items) {
      if (x.entra && x.id !== null && x.candidato) {
        resueltas.set(x.id, x.candidato.id);
        provisionales.add(x.id);
      }
    }
    libros.push({ ...l, nombre: a.nombre ?? null, abierto: true, ok: r.ok, items: r.items, motivos: r.motivos, cuesta: r.cuesta });
  }
  const motivos = [...(plan.circular ? [motivo(MOTIVOS_DE_LIBROS.circulo)] : []), ...(libros.length ? [] : [motivo(MOTIVOS.vacia)])];
  return {
    ok: libros.length > 0 && libros.every((l) => l.ok) && !plan.circular, libros, motivos,
    cuesta: { segundos: libros.reduce((s, l) => s + (l.cuesta?.segundos ?? 0), 0) },
    ...(b.ignorado ? { ignorado: b.ignorado } : {}),
  };
}

/**
 * Ejecuta el borrador común: primero la prueba en seco de todos los libros (si algo no entra, no se ejecuta nada); después
 * `antesDeEjecutar(probado)` (async → motivo en llano o null: lo que la app hace antes de firmar, como subir los archivos);
 * después, libro a libro y en orden, la ejecución de cada uno (bandeja.ejecutar: todo o nada en su libro, con su firma),
 * con lo que se apoya en una entrada ya escrita resuelto con el id real. Al primer libro que falla se para: lo hecho en
 * los anteriores YA ESTÁ HECHO y ha salido del borrador; lo del que falla y los siguientes sigue en él. Entre libros no se
 * promete nada. `abrir(libro, cuenta)` → { eje, yo, firmar, opciones?, nombre?, hecho?(r) } (hecho: lo que la app hace
 * con un libro recién ejecutado, como guardarlo).
 * → { ok, fase? ('probar' | 'antes' si no se intentó ninguno), hechos: [{ libro, cuenta, nombre, eventos, items, ids, tanda
 * }], fallo: null | { libro, cuenta, nombre, fase, motivos, items? }, pendientes: [{ libro, cuenta, nombre }] (los que no
 * se intentaron), ids (id local → id real, de todo lo hecho), probado }.
 */
export async function ejecutarPorLibros({ almacen, persona, abrir, opciones = {}, antesDeEjecutar = null } = {}) {
  const probado = await probarPorLibros({ almacen, persona, abrir, opciones });
  const resto = (desde) => probado.libros.slice(desde).map((l) => ({ libro: l.libro, cuenta: l.cuenta, nombre: l.nombre }));
  if (!probado.ok) {
    const l = probado.libros.find((x) => !x.ok) ?? null;
    const motivos = [...probado.motivos, ...(l ? [...l.motivos, ...l.items.filter((x) => !x.entra).flatMap((x) => x.motivos.map((m) => ({ ...m, id: x.id, para: x.para ?? null })))] : [])];
    return { ok: false, fase: 'probar', hechos: [], fallo: { libro: l?.libro ?? null, cuenta: l?.cuenta ?? null, nombre: l?.nombre ?? null, fase: 'probar', motivos, items: l?.items ?? [] }, pendientes: resto(0), ids: {}, probado };
  }
  if (typeof antesDeEjecutar === 'function') {
    let m = null;
    try {
      m = await antesDeEjecutar(probado);
    } catch (e) {
      m = String(e?.message ?? e);
    }
    if (m) return { ok: false, fase: 'antes', hechos: [], fallo: { libro: null, cuenta: null, nombre: null, fase: 'antes', motivos: [motivo(String(m))] }, pendientes: resto(0), ids: {}, probado };
  }
  const ids = new Map();
  const hechos = [];
  let fallo = null;
  for (const l of probado.libros) {
    const a = await abrirLibro(abrir, l);
    if (!a.eje) {
      fallo = { libro: l.libro, cuenta: l.cuenta, nombre: a.nombre ?? l.nombre, fase: 'abrir', motivos: [motivo(MOTIVOS_DE_LIBROS.noAbre(a.motivo))] };
      break;
    }
    const vista = crearBandeja({ almacen, libro: l.libro, cuenta: l.cuenta, comun: persona });
    let r;
    try {
      r = await vista.ejecutar(a.eje, a.yo, a.firmar, { ...opciones, ...(a.opciones ?? {}), resueltas: ids });
    } catch (e) {
      r = { ok: false, fase: 'ejecutar', motivos: [motivo(String(e?.message ?? e))] };
    }
    if (!r.ok) {
      fallo = { libro: l.libro, cuenta: l.cuenta, nombre: a.nombre ?? l.nombre, ...r };
      break;
    }
    for (const [local, id] of Object.entries(r.ids ?? {})) ids.set(local, id);
    const hecho = { libro: l.libro, cuenta: l.cuenta, nombre: a.nombre ?? l.nombre, ...r };
    hechos.push(hecho);
    try {
      await a.hecho?.(hecho);
    } catch { /* lo que la app hace después (guardar) no deshace lo hecho */ }
  }
  return { ok: !fallo, hechos, fallo, pendientes: resto(hechos.length + (fallo ? 1 : 0)), ids: Object.fromEntries(ids), probado };
}

/**
 * Pasa al borrador común lo que quedó en el borrador de un libro (el de antes del común: claveDelBorrador), con ids nuevos
 * y sus referencias cambiadas, y deja aquel vacío. Si no cabe, no pasa nada. → cuántas entradas pasó.
 */
export function absorberBorradorDeLibro({ almacen, libro, cuenta, persona }) {
  const viejo = leerBorrador(almacen, claveDelBorrador(libro, cuenta));
  if (viejo.ignorado || !viejo.entradas.length) return 0;
  const clave = claveDelBorradorComun(persona);
  const comun = leerBorrador(almacen, clave, { comun: true });
  if (comun.ignorado || comun.entradas.length + viejo.entradas.length > MAXIMO_DE_ENTRADAS) return 0;
  let siguiente = comun.siguiente;
  const nuevos = new Map(viejo.entradas.map((e) => [e.id, 'b' + siguiente++]));
  const renombrar = (x) => {
    if (esRefPendiente(x)) return { pendiente: nuevos.get(x.pendiente) ?? x.pendiente };
    if (Array.isArray(x)) return x.map(renombrar);
    if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, renombrar(v)]));
    return x;
  };
  const pasadas = viejo.entradas.map((e) => {
    const n = { ...limpia(e), id: nuevos.get(e.id), libro, cuenta, X: renombrar(e.X), valores: renombrar(e.valores) };
    return { ...n, de: dependenciasDe(n) };
  });
  if (!guardarBorrador(almacen, clave, { siguiente, entradas: [...comun.entradas, ...pasadas] })) return 0;
  guardarBorrador(almacen, claveDelBorrador(libro, cuenta), { siguiente: viejo.siguiente, entradas: [] });
  return pasadas.length;
}

export { TANDA_MINIMA, TANDA_MAXIMA };

/**
 * Lo que hacía carta.enviar (una acción, ya, firmada y asentada) por el único camino que queda: ejecutarAhora, con lo que
 * la acción exige antes en el mismo todo o nada. Para los sitios que escribían con enviar y no componen nada (reclasificar,
 * una propuesta importada, las reglas, un retoque, el HTML inicial). → la forma de enviar: { ok, asentado (el registro de
 * la acción: el último), evento, motivos }, más eventos, tanda y, si no entró, fase.
 */
export async function enviarPorLaBandeja(eje, X, accion, valores, yo, firmar, opciones = {}) {
  const r = await ejecutarAhora(eje, yo, firmar, { accion, X, valores: valores ?? {} }, opciones);
  if (!r.ok) return { ok: false, asentado: null, evento: null, motivos: r.motivos ?? [], fase: r.fase ?? null };
  const asentado = r.eventos.at(-1);
  return { ok: true, asentado, evento: asentado, motivos: [], eventos: r.eventos, tanda: r.tanda };
}

/**
 * Lo que hacía salida.escribirDesde (un registro ya hecho por la lente, desde un modo, firmado y asentado) por el único
 * camino: ejecutarAhora con una entrada de tipo registro. Para las preferencias, los ajustes de la guía y de fuera y el
 * formato. → el registro asentado; si no entra, lanza con los motivos (como escribirDesde), en `motivos`.
 */
export async function escribirPorLaBandeja(eje, yo, firmar, { modo, sobre, en, payload }, opciones = {}) {
  const r = await ejecutarAhora(eje, yo, firmar, { tipo: 'registro', modo, en, X: sobre, valores: { payload } }, opciones);
  if (!r.ok) throw Object.assign(new Error((r.motivos ?? []).map((m) => m.mensaje ?? String(m)).join('; ')), { motivos: r.motivos ?? [] });
  return r.eventos.at(-1);
}
