// El arranque de la carta en el navegador: mi cuenta (un eje propio cuyo génesis es mi alta, con mi clave generada en
// este dispositivo: carta/cuentas.js) o el eje de ejemplo (con las claves de las identidades de prueba), el libro
// local de quien mira, el estado de la pantalla y el ciclo medir → pedir el árbol (carta/carta.js) → pintar
// (carta/dom.js) → enganchar gestos (carta/gestos.js). Lo nuevo del diario desde la última vez (estado.nuevos) es lo
// que el animado anima (efectos, actuar) y se olvida en cuanto se ha pintado.
//
// Al abrir: si hay una cuenta usada la última vez, se entra en ella; si lo último fue un ejemplo, en el ejemplo; si
// nunca se eligió nada, la pantalla de arranque ofrece crear mi cuenta, restaurar una cuenta desde su copia o probar
// con un ejemplo. Las cuentas viven en sus propias claves de localStorage (cuentas.js, CLAVES) y los ejemplos en las
// de siempre (CLAVES_EJEMPLO, con los ejemplos de carta/ejemplos.js y el conmutador de carta/leido.js). Nada real en el
// repositorio: las identidades de ejemplo llevan claves generadas en este navegador; la de mi cuenta, también, y solo
// sale de él cifrada con una frase (la copia de seguridad).
//
// El libro compartido (etapa 3, carta/sincronia.js): una cuenta con `sync url` y `sync ledger` en su configuración y
// clave de lectura en este navegador sincroniza su eje con el servidor: al entrar (sin esperar: se pinta ya con lo
// local), tras cada escritura, al volver la red y cada 30 s con la pestaña visible; de una en una. Los ejemplos no
// sincronizan nunca. Nada de esto bloquea: se escribe en local y la cola sube lo pendiente.
//
// Varios libros (A24; carta/libros.js): una persona es una clave y esa clave tiene varios libros. «Tus libros», en la
// cabecera, cambia de libro con lo que ya hay (entrarEnCuenta → entrarCon → cambiarDeEje: la sincronía de antes se suelta
// y se abre la del nuevo; los criterios se vuelven a mandar al guardián). «Abrir aquí un libro privado» crea el libro
// pequeño con mi clave, escribe en él de qué cuelga y, si el anfitrión da claves de línea, lo anuncia en el grande;
// «Entrar» y «Volver» cambian de libro con un foco de llegada.

import { autoridad, persistencia, local, salida, contrato, acciones, direccion, leerEvento, sincronia, exterior } from '../src/index.js';
import { arbol, porFirmar, ceroDe, enviar, validarSinFirmar, antesDelMensaje, horaDeEscribir, usarReloj, previsualizar, formulario, creableEn, conEtiquetasLlanas, motivosEnLlano, sinNombreInterno, medidasDePantalla, preferencias, segundoFactorDeConfiguracion, guardarRetoque, textosRetocados, ampliar, ampliarTodos, alternarRoseton, rosetonAPantallaCompleta, hayRosetonAmpliado, NIVEL, LATERALES, CENTROS, GEOMETRIA } from './carta.js';
import { formatoDeLibro, formatoValido, registroDeFormato, olvidarFormatoLocal } from './formato-btml.js';
import { html, htmlSincronia, htmlGuia, trasPintar, variablesDeColor, resolverArchivos, textoDelCoste, textoDelPasoDeSalida } from './dom.js';
import { instalar } from './gestos.js';
import * as opinar from './opinar.js';
import { t, idiomaDeInterfaz, usarRetoques } from './textos.js';
import * as cuentas from './cuentas.js';
import * as ajustesDelSitio from './sitio.js';
import * as sinc from './sincronia.js';
import * as guia from './guia.js';
import * as externa from './externa.js';
import { anfitrion, autorizarCon, guardian, firmanteDeCuenta, firmanteDeServicio, sesionAbierta, claveDelError, codigoDe, pasarCriterios, pedirSesion, puedePedirSesion, clavesDeLinea, puedeDarClavesDeLinea, hayAnfitrion, usarGuardian, tieneLaCuenta } from './anfitrion.js';
import { Emparejamiento, almacenIndexedDB } from './emparejamiento.js';
import { guardianEmparejado, guardianDeLaCarta, porQueSoloLeer, asentarFirmadas } from './guardian-emparejado.js';
import { instalar as instalarEmparejar } from './emparejar.js';
import { confirmarEnPagina } from './confirmar.js';
import * as libros from './libros.js';
import { Archivos, adjuntarHtmlInicial, adjuntarConAccion, TIPOS as TIPOS_DE_ARCHIVO, destinoDe as destinoDeLosArchivos } from './archivos.js';
import { EJEMPLOS, crearEjemplo, restaurarEjemplo, elegirEjemplo, ejemploElegido } from './ejemplos.js';
import { alternarLeido, leidoAbierto } from './leido.js';
import { leerLocal, guardarLocal } from './cuentas.js';
import { reglasDelLibro, cambioDelLibro, actuar as actuarEnCambio, parametrosMovibles, proponer as proponerCambio, ajustesDelElemento, conGobierno } from './reglas.js';
import * as puente from './puente.js';
import * as guiasCarta from './guias.js';

const { CLAVES_EJEMPLO, EJEMPLO } = cuentas;
const CLAVE_EJE = CLAVES_EJEMPLO.eje;
const CLAVE_CLAVES = CLAVES_EJEMPLO.claves;
const CLAVE_FOCO = CLAVES_EJEMPLO.foco;
const CLAVE_YO = CLAVES_EJEMPLO.yo;
const IDENTIDADES_EJEMPLO = ['casa', 'cocina', 'huesped', 'recepcion'];
/** Cuántos caracteres pide, como mínimo, la frase de la copia de seguridad (una comodidad de la pantalla, no un dato de la época). */
const FRASE_MINIMA = 8;

const raiz = document.querySelector('#carta');
const estado = {
  eje: null, claves: {}, identidad: null, foco: { X: null, pv: 0 }, niveles: {}, recientes: [], paginas: {}, profundidad: {}, aro: null, formulario: null,
  rosetones: {}, local: null, leido: leidoAbierto(), aviso: '', exito: '', guardado: '', config: false, motivosPreferencias: [],
  vistos: new Set(), nuevos: new Set(), hermanos: null,
  // Mi cuenta: la abierta ({ nombre, idioma, identidad, alta, publica, privada }) o null en un ejemplo; la pantalla
  // de arranque ({ modo, campos, valores, motivos, ocupado }) y el diálogo de la copia ({ archivo, minimo, motivos, hecho, ocupado }).
  cuenta: null, arranque: null, copia: null,
  // El libro compartido de la cuenta abierta: su Sincronia (src/sincronia.js) o null (un ejemplo, o una cuenta sin
  // servidor, eje compartido o clave de lectura), y lo que enseña la línea de estado (sinc.lineaDeEstado) o null.
  sincronia: null, lineaSincronia: null,
  // La guía del PV9: la conversación de la alta en pantalla, lo escrito sin enviar y lo que está pasando.
  guia: { alta: null, historial: [], borrador: '', pensando: false, pendiente: '', error: '', con: 'guia' },
  // Hablar con Core desde el PV9 (solo con el servidor de retoques, retoques/; carta/guia.js «hablar con Core»): la
  // conversación de este navegador (null hasta cargarla), lo escrito sin mandar, lo señalado y si el próximo toque señala.
  core: { turnos: null, pensando: false, error: '', borrador: '', senalado: [], senalando: false, fondo: null, fondoAbierto: false, ensayo: null, entrandoEnsayo: false, errorEnsayo: '' },
  // El 3 por tema (encargo pv3): el botón de cada caja ({ [caja]: 'todos' | 'doy' | 'recibo' }) y el sitio abierto
  // ({ X, lugar }: la cruceta del propio nodo, el personaje del sitio) o null.
  filtrosDelTres: {}, sitio: null,
  // La cuenta del guardián (camino B, carta/anfitrion.js): si su sesión está cerrada (el aviso persistente), lo automático
  // que se paró por ella (lo que rehace el botón «abrir la sesión»), si el botón está firmando, y los criterios de segundo
  // factor ya pasados al guardián (sus ids).
  guardian: { sesionCerrada: false, pendiente: null, abriendo: false, criterios: null, noAbrio: false },
  // Retocar un texto en su sitio (A20 escalón 1): el modo «retocar textos» (solo cuenta para quien puede retocar en este
  // libro; arranca apagado) y la hoja abierta ({ clave, idioma, texto, aviso, motivos }) o null.
  retocar: false, retoque: null,
  // «Reglas del libro» (A21; carta/reglas.js): la vista abierta ({ cambio: id | null, proponer: { posicion, valores } | null,
  // aviso, motivos, exito }) o null; y «Ajustes de este elemento» abierta ({ X }) o null.
  reglas: null, ajustes: null,
  // «Abrir aquí un libro privado» (A24, §4.4; carta/libros.js): el diálogo abierto ({ X, elemento, nombre, fase, cuelga,
  // anuncio, claves, pequeno, … }) o null.
  libroPrivado: null,
  // El puente entre mis libros abiertos (carta/puente.js): la hoja abierta ({ otros: Map libro → { cuenta, eje } | { motivo },
  // enviar: { serie } | null, traer: { enlace } | null, aviso, motivos, exito, ocupado }) o null.
  puente: null,
};
/** Los registros cuyo segundo factor se está firmando con el anfitrión ahora (su botón, inactivo: no dos firmas por dos toques). */
const autorizando = new Set();
let limpiarLottie = () => {};
let gestos = null;
let pintando = null;
let lineaPintada = null; // el HTML de la línea del libro compartido que hay en pantalla
let ultimo = null; // el último árbol pintado: si es Mapped (no apilada), los pasos de tamaño son los de la época

/**
 * Los archivos adjuntos (issues #21, #22; carta/archivos.js): se suben y se bajan con la función `archivos` del mismo
 * servidor, eje compartido y clave de lectura que el libro compartido de la cuenta; sin ellos (un ejemplo, una cuenta sin
 * servidor) no hay dónde. Lo bajado se queda en esta pestaña; al llegar algo pedido, se repinta.
 */
function destinoDeArchivos() {
  if (!estado.cuenta || !estado.eje) return null;
  return destinoDeLosArchivos(estado.eje, estado.identidad, cuentas.claveLectura(estado.cuenta.alta));
}
const archivos = new Archivos({ destino: destinoDeArchivos, alCambiar: () => pintar() });
// Las piezas del arte propio (#25) que son adjuntos: su URL local, la de lo bajado de la función `archivos` (con la clave
// de lectura: un <img> no puede mandarla); mientras no ha llegado, null (no se pinta) y, al llegar, se repinta.
resolverArchivos((id) => archivos.contenido(id).url ?? null);

/** El firmante del guardián con que firma mi cuenta (camino B), o null (camino A, un ejemplo, otra identidad o solo para leer). */
const firmanteGuardian = (id) => (estado.cuenta?.firmante && id === estado.cuenta.identidad ? estado.cuenta.firmante : null);
/**
 * La clave privada con que firma una identidad: la de mi cuenta si soy yo, si no la de ejemplo guardada en este navegador.
 * Con una cuenta del guardián, su firmante, que el núcleo acepta donde iba la clave (docs/ANFITRION.md).
 */
const privadaDe = (id) => firmanteGuardian(id) ?? (estado.cuenta && id === estado.cuenta.identidad ? estado.cuenta.privada : estado.claves[id]?.privada);
/** (evento) → evento firmado (transaccion, autoejecutar, englobar): con el guardián, autoridad.firmanteDeEventos de su firmante. */
const firmarCon = (id) => (firmanteGuardian(id)
  ? autoridad.firmanteDeEventos(firmanteGuardian(id), { publica: estado.cuenta.publica })
  : privadaDe(id) ? (ev) => autoridad.firmar(ev, privadaDe(id)) : undefined);
/** Lo que se firma solo para ver (el camino del árbol, previsualizar un paso): no se escribe, así que al guardián no se le pide. */
const firmarParaVer = (id) => (estado.cuenta?.guardian === true ? undefined : firmarCon(id));

/**
 * Camino B: el error de la última firma del guardián (el que guarda su firmante o, si no, el `code` de `e`), en llano;
 * cualquier otro que los conocidos, el aviso de fallo, con el detalle en la consola. Con la sesión cerrada, además el
 * aviso persistente. null si no lo hay (o en el camino A). Lo consume.
 */
function errorDelGuardian(e) {
  if (estado.cuenta?.guardian !== true) return null;
  const f = estado.cuenta.firmante;
  const delGuardian = f?.error ?? (codigoDe(e) ? e : null);
  if (!delGuardian) return null;
  if (f) f.error = null;
  const clave = claveDelError(delGuardian);
  if (clave === 'guardianFallo') console.error('guardián:', String(delGuardian?.message ?? delGuardian));
  if (clave === 'guardianSesionCerrada') estado.guardian.sesionCerrada = true;
  return t(clave);
}
/** El texto de un fallo: el del guardián en llano si lo fue, si no el que ya se daba. */
const enLlano = (texto, e) => errorDelGuardian(e) ?? texto;
/** Los motivos de un formulario que no pasó: si lo paró el guardián, solo su texto llano. */
const motivosConGuardian = (motivos) => { const g = errorDelGuardian(); return g ? [{ mensaje: g }] : motivos; };
/**
 * La pantalla que mide la carta: la ventana entera (sin barra superior desde el #38: el personaje del 0 está en el centro; en
 * Mapped la escena es todo, sin scroll). Las medidas por tamaño de pantalla (el móvil apaisado, más bajo) las calcula
 * carta.js medidasDePantalla.
 */
const medidas = () => medidasDePantalla(window.innerWidth, window.innerHeight);
/** ¿Está la carta en Mapped (la matriz del ordenador)? Lo dice el último árbol (la época decide por la forma de la pantalla). */
const enMapped = () => Boolean(ultimo && !ultimo.vacio && !ultimo.apilada);
/** ¿Está la carta en Sequenced con su columna (la tarjeta con sus filas y el hilo)? */
const enSecuencia = () => Boolean(ultimo && !ultimo.vacio && ultimo.apilada && ultimo.secuencia);
/** Sequenced: a qué fila o zona del hilo llevar la pantalla tras el próximo pintado (un dígito tocado), o null. */
let irTrasPintar = null;
/** El idioma de quien mira: su preferencia «language». */
const idioma = () => contrato.configuracion(estado.eje, estado.identidad).language;
/** La clave de localStorage del libro local de quien mira: por cuenta, o la de los ejemplos. */
const claveLocalDe = (id) => (estado.cuenta ? cuentas.CLAVES.local(estado.cuenta.alta, id) : CLAVES_EJEMPLO.local(id));
/** El PV donde la carta pinta el camino (la geometría de VG: la cruz, abajo); ahí se abre el tutorial de un alta nueva. */
const PV_CAMINO = Number(Object.keys(GEOMETRIA).find((pv) => GEOMETRIA[pv].grupo === 'cruz' && GEOMETRIA[pv].fila === 'abajo'));
/** El nombre canónico de una acción del aro (por su id o su nombre): lo que anota el libro local. */
function canonicoDe(accion) {
  // Con la época del libro abierto: una plantilla de una época hija (la de la guía) también tiene nombre.
  const epoca = typeof estado.eje?.epoca === 'function' ? estado.eje.epoca() : undefined;
  const p = acciones.plantillaDeTransaccion(accion, epoca ? { epoca } : {}) ?? acciones.plantillaDeTransaccion(accion);
  return p ? acciones.nombreDeAccion(p) : String(accion);
}
/** El nombre de una acción del aro (por su id o su nombre canónico) en el idioma de quien mira. */
function nombreDeAccion(accion) {
  const canonico = canonicoDe(accion);
  return contrato.texto(estado.eje, contrato.claves.plantilla(canonico), idioma(), { original: canonico });
}

/** Las claves de las identidades de ejemplo guardadas en este navegador; se generan las que falten (como la web antigua). */
async function cargarClaves() {
  const claves = {};
  const exportables = {};
  try {
    const guardadas = JSON.parse(leerLocal(CLAVE_CLAVES) ?? 'null') ?? {};
    for (const [id, par] of Object.entries(guardadas)) {
      claves[id] = { publica: par.publica, privada: await autoridad.importarPrivada(par.privada) };
      exportables[id] = par;
    }
  } catch { /* sin claves guardadas o ilegibles: se generan */ }
  let nuevas = false;
  for (const id of IDENTIDADES_EJEMPLO) {
    if (claves[id]) continue;
    claves[id] = await autoridad.generarClaves();
    exportables[id] = { publica: claves[id].publica, privada: await autoridad.exportarPrivada(claves[id].privada) };
    nuevas = true;
  }
  if (nuevas) guardarLocal(CLAVE_CLAVES, JSON.stringify(exportables));
  return claves;
}

function guardar() {
  const ok = estado.cuenta ? cuentas.guardarEje(estado.cuenta, estado.eje) : persistencia.guardarLocal(estado.eje, CLAVE_EJE);
  estado.guardado = ok ? t('guardadoEnNavegador', { cuantos: estado.eje.orden.length }) : t('sinAlmacenamiento');
  guardarLibroLocal();
  // El estado de la sincronía va junto al eje, por cuenta (sin la clave de lectura, que va aparte).
  if (estado.sincronia && estado.cuenta) cuentas.guardarEstadoSincronia(estado.cuenta.alta, estado.sincronia.serializar());
}

/** Tras cada escritura en el eje: guardar y, si la cuenta comparte su eje, sincronizar sin esperar (lo pendiente es lo que el servidor no tiene). */
function trasEscribir() {
  guardar();
  if (estado.sincronia) void sincronizar();
  void criteriosAlGuardian();
  if (emparejado.emparejamiento) void asentarDelEmparejamiento(); // lo firmado por la app que ya está en el libro se descarta
}

/** Camino B: la sesión del guardián de mi cuenta, para lo automático (sinc.pasar, seguir); sin firmante, nada que consultar. */
const sesionDelGuardian = () => (estado.cuenta?.firmante ? () => sesionAbierta(guardian, estado.cuenta.publica) : undefined);

/**
 * Camino B, el verbo opcional `criterios` del guardián: al abrir la cuenta y cada vez que cambian, le pasa los registros
 * de mis criterios de segundo factor (carta/anfitrion.js pasarCriterios). Si el guardián no lo ofrece, nada; si los
 * rechaza, un aviso y el detalle en la consola.
 */
async function criteriosAlGuardian() {
  const c = estado.cuenta;
  if (!c?.firmante || !estado.eje || typeof guardian?.criterios !== 'function') return;
  const ids = acciones.criteriosDeSegundoFactor(estado.eje, c.identidad).map((x) => x.id).join(' ');
  if (ids === estado.guardian.criterios) return;
  estado.guardian.criterios = ids;
  const r = await pasarCriterios(guardian, estado.eje, c.identidad, c.publica);
  if (r?.error && estado.cuenta === c) {
    console.error('guardián (criterios):', String(r.error?.message ?? r.error));
    estado.aviso = t('guardianCriteriosNo');
    pintar();
  }
}

/**
 * Sincroniza la cuenta en pantalla con el libro compartido, de una en una (sinc.enSerie: la que llega con otra en
 * marcha se repite al acabar). Si el eje cambió (reordenado o con algo añadido), guardar y pintar; si no, solo la
 * línea de estado (repintarlo todo cada 30 s borraría lo que se está escribiendo en un formulario).
 */
const sincronizar = sinc.enSerie(async () => {
  const S = estado.sincronia;
  const cuenta = estado.cuenta;
  const eje = estado.eje;
  if (!S || !cuenta || !eje) return;
  const sesion = sesionDelGuardian();
  const informe = await sinc.pasar(S, eje, cuenta.alta, sesion ? { sesion } : {});
  if (archivos.pendientes.size && !informe.sinRed) await archivos.subirPendientes(); // lo adjuntado sin red, como la cola de eventos
  if (estado.sincronia !== S || estado.eje !== eje) return; // otra cuenta en pantalla: lo de esta ya quedó guardado
  estado.lineaSincronia = sinc.lineaDeEstado(S, informe);
  // Camino B: la sincronía es automática; con la sesión del guardián cerrada no firma y queda el aviso persistente.
  const cambiaSesion = Boolean(sesion) && estado.guardian.sesionCerrada !== (informe.sesionCerrada === true);
  if (cambiaSesion) estado.guardian.sesionCerrada = informe.sesionCerrada === true;
  if (cambiaSesion || informe.reordenado || informe.anadidos.length || informe.pagos?.anotados.length) {
    guardar();
    marcarNuevos();
    await pintar();
  } else pintarSincronia();
}, { alFallar: (e) => console.error(e) });

/** Solo la línea del libro compartido, si cambió (así un desplegable abierto sigue abierto). */
function pintarSincronia() {
  const nuevo = htmlSincronia(estado.lineaSincronia);
  const el = raiz.querySelector('[data-sincronia]');
  if (nuevo === lineaPintada && (el || !nuevo)) return;
  lineaPintada = nuevo;
  if (el) el.outerHTML = nuevo;
  else raiz.querySelector('.sitio-cruceta[data-sitio-general] .guardado')?.insertAdjacentHTML('afterend', nuevo);
}

/**
 * El firmante de la cuenta para el servicio de pagos (src/pago.js): firma el id del evento NIP-98 con la clave de la
 * cuenta, el mismo material con el que firma sus registros (autoridad.firmar); la privada no sale de aquí.
 */
function firmanteDeLaCuenta() {
  // Camino B: firma el guardián (firmarServicio, con el evento NIP-98 entero); solo para leer, nadie.
  if (estado.cuenta?.guardian === true) return estado.cuenta.firmante ? firmanteDeServicio(guardian, estado.cuenta.publica) : {};
  const privada = estado.cuenta?.privada;
  if (!privada) return {};
  return { pubkey: autoridad.publicaDe(privada), firmar: async (id) => (await autoridad.firmar({ id }, privada)).firma };
}

/** Abre la sincronía de la cuenta en pantalla (con servidor, eje compartido y clave de lectura) y sincroniza sin esperar. */
function abrirSincronia() {
  const sesion = sesionDelGuardian();
  estado.sincronia = estado.cuenta && estado.eje ? sinc.abrir({ alta: estado.cuenta.alta, eje: estado.eje, yo: estado.cuenta.identidad, firmante: firmanteDeLaCuenta(), ...(sesion ? { sesion } : {}) }) : null;
  estado.lineaSincronia = null;
  if (estado.sincronia) void sincronizar();
}

/** El libro local de quien mira: el guardado en este navegador (vuelve a quemar cada segundo) o uno nuevo. */
function abrirLibroLocal() {
  const id = estado.identidad;
  if (!id || !estado.eje) { estado.local = null; return; }
  try {
    const datos = JSON.parse(leerLocal(claveLocalDe(id)) ?? 'null');
    estado.local = datos ? local.LibroLocal.restaurar(estado.eje, datos) : new local.LibroLocal(estado.eje, id);
  } catch {
    estado.local = new local.LibroLocal(estado.eje, id);
  }
}

function guardarLibroLocal() {
  if (estado.local) guardarLocal(claveLocalDe(estado.identidad), JSON.stringify(estado.local.serializar()));
}

/** Cada toque gasta un segundo del libro local; si no queda, el motivo que da la época se enseña y no se corta nada. */
function tocar(X, accion) {
  if (!estado.local || !X || !estado.eje?.obtener(X)) return;
  const r = accion ? estado.local.tocar(X, accion) : estado.local.ver(X);
  if (!r.ok) estado.aviso = r.motivo;
  guardarLibroLocal();
}

/** Lo nuevo desde la última vez: los ids del diario del foco que aún no se habían visto (lo que el animado anima). */
function marcarNuevos() {
  const X = estado.foco.X;
  if (!X || !estado.eje) return;
  const d = contrato.diario(estado.eje, X, 0, 100);
  estado.nuevos = new Set(d.entradas.map((e) => e.id).filter((id) => !estado.vistos.has(id) && estado.vistos.size));
  for (const e of d.entradas) estado.vistos.add(e.id);
}

/** Los defectos del sitio (carta/sitio.js, ./sitio.json) que a mi cuenta aún le faltan: el formulario de la configuración los enseña; no se guardan hasta que se guarda. */
const porDefectoDelSitio = () => (estado.cuenta ? ajustesDelSitio.faltantes(estado.eje, estado.identidad) : { preferencias: {}, exterior: {} });

/** Lo que la carta no decide y la app sabe (dom.js html, `extra`). */
function extraDe() {
  return {
    ejemplos: EJEMPLOS.map((e) => ({ id: e.id, etiqueta: e.etiqueta })), ejemplo: ejemploElegido(), guardado: estado.guardado, aviso: estado.aviso, exito: estado.exito, nuevos: estado.nuevos,
    anfitrion: Boolean(anfitrion), autorizando,
    // Camino B: el aviso persistente de la cuenta del guardián (solo para leer, o la sesión cerrada con su botón).
    guardian: estado.cuenta?.guardian === true ? { soloLeer: Boolean(estado.cuenta.soloLeer), sinGuardian: !guardian, sesionCerrada: estado.guardian.sesionCerrada, abriendo: estado.guardian.abriendo, puedeAbrir: Boolean(estado.guardian.pendiente) || puedePedirSesion(guardian), noAbrio: estado.guardian.noAbrio,
      // Sin anfitrión (A25): emparejar con la app (o volver a emparejar) y, si la app emparejada guarda otra clave, decirlo.
      emparejar: Boolean(emparejado.emparejamiento), reemparejar: emparejado.hubo, otraClave: porQueSoloLeer(estado.cuenta.publica, emparejado.emparejamiento) === 'otraClave',
      // Quien firma es el emparejamiento (su adaptador es el guardián, o lo era y ya no está vivo): en plazo o terminado.
      porEmparejamiento: emparejado.adaptador && (guardian === emparejado.adaptador || (!guardian && emparejado.hubo)) ? (emparejado.emparejamiento?.estado() ? 'vivo' : 'terminado') : undefined } : undefined,
    emparejar: emparejado.emparejamiento ? { vivo: Boolean(emparejado.emparejamiento.estado()) } : null,
    leidoTexto: estado.leido && estado.foco.X && estado.eje ? leerTexto(estado.foco.X) : undefined,
    preferencias: estado.config && estado.eje ? conEtiquetasLlanas(preferencias(estado.eje, estado.identidad, porDefectoDelSitio().preferencias), idioma()) : null, motivosPreferencias: estado.motivosPreferencias,
    claveLectura: estado.cuenta && estado.config ? cuentas.claveLectura(estado.cuenta.alta) ?? '' : undefined, sincronia: estado.lineaSincronia,
    cuentas: conEtiquetas(cuentas.cuentas()), cuenta: estado.cuenta ? { nombre: estado.cuenta.nombre, alta: estado.cuenta.alta, identidad: estado.cuenta.identidad } : null,
    // Varios libros (A24): «Tus libros» y el diálogo del libro privado.
    libros: estado.cuenta ? tusLibrosDe() : undefined, libroPrivado: estado.libroPrivado ?? undefined,
    guiaAjustes: estado.config && estado.eje ? guiaAjustesDe() : undefined,
    exteriorAjustes: estado.config && estado.eje ? conEtiquetasLlanas(guia.ajustesEditablesDe(exterior.AJUSTES.plantilla, estado.eje, estado.identidad, porDefectoDelSitio().exterior), idioma()) ?? undefined : undefined,
    segundoFactor: estado.config && estado.eje ? segundoFactorDeConfiguracion(estado.eje, estado.identidad) ?? undefined : undefined,
    retocarTextos: estado.config && estado.eje ? retocarTextosDe() : undefined,
    // «Reglas del libro» y «Ajustes de este elemento» (A21): sus vistas, y la entrada desde la configuración y desde el génesis.
    reglas: estado.reglas && estado.eje ? reglasDe() : undefined,
    puente: estado.puente && estado.eje ? puenteSeguro() : undefined,
    ajustesElemento: estado.ajustes && estado.eje ? ajustesDelElemento(estado.eje, estado.ajustes.X, estado.identidad) ?? undefined : undefined,
    entradaReglas: estado.eje ? conGobierno(estado.eje) : false, genesisId: estado.eje?.genesisId,
    parteConfiguracion: estado.config || undefined, arranque: estado.arranque, ensayo: estado.arranque ? botonEnsayo() ?? undefined : undefined, copia: estado.copia, opinar: opinar.estadoDe(globalThis.localStorage),
    archivo: (id) => archivos.contenido(id), // los archivos adjuntos (el HTML del PV0 en su iframe aislado, las imágenes)
  };
}

/** «Retocar los textos de este libro» en la configuración (A20): el interruptor y la lista, solo para quien puede retocar. */
function retocarTextosDe() {
  const r = textosRetocados(estado.eje, estado.identidad);
  return r ? { ...r, activo: estado.retocar, idioma: idioma() } : undefined;
}

// ---------- «Reglas del libro» y «Ajustes de este elemento» (A21 y A23, tramo 2, paso 4; carta/reglas.js) ----------

/** ¿Firma mi cuenta con el guardián y su sesión no consta cerrada? Entonces «poner en vigor» lo hace sola la carta. */
const conGuardianAbierto = () => estado.cuenta?.guardian === true && !estado.cuenta.soloLeer && !estado.guardian.sesionCerrada;

/** La vista «Reglas del libro» de ahora: la lista, el cambio abierto o el formulario de proponer (dom.js htmlReglas). */
function reglasDe() {
  const r = estado.reglas;
  const lista = reglasDelLibro(estado.eje, estado.identidad);
  const cambio = r.cambio ? cambioDelLibro(estado.eje, r.cambio, estado.identidad) : null;
  let proponer = null;
  if (r.proponer) {
    const parametros = parametrosMovibles(estado.eje);
    const elegido = parametros.find((x) => x.posicion === r.proponer.posicion);
    proponer = { ...r.proponer, parametros, clase: r.proponer.clase ?? (elegido ? (elegido.gobierno ? 'gobierno' : 'corriente') : null) };
  }
  // Con el guardián, a quien propuso no se le enseña el botón: la carta lo pone en vigor sola (ponerEnVigorSolo).
  return { lista, cambio, proponer, salida: r.salida ? salidaSegura() : null, puedeSalir: Boolean(estado.eje.alta(estado.identidad)), guardian: conGuardianAbierto() && cambio?.autor === estado.identidad, aviso: r.aviso, motivos: r.motivos, exito: r.exito };
}

// ---------- «Irme con lo mío» (encargo «carta: irme con lo mío y el puente»; carta/puente.js) ----------

/** El nombre (y foco) del libro nuevo de la salida: «Lo mío, de <este libro>». */
const nombreDeLaSalida = () => t('salidaNombreNuevo', { libro: estado.cuenta?.nombre ?? String(estado.eje?.genesisId ?? '').slice(0, 8) });

/** La vista «Irme con lo mío» de ahora (puente.salidaDe, con mi libro nuevo si ya está abierto) y lo que cuesta su paso siguiente. */
function salidaDe() {
  const s = estado.reglas.salida;
  const nombre = nombreDeLaSalida();
  const vista = puente.salidaDe(estado.eje, estado.identidad, { punto: s.punto, nuevo: s.nuevo?.eje ?? null, nombre, idioma: idioma() });
  const p = vista?.siguiente;
  const ejeDelPaso = p?.libro === 'viejo' ? estado.eje : s.nuevo?.eje;
  // Enviar del viejo al nuevo pide en el viejo un enlace que cuente hacia el nuevo (puente.enlaceAlNuevo).
  const e = s.nuevo?.eje ? puente.enlaceAlNuevo(estado.eje, estado.identidad, s.nuevo.eje) : null;
  const enlace = e ? { hecho: Boolean(e.hecho), sinGenesis: e.sinGenesis, ofrecido: e.ofrecido, coste: puente.costeDelEnlaceAlNuevo(estado.eje, estado.identidad, s.nuevo.eje) } : null;
  return { vista, nombre, enlace, coste: p && p.que !== 'genesis' ? puente.costeDelPaso(ejeDelPaso, p) : null, nuevo: s.nuevo ? { nombre: s.nuevo.cuenta.nombre } : null, sinCuenta: !firmaLaCuenta(), ocupado: s.ocupado, buscando: s.buscando, bloqueado: s.bloqueado };
}

/** salidaDe, a salvo: si leer falla (un libro o un sello ajeno mal formado), la hoja lo dice y queda libre. */
function salidaSegura() {
  try {
    return salidaDe();
  } catch (e) {
    console.error(e);
    if (estado.reglas?.salida) estado.reglas.salida.ocupado = false;
    return { vista: null, error: String(e?.message ?? e) };
  }
}

/** Mi libro nuevo de la salida, si ya está en este dispositivo (puente.entradaDeLaSalida), abierto aparte: el abierto no cambia. */
async function nuevoDeLaSalida() {
  const s = estado.reglas?.salida;
  if (!s) return;
  try {
    if (s.nuevo || !estado.cuenta) return;
    const e = puente.entradaDeLaSalida(cuentas.cuentas(), { publica: estado.cuenta.publica, libro: estado.eje.genesisId, elemento: estado.cuenta.alta });
    if (!e) return;
    const r = await cuentas.abrirCuenta(e.alta, { guardian });
    if (estado.reglas?.salida !== s) return;
    if (r.eje) s.nuevo = { cuenta: r.cuenta, eje: r.eje, privada: r.privada };
    else {
      // Está y no se abre: no se ofrece otro génesis (nacería un segundo libro).
      s.bloqueado = true;
      estado.reglas.aviso = t('salidaNuevoNoAbre', { nombre: e.nombre ?? '', motivo: r.motivo ?? '' });
    }
  } catch (e) {
    s.bloqueado = true;
    if (estado.reglas) estado.reglas.aviso = t('salidaNoSeLee', { motivo: String(e?.message ?? e) });
  } finally {
    s.buscando = false;
  }
}

// ---------- el puente entre mis libros abiertos (encargo «carta: irme con lo mío y el puente»; carta/puente.js) ----------

/**
 * Mis otros libros enlazados con este, abiertos aparte para el puente (cuentas.abrirCuenta: el libro abierto no cambia y
 * no se abre otra sincronía), con sus sellos guardados puestos en su eje (puente.sellosGuardados).
 */
async function abrirLosEnlazados() {
  const p = estado.puente;
  if (!p || !estado.eje) return;
  for (const l of puente.enlacesDelLibro(estado.eje, estado.identidad, { mios: misEntradas(), idioma: idioma() })) {
    if (p.otros.has(l.libro)) continue;
    const r = await cuentas.abrirCuenta(l.alta, { guardian });
    if (estado.puente !== p) return;
    if (r.eje) puente.sellosGuardados(r.eje, l.alta);
    p.otros.set(l.libro, r.eje ? { cuenta: r.cuenta, eje: r.eje } : { motivo: r.motivo ?? '' });
  }
}

/** La hoja «Entre mis libros» de ahora (dom.js htmlPuente): todo de carta/puente.js, con mis libros de este dispositivo. */
function puenteDe() {
  const p = estado.puente;
  const o = { idioma: idioma() };
  const yo = estado.identidad;
  const mios = misEntradas();
  const enlaces = puente.enlacesDelLibro(estado.eje, yo, { mios, ...o }).map((l) => {
    const otro = p.otros.get(l.libro);
    return { ...l, abierto: Boolean(otro?.eje), noAbre: Boolean(otro && !otro.eje), motivo: otro?.motivo ?? null };
  });
  const cruza = firmaLaCuenta() ? puente.loQueCruza(estado.eje, yo, o) : [];
  let enviar = null;
  const c = p.enviar ? cruza.find((x) => x.serie === p.enviar.serie) : null;
  if (c) {
    const destinos = puente.destinosDeEnvio(enlaces, c);
    enviar = { ...c, destinos, elegido: p.enviar.enlace ?? destinos[0]?.enlace ?? null, cantidad: p.enviar.cantidad, soloANombre: mios.find((e) => e.libro === c.soloA)?.nombre ?? null, ocupado: p.ocupado };
  }
  let traer = null;
  const l = p.traer ? enlaces.find((x) => x.id === p.traer.enlace && x.traer) : null;
  const origen = l ? p.otros.get(l.libro)?.eje : null;
  if (origen) traer = { enlace: l.id, libro: l.nombre, ...puente.traibles(estado.eje, l.id, origen, o) };
  return { enlaces, cruza, enviar, traer, traidos: puente.traidosDelLibro(estado.eje, yo, { mios, ...o }), aviso: p.aviso, motivos: p.motivos, exito: p.exito };
}

/** puenteDe, a salvo: si leer falla (un libro o un sello ajeno mal formado), la hoja lo dice y queda libre. */
function puenteSeguro() {
  try {
    return puenteDe();
  } catch (e) {
    console.error(e);
    if (estado.puente) estado.puente.ocupado = false;
    return { enlaces: [], cruza: [], enviar: null, traer: null, traidos: [], aviso: t('puenteNoSeLee', { motivo: String(e?.message ?? e) }), motivos: estado.puente?.motivos ?? [], exito: null };
  }
}

/** Una escritura del puente: la hoja ocupada mientras dura y libre al acabar, pase lo que pase; lo que falle se dice. */
async function escribirEnElPuente(escribe, exito) {
  const p = estado.puente;
  if (!p) return;
  p.ocupado = true;
  try {
    await pintar();
    trasEscribirEnElPuente(await escribe(), exito);
  } catch (e) {
    p.motivos = [{ mensaje: enLlano(String(e?.message ?? e), e) }];
  } finally {
    p.ocupado = false;
  }
  pintar();
}

/** Tras escribir en el puente: guarda y sincroniza como cualquier escritura, y lo dice en la hoja. */
function trasEscribirEnElPuente(r, exito) {
  const p = estado.puente;
  if (r.asentado) {
    trasEscribir();
    marcarNuevos();
    if (p) Object.assign(p, { enviar: null, motivos: [], exito: exito + (r.asentado.firma ? ' ' + t('firmado') : '') });
  } else if (p) Object.assign(p, { exito: null, motivos: motivosConGuardian(r.motivos ?? []) });
}

/** Con qué se firma en mi libro nuevo: su clave (camino A) o el guardián, diciendo ese libro (camino B); null si no hay con qué. */
function firmarEnElNuevo(n) {
  if (n.privada) return cuentas.firmarCon(n.privada);
  const firmante = n.firmante ?? (estado.cuenta?.guardian === true && guardian ? firmanteDeCuenta(guardian, estado.cuenta.publica, { eje: () => n.eje, dialogo: true }) : null);
  return firmante ? autoridad.firmanteDeEventos(firmante, { publica: estado.cuenta.publica }) : null;
}

/** Lo escrito en el formulario de proponer: { titulo, explicacion, posicion, valor, pieza }. */
function valoresDePropuesta(form) {
  const v = (n) => form?.querySelector?.('[name="' + n + '"]')?.value;
  return { titulo: v('titulo') ?? '', explicacion: v('explicacion') ?? '', posicion: v('posicion') || null, valor: v('valor'), pieza: v('pieza') ?? '' };
}

/**
 * Con la sesión del guardián abierta (diseño §8): los cambios que propuse, aprobados y con la prueba ya al nivel pedido, se
 * ponen en vigor solos (el guardián pide su diálogo: carta/anfitrion.js segundoFactorDe). Una vez por aprobación.
 */
const intentadosEnVigor = new Set();
async function ponerEnVigorSolo() {
  if (!conGuardianAbierto() || !estado.reglas || !estado.eje || !(await sesionAbierta(guardian, estado.cuenta.publica))) return;
  const eje = estado.eje;
  const yo = estado.identidad;
  for (const c of reglasDelLibro(eje, yo).cambios) {
    if (c.estado !== 'aprobado' || c.autor !== yo || estado.eje !== eje) continue;
    const d = cambioDelLibro(eje, c.id, yo);
    if (!d?.poner?.ofrecida || intentadosEnVigor.has(d.poner.X)) continue;
    intentadosEnVigor.add(d.poner.X);
    const r = await actuarEnCambio(eje, c.id, 'poner', yo, firmarCon(yo));
    if (!estado.reglas) return;
    if (r.asentado) {
      trasEscribir();
      estado.reglas.exito = t('reglasHecho', { accion: t('reglasAccion_poner'), id: r.asentado.id.slice(0, 8) });
      marcarNuevos();
    } else {
      estado.reglas.motivos = motivosConGuardian(r.motivos ?? []);
    }
    pintar();
  }
}

// ---------- la guía del PV9 ----------

const almacenLocal = () => { try { return globalThis.localStorage; } catch { return undefined; } };
/** El alta de quien mira: por ella van la conversación (agram.guia.<alta>) y la clave de la API (agram.ia.<alta>). */
const altaDeGuia = () => (estado.eje && estado.identidad ? estado.eje.alta(estado.identidad)?.id ?? null : null);

/** Descarga un archivo { nombre, tipo, contenido } (el mismo gesto que el de exportar opiniones; con su tipo, no solo JSON). */
function descargarArchivo({ nombre, tipo, contenido }) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Dónde se guardan las propuestas importadas: por cuenta (su alta) o «ejemplo» (agram.propuestas.<alta|ejemplo>). */
const dondePropuestas = () => (estado.cuenta ? estado.cuenta.alta : 'ejemplo');
const propuestasPendientes = () => (estado.eje && estado.identidad ? externa.leerPropuestas(almacenLocal(), dondePropuestas()) : []);

/** Lo que pinta htmlGuia: la conversación de quien mira (cargada al cambiar de alta), lo que está pasando y las preguntas hechas de la época. */
function datosGuia() {
  const alta = altaDeGuia();
  if (!alta) return null;
  const g = estado.guia;
  const aj = guia.ajustes(estado.eje, estado.identidad);
  if (g.alta !== alta) Object.assign(g, { alta, historial: guia.cargarHistorial(almacenLocal(), alta, aj.historial), borrador: '', pensando: false, pendiente: '', error: '' });
  // Las propuestas importadas: las que tratan de este registro están en el camino; aquí, el resto y las que no se entienden.
  const evaluadas = externa.evaluarTodas(estado.eje, estado.identidad, propuestasPendientes());
  const propuestas = {
    aqui: evaluadas.filter((e) => e.sobre === estado.foco.X).length,
    fuera: evaluadas.filter((e) => e.sobre !== estado.foco.X).map((e) => (e.sobre ? { ...e, sobreTexto: ceroDe(estado.eje, e.sobre, { idioma: idioma() }, contrato.legible(estado.eje, { ref: e.sobre }, null, { idioma: idioma() }).texto) } : e)),
  };
  return { historial: g.historial, pensando: g.pensando, pendiente: g.pendiente, error: g.error, borrador: g.borrador, preguntas: guia.preguntasRapidas(estado.eje, idioma()), via: aj.via, ejemplo: !estado.cuenta, propuestas, ...(retoques() ? { core: datosCore() } : {}) };
}

// ---------- hablar con Core (solo con el servidor de retoques, retoques/) ----------

/** El cliente que inyecta el servidor local de retoques (retoques/cliente.js), si está y tiene llave; si no, null y la carta queda como siempre. */
const retoques = () => (globalThis.agramRetoques?.tieneLlave?.() ? globalThis.agramRetoques : null);
const almacenSesion = () => { try { return globalThis.sessionStorage; } catch { return undefined; } };
/** El libro en pantalla, para el sitio guardado: el alta de la cuenta o «ejemplo». */
const libroDeAhora = () => (estado.cuenta ? estado.cuenta.alta : 'ejemplo');

/** Lo que pinta htmlCore: la conversación (cargada la primera vez; lo que quedó a medias al recargar, cortado) y lo señalado. */
function datosCore() {
  const c = estado.core;
  if (!c.turnos) {
    c.turnos = guia.cargarCore(almacenLocal()).map((m) => (m.role === 'core' && !m.hecho ? { ...m, hecho: true, error: m.error || t('coreCortado') } : m));
  }
  return { con: estado.guia.con, turnos: c.turnos, pensando: c.pensando, error: c.error, borrador: c.borrador, senalado: c.senalado, senalando: c.senalando, fondo: c.fondo, fondoAbierto: c.fondoAbierto, ensayo: botonEnsayo() };
}

/** El botón del ensayo (panel Core y bienvenida): { entrando, error } si hay que entrar en él, o null. */
const botonEnsayo = () => (hayQueEntrarEnElEnsayo() ? { entrando: estado.core.entrandoEnsayo, error: estado.core.errorEnsayo } : null);

/** Repinta lo que enseña el botón del ensayo: la bienvenida (sin libro o con ella abierta), si no la guía. */
const pintarEnsayo = () => (estado.arranque || !estado.eje ? pintar() : pintarGuia());

/** ¿Sirve el servidor de retoques el libro del roadmap (--ensayo) y esta pantalla aún no tiene esa cuenta? */
const hayQueEntrarEnElEnsayo = () => Boolean(estado.core.ensayo?.alta) && !cuentas.cuentas().some((x) => x.alta === estado.core.ensayo.alta);

/** El ensayo, según el servidor de retoques (GET /retoques/estado: ensayo y el alta de la dueña). */
async function refrescarEnsayo() {
  const r = retoques();
  if (!r?.estado) return;
  let e = null;
  try { e = await r.estado(); } catch { /* sin servidor: sin botón */ }
  estado.core.ensayo = e?.ensayo === true && typeof e.ensayoAlta === 'string' ? { alta: e.ensayoAlta } : null;
  pintarEnsayo();
}

/** La lista de cambios de fondo del servidor de retoques (al cargar y al acabar cada respuesta de Core). */
async function refrescarFondo() {
  const r = retoques();
  if (!r?.fondo) return;
  const f = guia.fondoDe(await r.fondo());
  if (!f) return;
  estado.core.fondo = f;
  pintarGuia();
}

/** Repinta la guía en el próximo cuadro (los trozos de Core llegan muy seguidos). */
let marcoGuia = 0;
const pintarGuiaPronto = () => { if (!marcoGuia) marcoGuia = requestAnimationFrame(() => { marcoGuia = 0; pintarGuia(); }); };

/** El sitio de la carta (libro, foco, punto de vista, tamaños, con quién habla el PV9), para volver a él tras recargar. */
function guardarSitioDeRetoques() {
  if (!retoques() || !estado.eje || !estado.foco.X) return;
  guia.guardarSitio(almacenSesion(), guia.sitioDe(estado, { libro: libroDeAhora(), con: estado.guia.con }));
}

/** Tras recargar con el servidor de retoques: el mismo foco, punto de vista y tamaños si es el mismo libro, y el PV9 donde estaba. */
async function volverAlSitio() {
  const s = guia.leerSitio(almacenSesion());
  if (!s || s.libro !== libroDeAhora() || !estado.eje?.obtener(s.foco.X)) return;
  estado.foco = { ...s.foco };
  estado.niveles = s.niveles;
  estado.profundidad = s.profundidad;
  estado.paginas = s.paginas;
  estado.guia.con = s.con;
  await pintar();
  if (s.con === 'core') raiz.querySelector('[data-guia]')?.scrollIntoView?.({ block: 'nearest' });
}

/**
 * «Señalar»: con el botón pulsado, el siguiente toque en la carta (fuera del PV9) no hace lo suyo: se clasifica como en
 * «opinar» (opinar.clasificar) y va, como etiqueta, con el próximo mensaje a Core. Los eventos se paran en captura, como
 * hace opinar.instalar.
 */
function instalarSenalar() {
  const tipos = ['click', 'dblclick', 'contextmenu', 'mousedown', 'pointerdown', 'pointerup', 'pointermove', 'pointercancel'];
  const alEvento = (e) => {
    if (!estado.core.senalando) return;
    const objetivo = e.target;
    if (!objetivo?.closest || !raiz.contains(objetivo) || objetivo.closest('.guia')) return;
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    if (e.type === 'click' || e.type === 'mousedown' || e.type === 'contextmenu' || e.type === 'dblclick') e.preventDefault();
    if (e.type !== 'click') return;
    const nodo = opinar.clasificar(objetivo);
    const etiqueta = opinar.legible(nodo, opinar.entornoDe(objetivo));
    estado.core.senalado = [...estado.core.senalado, { nodo, etiqueta }].slice(-5);
    estado.core.senalando = false;
    pintarGuia();
  };
  for (const tipo of tipos) document.addEventListener(tipo, alEvento, true);
}

/** Repinta solo la sección de la guía (repintarlo todo borraría lo que se está escribiendo y el desplazamiento). */
function pintarGuia() {
  const el = raiz.querySelector('[data-guia]');
  if (!el) return;
  const campo = el.querySelector('[data-guia-pregunta]');
  if (campo && !estado.guia.pensando && document.activeElement === campo) estado.guia.borrador = campo.value;
  const nuevo = htmlGuia(datosGuia());
  for (const g of raiz.querySelectorAll('[data-guia]')) g.outerHTML = nuevo;
  raiz.querySelector('.guia-historial')?.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
}

/** Los ajustes de la guía para el formulario de configuración: los campos de la época y la clave de la API de este navegador. */
function guiaAjustesDe() {
  const a = guia.ajustesEditables(estado.eje, estado.identidad);
  return a ? { ...conEtiquetasLlanas(a, idioma()), claveIa: guia.claveIa(almacenLocal(), altaDeGuia()) ?? '' } : undefined;
}

/**
 * Ancla el aro abierto al elemento pulsado (VG: «el aro se abre sobre el elemento»). Solo en Mapped y si hay ancla (la caja del elemento
 * al abrirlo, de gestos.js): un position:fixed calculado aquí con las medidas del propio CSS (--sitio-ancho, --sitio-alto, --hueco), con el
 * centro del tamaño del elemento (no menos que el mínimo del CSS), y recortado para que no se salga de la ventana. En el móvil apilado
 * no hay sitio: sigue centrado (CSS). Nada de esto está en el árbol ni en los datos.
 */
function situarAro() {
  const fondo = raiz.querySelector('.aro-fondo');
  const aro = fondo?.querySelector('.aro');
  const ancla = estado.aro?.ancla;
  if (!aro || !ancla || !enMapped()) return;
  // Primero la clase: sin ella el CSS del aro centrado (min(112px, 29vw)) no es un número y las medidas saldrían a 0.
  fondo.classList.add('anclado');
  aro.classList.add('anclado');
  const estilo = getComputedStyle(aro);
  const px = (v) => parseFloat(estilo.getPropertyValue(v)) || 0;
  const sitioAncho = px('--sitio-ancho');
  const sitioAlto = px('--sitio-alto');
  const hueco = px('--hueco');
  const vw = document.documentElement.clientWidth || globalThis.innerWidth || 0;
  const vh = globalThis.innerHeight || 0;
  const MARGEN = 8;
  // el centro es el elemento, recortado a lo que deja libre la ventana tras los sitios de los lados (y no menos que el mínimo del CSS)
  const caja = (desde, largo, total, sitio, minimo) => {
    const ini = Math.max(desde, MARGEN + sitio + hueco);
    const fin = Math.min(desde + largo, total - MARGEN - sitio - hueco);
    const tam = Math.max(fin - ini, minimo);
    return [Math.round(fin - ini >= minimo ? ini : (ini + fin) / 2 - tam / 2), Math.round(tam)];
  };
  const [centroX, centroAncho] = caja(ancla.x, ancla.ancho, vw, sitioAncho, px('--centro-ancho'));
  const [centroY, centroAlto] = caja(ancla.y, ancla.alto, vh, sitioAlto, px('--centro-alto'));
  const ancho = centroAncho + 2 * sitioAncho + 2 * hueco;
  const alto = centroAlto + 2 * sitioAlto + 2 * hueco;
  const dentro = (v, tam, total) => Math.round(Math.min(Math.max(v, MARGEN), Math.max(MARGEN, total - tam - MARGEN)));
  aro.style.setProperty('--centro-ancho', centroAncho + 'px');
  aro.style.setProperty('--centro-alto', centroAlto + 'px');
  aro.style.left = dentro(centroX - sitioAncho - hueco, ancho, vw) + 'px';
  aro.style.top = dentro(centroY - sitioAlto - hueco, alto, vh) + 'px';
}

async function pintar() {
  if (pintando) { pintando.otra = true; return pintando.promesa; }
  const marca = { otra: false };
  pintando = marca;
  marca.promesa = (async () => {
    let a = null;
    estado.formato = formatoDe(); // los criterios de formato del BTML del reverso
    if (!estado.eje) usarRetoques(null); // sin libro, los textos de la carta tal como nacieron (arbol instala los de cada libro)
    if (estado.eje) {
      try {
        a = await arbol(estado, estado.eje, estado.identidad, medidas(), { sugerencias: sugerenciasDelCamino(), pasosDeLaGuia: pasosDeLaGuiaDelFoco, firmar: firmarParaVer(estado.identidad), ...(estado.cuenta ? { libros: librosDelArbol() } : {}) });
      } catch (e) {
        a = { vacio: true, avisos: [t('noSePinta', { motivo: e.message ?? e })] };
        console.error(e);
      }
    }
    if (a && !a.vacio) a.guia = datosGuia();
    const extra = extraDe();
    limpiarLottie();
    for (const [k, v] of Object.entries(variablesDeColor(a?.colores))) document.documentElement.style.setProperty(k, v);
    // Sequenced: la tarjeta del foco se queda donde estaba al repintar (lo que crece encima, el pasado, no la mueve).
    const antes = enSecuencia() ? raiz.querySelector('.secuencia-ahora > .nucleo')?.getBoundingClientRect().top ?? null : null;
    const mismoFoco = ultimo?.X === a?.X;
    ultimo = a;
    document.documentElement.classList.toggle('mapped', enMapped());
    raiz.innerHTML = html(a, extra);
    situarAro();
    if (enSecuencia()) colocarSecuencia(antes, mismoFoco);
    lineaPintada = htmlSincronia(extra.sincronia);
    limpiarLottie = a?.animado ? trasPintar(raiz) : () => {};
    // Lo nuevo se anima una vez: en cuanto se ha pintado con lottie-web, deja de ser nuevo (si lottie aún no está, el
    // repintado al cargarlo lo anima).
    if (a?.animado && globalThis.lottie) estado.nuevos = new Set();
    globalThis.__carta = { arbol: a, vivas: () => limpiarLottie.vivas?.() ?? 0 }; // para medir (pruebas de rendimiento)
    gestos?.observar();
    if (estado.foco.X && !estado.cuenta) guardarLocal(CLAVE_FOCO, estado.foco.X);
    document.documentElement.classList.toggle('animado', Boolean(a?.animado));
    if (a?.animado) cargarLottie();
  })().finally(() => {
    const otra = marca.otra;
    pintando = null;
    if (otra) pintar();
  });
  return marca.promesa;
}

/**
 * Sequenced: el hilo es el scroll. Al llegar a un foco, la tarjeta arriba (bajo el personaje del 0) y el pasado encima, fuera de la
 * pantalla; al repintar el mismo foco, la tarjeta donde estaba; tras tocar un dígito, su fila (o su zona del hilo) a la vista.
 */
function colocarSecuencia(antes, mismoFoco) {
  const nucleo = raiz.querySelector('.secuencia-ahora > .nucleo');
  if (!nucleo) return;
  const barra = raiz.querySelector('.cero-columna')?.offsetHeight ?? 0;
  const ahora = nucleo.getBoundingClientRect().top;
  if (antes !== null && mismoFoco) window.scrollBy({ top: ahora - antes, behavior: 'instant' });
  else {
    window.scrollTo({ top: Math.max(0, window.scrollY + ahora - barra), behavior: 'instant' });
    // Al llegar a un foco, la tarjeta se queda arriba aunque lo de encima (el pasado, las fuentes, las imágenes) acabe de
    // medirse después: se recoloca mientras nadie haya movido el scroll (repaso beta #26: abría a mitad del hilo del pasado).
    let puesto = window.scrollY;
    const recolocar = () => {
      const n = raiz.querySelector('.secuencia-ahora > .nucleo');
      if (!n || Math.abs(window.scrollY - puesto) > 1 || irTrasPintar !== null) return;
      const dif = n.getBoundingClientRect().top - (raiz.querySelector('.cero-columna')?.offsetHeight ?? 0);
      if (Math.abs(dif) > 2) { window.scrollTo({ top: Math.max(0, window.scrollY + dif), behavior: 'instant' }); puesto = window.scrollY; }
    };
    globalThis.requestAnimationFrame?.(() => globalThis.requestAnimationFrame?.(recolocar));
    globalThis.document?.fonts?.ready?.then?.(recolocar);
  }
  const ir = irTrasPintar;
  irTrasPintar = null;
  if (ir === null) return;
  const zona = raiz.querySelector(`[data-hilo-zona="${ir}"]`);
  const fila = raiz.querySelector(`[data-fila-pv="${ir}"]`);
  if (zona) zona.scrollIntoView({ block: zona.classList.contains('zona-antes') ? 'end' : 'start', behavior: 'smooth' });
  else if (fila) {
    const y = window.scrollY + fila.getBoundingClientRect().top - barra - 4;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    fila.querySelector('[data-fila]')?.focus({ preventScroll: true });
  }
}

function leerTexto(X) {
  try {
    return leerEvento(estado.eje, X);
  } catch (e) {
    return t('noSeLee', { motivo: e.message ?? e });
  }
}

/**
 * lottie-web se carga solo si hace falta (render animado), del propio origen: va dentro del repositorio
 * (carta/vendor/lottie.min.js, lottie-web 5.12.2; carta/vendor/LEEME.md), con su SRI, el mismo que tenía en cdnjs.
 */
let lottiePedido = false;
function cargarLottie() {
  if (lottiePedido || globalThis.lottie) return;
  lottiePedido = true;
  const s = document.createElement('script');
  s.src = new URL('./vendor/lottie.min.js', import.meta.url).href;
  s.integrity = 'sha512-jEnuDt6jfecCjthQAJ+ed0MTVA++5ZKmlUcmDGBv2vUI/REn6FuIdixLNnQT+vKusE2hhTk2is3cFvv5wA+Sgg==';
  s.referrerPolicy = 'no-referrer';
  s.onload = () => pintar();
  s.onerror = () => { estado.aviso = t('sinLottie'); pintar(); };
  document.head.appendChild(s);
}

function limpiarMensajes() {
  estado.aviso = '';
  estado.exito = '';
  if (estado.cuenta?.firmante) estado.cuenta.firmante.error = null; // un rechazo del guardián de antes no se dice en lo siguiente
}

/** Enfocar un registro (o un PV de un registro como foco). */
function irA(X, pv = 0) {
  if (!estado.eje?.obtener(X)) return;
  const cambia = estado.foco.X !== X;
  estado.foco = { X, pv };
  if (cambia) { estado.niveles = {}; estado.recientes = []; estado.paginas = {}; estado.profundidad = {}; estado.aro = null; estado.formulario = null; }
  limpiarMensajes();
  tocar(X, cambia ? null : 'pv ' + pv);
  marcarNuevos();
  pintar();
}

/** La hora de escribir en el libro abierto (carta.js horaDeEscribir, el reloj único), como opción { t } (vacía sin modo). */
const horaDe = () => { const t = horaDeEscribir(estado.eje); return t ? { t } : {}; };

/** Un eje nuevo en pantalla (una cuenta o un ejemplo): se olvida lo visto y lo abierto. */
function cambiarDeEje(eje, identidad) {
  guardarLibroLocal();
  estado.eje = eje;
  estado.identidad = identidad;
  estado.foco = { X: null, pv: 0 };
  estado.niveles = {};
  estado.recientes = [];
  estado.paginas = {};
  estado.profundidad = {};
  estado.aro = null;
  estado.formulario = null;
  estado.sitio = null;
  estado.rosetones = {};
  estado.config = false;
  estado.retocar = false;
  estado.retoque = null;
  estado.reglas = null;
  estado.ajustes = null;
  estado.vistos = new Set();
  estado.nuevos = new Set();
  estado.arranque = null;
  estado.copia = null;
  estado.sincronia = sinc.soltar(estado.sincronia, estado.cuenta?.alta); // la del libro de antes se suelta (la del nuevo se abre en entrarCon)
  estado.libroPrivado = null;
  estado.puente = null;
  estado.lineaSincronia = null;
  limpiarMensajes();
}

/** Descarga un texto como archivo (GitHub Pages: un enlace con `download` y un blob). */
function descargar(texto, nombre) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- varios libros (A24; carta/libros.js) ----------

/** Las entradas con su etiqueta como nombre (dos libros con el mismo nombre se distinguen con ocho letras de su libro). */
function conEtiquetas(lista) {
  const e = libros.etiquetas(lista);
  return lista.map((c) => ({ ...c, nombre: e.get(c.alta) ?? c.nombre }));
}
/** Las entradas de mi clave en este dispositivo (la del libro abierto). */
const misEntradas = () => (estado.cuenta ? cuentas.cuentas().filter((c) => cuentas.mismaClave(c.publica, estado.cuenta.publica)) : []);
/** ¿Firma la cuenta abierta? (una del navegador con su clave, o una del guardián que no está solo para leer) */
const firmaLaCuenta = () => Boolean(estado.cuenta && (estado.cuenta.guardian === true ? estado.cuenta.firmante : estado.cuenta.privada));
/** Lo que el árbol sabe de mis libros (carta.js opciones.libros): las entradas de mi clave, si puedo abrir uno privado y si el anfitrión da claves. */
// ---------- las zonas de la cara y la guía mínima (carta/guias.js; DISENO_ZONAS_GUIA §4) ----------

/** Los ejes de mis otros libros en este dispositivo, leídos una vez mientras su texto guardado no cambie. */
const librosDelDispositivo = new guiasCarta.LibrosDelDispositivo({ clave: cuentas.CLAVES.eje, restaurar: persistencia.restaurar });
/** De qué libro (el alta de su entrada; null: el abierto) es la guía de cada paso que salió en el 9: a ella se vuelve al tocarlo. */
const guiaDePaso = new Map();
/** El libro abierto como lo leen las guías: su alta (null en un ejemplo), su eje (lo último y no lo guardado) y quién soy en él. */
const libroAbierto = () => ({ alta: estado.cuenta?.alta ?? null, eje: estado.eje, yo: estado.identidad ?? null });

/**
 * El gancho `sugerencias` del camino: las propuestas importadas (carta/externa.js) y los pasos de mis guías (la tercera
 * fuente con las guías de los libros de mi clave en este dispositivo, con sus topes: carta/guias.js). En un ejemplo, las
 * guías del propio libro.
 */
function sugerenciasDelCamino() {
  const importadas = externa.sugerenciasDe(propuestasPendientes());
  const entradas = estado.cuenta ? misEntradas() : [{ alta: null }];
  const deGuias = guiasCarta.sugerenciasDeMisGuias({ entradas, libros: librosDelDispositivo, actual: libroAbierto(), idioma: idioma(), deDonde: (id, alta) => guiaDePaso.set(id, alta) });
  return async (eje, ev, yo) => [...((await importadas(eje, ev, yo)) ?? []), ...(await deGuias(eje, ev, yo))];
}

/** El camino de la guía X en su libro (si X es una guía): sus pasos con el estado leído en cada libro de este dispositivo. */
async function pasosDeLaGuiaDelFoco(eje, X) {
  if (!contrato.pasosDeGuia(eje, X).length) return null;
  const entradas = estado.cuenta ? misEntradas() : [];
  const yoDe = (entrada) => (entrada.alta === (estado.cuenta?.alta ?? null) ? estado.identidad : entrada.identidad ?? null);
  return guiasCarta.estadoDeLosPasos(eje, X, { entradas, libros: librosDelDispositivo, actual: libroAbierto(), yoDe, decir: (k, p) => t(k, p), opciones: { idioma: idioma() } });
}

/**
 * Seguir un paso de una guía (tocarlo en el 9, en el camino de su guía o en una zona que lleva a él): va al libro del
 * paso (si está en este dispositivo; si no, lo dice) y a su registro (sin registro, mi alta en ese libro) y abre el
 * formulario normal de su acción con los parámetros rellenos y editables, como «modificar» de una propuesta importada,
 * con lo que ahora no pasaría dicho en él. Un paso inválido sale con su motivo. Nunca firma, escribe ni lanza: lanzar es
 * el gesto de siempre. `guiaAlta`: el alta del libro de la guía (null: el abierto).
 */
async function seguirPasoDeGuia(guiaAlta, pasoId) {
  limpiarMensajes();
  const abierto = libroAbierto();
  const ejeGuia = guiaAlta === null || guiaAlta === abierto.alta ? abierto.eje : await librosDelDispositivo.eje(guiaAlta);
  const hallado = ejeGuia ? guiasCarta.pasoDelLibro(ejeGuia, pasoId) : null;
  if (!hallado) { estado.aviso = t('guiaPasoNoEsta'); pintar(); return; }
  // Solo mis guías (revisión de seguridad): quién soy en el libro de la guía, y que la guía sea mía. Antes de cambiar de
  // libro o abrir nada; venga del 9, del camino de la guía o de una zona, todo pasa por aquí.
  const yoEnLaGuia = guiaAlta === null || guiaAlta === abierto.alta ? abierto.yo : misEntradas().find((e) => e.alta === guiaAlta)?.identidad ?? null;
  if (!guiasCarta.esMiGuia(hallado, yoEnLaGuia)) { estado.aviso = t('guiaPasoAjeno'); pintar(); return; }
  const { paso, guia: deLaGuia } = hallado;
  const libro = paso.libro ?? ejeGuia.genesisId;
  if (libro !== estado.eje.genesisId) {
    const entrada = await guiasCarta.libroDeEntrada(libro, { entradas: estado.cuenta ? misEntradas() : [], libros: librosDelDispositivo, actual: abierto });
    if (!entrada) { estado.aviso = t('guiaPasoInvalidoPor', { motivo: t('guiaLibroNoEsta') }); pintar(); return; }
    if (!(await entrarEnCuenta(entrada.alta))) return;
  }
  const yo = estado.identidad;
  const X = paso.sobre ?? estado.eje.alta(yo)?.id ?? null;
  if (!X || !estado.eje.obtener(X)) { estado.aviso = t('guiaPasoInvalidoPor', { motivo: t('guiaPasoSinRegistro') }); pintar(); return; }
  // La guía, vista desde el libro donde se hace el paso (el mismo eje si es el mismo libro): sus parámetros, leídos con su tipo.
  const guiaEje = ejeGuia.genesisId === estado.eje.genesisId ? estado.eje : ejeGuia;
  const s = contrato.sugerenciasDeGuia(guiaEje, estado.eje, X, yo, { idioma: idioma(), autor: hallado.autor }).find((x) => x.id === pasoId);
  irA(X, 0);
  if (!s) { estado.aviso = t('guiaPasoNoEsta'); pintar(); return; }
  if (s.invalida) { estado.aviso = t('guiaPasoInvalidoPor', { motivo: s.invalida }); pintar(); return; }
  const v = await validarSinFirmar(estado.eje, s.sobre, s.plantilla, s.parametros ?? {}, yo);
  estado.formulario = { X: s.sobre, accion: s.plantilla, valores: s.parametros ?? {}, motivos: v.ok ? [] : motivosConGuardian(motivosEnLlano(v.motivos, estado.eje)), resultado: null };
  estado.aro = null;
  estado.exito = t('guiaPasoAbierto', { guia: deLaGuia.titulo ?? '' });
  tocar(s.sobre, 'lanzar ' + canonicoDe(s.plantilla));
  pintar();
}

const librosDelArbol = () => ({ propios: misEntradas(), puedeAbrir: firmaLaCuenta(), puedeAnunciar: estado.cuenta?.guardian === true && Boolean(estado.cuenta.firmante) && puedeDarClavesDeLinea(guardian) });
/** ¿Tiene destino de sincronía ese libro? El abierto, si sincroniza; los demás, si guardaron su estado de sincronía y tienen clave de lectura. */
const conDestino = (alta) => (alta === estado.cuenta?.alta ? Boolean(estado.sincronia) : Boolean(cuentas.claveLectura(alta) && cuentas.estadoSincronia(alta)?.url));
/** Lo que lista «Tus libros» (libros.tusLibros). */
const tusLibrosDe = () => libros.tusLibros(cuentas.cuentas(), { publica: estado.cuenta?.publica, abierto: estado.cuenta?.alta, conDestino });
/** El firmante de eventos de la cuenta abierta (lo que firma en el grande al anunciar). */
const firmarEnElAbierto = () => firmarCon(estado.identidad);

// ---------- mi cuenta ----------

/**
 * Entra en una cuenta guardada en este navegador: su eje, su clave, mi alta como foco (o `foco`, el registro donde se llega
 * al entrar o volver entre libros, si está en ese eje). false (y el motivo en el aviso) si no se abre.
 */
async function entrarEnCuenta(alta, { foco = null } = {}) {
  let r = await cuentas.abrirCuenta(alta, { guardian });
  // Sin eje aquí: el del libro compartido, si la clave cuadra (la privada, o la pública de una cuenta del guardián).
  if (!r.eje && (r.privada || (r.cuenta?.guardian === true && r.publica))) r = await ejeDesdeElLibro(r);
  if (!r.eje) {
    const nombre = r.cuenta?.nombre ?? alta.slice(0, 8);
    estado.aviso = r.antigua ? t('cuentaDeFirmasAntiguas', { nombre }) : t('cuentaNoAbre', { nombre, motivo: r.motivo });
    // Una cuenta de antes de las firmas BIP-340 no se abrirá nunca: se ofrece borrarla (con su confirmación).
    if (r.antigua && (await confirmarEnPagina(t('olvidarAntiguaConfirmar', { nombre })))) {
      cuentas.olvidarCuenta(alta, [r.cuenta.identidad]);
      estado.aviso = t('cuentaOlvidada', { nombre });
    }
    estado.arranque = { modo: 'menu' };
    await pintar();
    return false;
  }
  entrarCon(r);
  estado.guardado = t('cuentaAbierta', { nombre: r.cuenta.nombre, cuantos: r.eje.orden.length });
  irA(foco && r.eje.obtener(foco) ? foco : r.cuenta.alta);
  return true;
}

/**
 * Restaura la copia de todos mis libros (A24, §4.7): cada libro como la copia de uno (cuentas.restaurarTodos), lo guarda
 * aquí sin bajar nada del servidor (la sincronía lo pone al día al entrar) y entra en el primero que no cuelga de otro.
 * Los que fallan se dicen, con su motivo, y no paran a los demás.
 */
async function restaurarTodos(ar, texto, frase) {
  try {
    const { restaurados, fallidos } = await cuentas.restaurarTodos(texto, frase);
    for (const x of restaurados) await cuentas.guardarCuenta(await cuentas.conGuardian(x, guardian), { recordar: false });
    const noVan = fallidos.length ? t('librosNoRestaurados', { lista: fallidos.map((f) => t('libroFallido', { posicion: f.posicion, nombre: f.nombre ?? f.libro ?? '', motivo: f.motivo })).join('; ') }) : '';
    if (!restaurados.length) { ar.ocupado = false; ar.motivos = [{ mensaje: noVan }]; await pintar(); return; }
    const primero = restaurados.find((x) => !x.cuenta.cuelga) ?? restaurados[0];
    if (!(await entrarEnCuenta(primero.cuenta.alta))) return;
    estado.exito = t('librosRestaurados', { cuantos: restaurados.length });
    estado.aviso = noVan;
    pintar();
  } catch (e) {
    ar.ocupado = false;
    ar.motivos = [{ mensaje: String(e?.message ?? e) }];
    await pintar();
  }
}

/**
 * Una cuenta cuyo eje no está en este navegador: si tiene clave de lectura y se sabe dónde se comparte (el estado
 * guardado de su sincronía), el eje nace del génesis del servidor (sinc.ejeDelServidor). Si no se puede, la cuenta
 * no se abre, como hoy, con el motivo.
 */
async function ejeDesdeElLibro(r) {
  const claveLectura = cuentas.claveLectura(r.cuenta.alta);
  const datos = cuentas.estadoSincronia(r.cuenta.alta);
  if (!claveLectura || typeof datos?.url !== 'string' || typeof datos?.eje !== 'string') return r;
  const d = await sinc.ejeDelServidor({ cuenta: r.cuenta, url: datos.url, eje: datos.eje, claveLectura });
  if (!d.eje) return { ...r, motivo: r.motivo + ' · ' + t('noBajaElEje', { motivo: d.motivo }) };
  cuentas.guardarEje(r.cuenta, d.eje);
  cuentas.guardarEstadoSincronia(r.cuenta.alta, d.sincronia.serializar());
  return { ...r, eje: d.eje };
}

/**
 * Deja como eje en pantalla el de una cuenta abierta, creada o restaurada ({ cuenta, eje, privada }), con su sincronía.
 * Una cuenta del guardián (camino B) lleva su firmante, el único con que firma (sobre el eje en pantalla), o, si el
 * guardián de este equipo no la tiene (`soloLeer`), ninguno: solo se lee, y lo dice el aviso persistente.
 */
function entrarCon({ cuenta, eje, privada, soloLeer }) {
  cambiarDeEje(eje, cuenta.identidad);
  usarReloj('libro');
  estado.cuenta = { ...cuenta, privada };
  estado.guardian = { sesionCerrada: false, pendiente: null, abriendo: false, criterios: null, noAbrio: false };
  if (cuenta.guardian === true) {
    estado.cuenta.soloLeer = Boolean(soloLeer) || !guardian;
    estado.cuenta.firmante = estado.cuenta.soloLeer ? null : firmanteDeCuenta(guardian, cuenta.publica, { eje: () => estado.eje });
  }
  cuentas.recordarUltima(cuenta.alta);
  abrirLibroLocal();
  abrirSincronia();
  void criteriosAlGuardian();
  if (emparejado.emparejamiento) void asentarDelEmparejamiento(); // tras recargar: lo firmado por la app que falta en este libro
}

/** Entra en el ejemplo: el eje guardado en este navegador (si sus claves son las de esta sesión) o uno nuevo. */
async function entrarEnEjemplo() {
  usarReloj('ejemplo');
  estado.claves = await cargarClaves();
  let cargado = await persistencia.cargarLocal(CLAVE_EJE);
  if (cargado && estado.claves.casa && JSON.stringify(cargado.clave('casa')) !== JSON.stringify(estado.claves.casa.publica)) cargado = null; // claves de otra sesión
  let foco;
  const yo = leerLocal(CLAVE_YO) ?? 'huesped';
  if (cargado) {
    cambiarDeEje(cargado, yo);
    estado.cuenta = null;
    foco = restaurarEjemplo(cargado, estado) ?? cargado.genesisId;
    estado.guardado = t('cargadoDelNavegador', { cuantos: cargado.orden.length });
  } else {
    const apartado = persistencia.apartarLocal(CLAVE_EJE);
    cambiarDeEje(null, yo);
    estado.cuenta = null;
    const nuevo = await crearEjemplo(estado);
    estado.eje = nuevo.eje;
    foco = nuevo.foco;
    guardar();
    if (apartado) estado.aviso = t('ejeApartado', { clave: CLAVE_EJE + '.anterior' });
  }
  if (!estado.eje.identidades().includes(estado.identidad)) estado.identidad = estado.eje.identidades()[0];
  cuentas.recordarUltima(EJEMPLO);
  abrirLibroLocal();
  estado.foco = { X: foco, pv: 0 };
  tocar(foco, null);
  marcarNuevos();
  await pintar();
}

/** Abre el selector de archivos para una acción que pide uno (los tipos que admite la función `archivos`). */
function elegirArchivo(X, accion, campos) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = Object.keys(TIPOS_DE_ARCHIVO).join(',');
  input.hidden = true;
  input.addEventListener('change', () => {
    const elegido = input.files?.[0];
    input.remove();
    if (elegido) void adjuntarArchivo(X, accion, campos, elegido);
  }, { once: true });
  input.addEventListener('cancel', () => input.remove(), { once: true });
  document.body.append(input);
  input.click();
}

/**
 * Adjunta un archivo elegido: lo sube (carta/archivos.js; sin red queda pendiente y se sube al sincronizar) y escribe la
 * transacción de la acción con su referencia (`archivo:<sha256>`) y su formato en los parámetros que los piden.
 */
async function adjuntarArchivo(X, accion, campos, elegido) {
  limpiarMensajes();
  try {
    // Primero se comprueba que la acción entraría con este archivo (su id, calculado aquí); solo entonces se sube.
    const r = await adjuntarConAccion(archivos, { eje: estado.eje, X, accion, campos, archivo: elegido, yo: estado.identidad, firmar: firmarCon(estado.identidad) });
    const a = r.adjunto;
    if (r.ok && r.asentado) {
      trasEscribir();
      estado.exito = t(a.sinRed ? 'archivoPendiente' : 'archivoAdjuntado', { id: a.id.slice(0, 8) }) + (r.asentado.firma ? ' ' + t('firmado') : '');
      tocar(X, 'hecho ' + canonicoDe(accion));
      marcarNuevos();
    } else estado.aviso = enLlano((r.motivos ?? []).map((m) => m.mensaje).join(' · '));
  } catch (e) {
    estado.aviso = enLlano(String(e.message ?? e), e);
  }
  pintar();
}

/**
 * Lo escrito en el formulario de una acción: si no se tocó el valor legible, el crudo que trae (data-crudo); un tipo
 * simple se lee con el núcleo (contrato.desdeLegible, en el idioma de quien mira); lo demás, BTML en JSON o el texto tal
 * cual. → { valores, motivos }.
 */
function valoresDelFormulario(form) {
  const valores = {};
  const motivos = [];
  for (const input of form.querySelectorAll('input[name]')) {
    const v = input.value.trim();
    if (v === '') continue;
    const { tipo, crudo, legible, simple, etiqueta } = input.dataset;
    if (crudo && v === legible) {
      try { valores[input.name] = JSON.parse(crudo); continue; } catch { /* se lee como lo escrito */ }
    }
    if (simple === '1') {
      const r = contrato.desdeLegible(v, tipo, { eje: estado.eje, idioma: idioma() });
      if (r.motivo) motivos.push({ regla: input.name, mensaje: (etiqueta || input.name) + ': ' + r.motivo, parametro: input.name });
      else if (r.valor !== undefined) valores[input.name] = r.valor;
    } else if (/^[[{]/.test(v)) { try { valores[input.name] = JSON.parse(v); } catch { valores[input.name] = v; } } else valores[input.name] = v;
  }
  return { valores, motivos };
}

/** Lo escrito en los inputs de un formulario, por nombre. */
const valoresDe = (form) => Object.fromEntries([...form.querySelectorAll('input[name],select[name]')].filter((i) => i.type !== 'file').map((i) => [i.name, i.value]));

/**
 * Escribe mis preferencias con estos valores sobre las de ahora, como un registro más en el 9 de mi alta (la plantilla
 * «preferences»): lo que hace la configuración al guardar y lo que hace un interruptor del 5 del 0 de mi alta (antes, de la barra) al tocarlo.
 */
async function escribirPreferencias(valores) {
  const p = preferencias(estado.eje, estado.identidad, valores);
  if (!p) throw new Error(t('sinAlta'));
  await salida.escribirDesde(estado.eje, { modo: 'sequenced', autor: estado.identidad, sobre: p.sobre, en: p.en, payload: p.payload, ...horaDe() }, privadaDe(estado.identidad));
}

/**
 * Los criterios de formato del BTML (el reverso) de quien mira: salen del libro (el registro «format settings» de mi alta,
 * #93). Sin cuenta (el ejemplo) valen los cambiados en esta sesión, en memoria; `formatoSesion` es lo que el botón
 * «formatear» alterna (la vista de esta sesión: no escribe nada). Lo guardado de antes en el almacén local no se migra: se borra.
 */
function formatoDe() {
  olvidarFormatoLocal(almacenLocal(), estado.cuenta ? estado.cuenta.alta : null);
  if (!estado.eje) return formatoValido(null);
  return formatoDeLibro(estado.eje, estado.identidad, { memoria: estado.cuenta ? {} : estado.formatoMemoria, sesion: estado.formatoSesion });
}

const manejadores = {
  nivel(pv, delta, X) {
    if (enMapped()) {
      // Mapped: los pasos de la época (carta.ampliar): sube o baja ese PV; pasado el tope, a pantalla completa; si compite
      // con otro tocado antes en su fila o columna, gana el más reciente y el otro baja un paso.
      const r = ampliar(estado, pv, delta, { pvs: ultimo?.pvs });
      estado.niveles = r.niveles;
      estado.recientes = r.recientes;
      limpiarMensajes();
      tocar(X ?? estado.foco.X, 'tamaño ' + pv + ' ' + (r.completa ? 'completa' : estado.niveles[pv]));
      if (r.completa) { irA(X ?? estado.foco.X, pv); return; }
      pintar();
      return;
    }
    if (enSecuencia()) {
      // Sequenced: una fila cerrada se abre (bloque) y una abierta, con otro paso, entra en el PV; hacia abajo, se cierra.
      const abierta = (estado.niveles[pv] ?? NIVEL.comprimido) >= NIVEL.tarjeta;
      if (delta > 0 && abierta) { irA(X ?? estado.foco.X, pv); return; }
      estado.niveles[pv] = delta > 0 ? NIVEL.bloque : NIVEL.comprimido;
      limpiarMensajes();
      tocar(X ?? estado.foco.X, 'fila ' + pv + ' ' + estado.niveles[pv]);
      pintar();
      return;
    }
    const actual = estado.niveles[pv] ?? NIVEL.comprimido;
    const siguiente = actual + delta;
    if (siguiente > NIVEL.bloque) { irA(X ?? estado.foco.X, pv); return; } // el siguiente gesto no es un tamaño: entrar en el PV
    estado.niveles[pv] = Math.max(NIVEL.comprimido, siguiente);
    limpiarMensajes();
    tocar(X ?? estado.foco.X, 'nivel ' + pv + ' ' + estado.niveles[pv]);
    pintar();
  },
  /** Sequenced: abrir o cerrar la fila de un PV (cerrada = comprimido, abierta = bloque); las del hilo llevan a su zona. */
  fila(pv) {
    if (ultimo?.secuencia?.filas?.find((f) => f.pv === pv)?.hilo) { manejadores.digito(pv); return; }
    const abierta = (estado.niveles[pv] ?? NIVEL.comprimido) >= NIVEL.tarjeta;
    estado.niveles[pv] = abierta ? NIVEL.comprimido : NIVEL.bloque;
    if (abierta) { estado.profundidad[pv] = []; estado.paginas[pv] = 1; }
    limpiarMensajes();
    tocar(estado.foco.X, 'fila ' + pv + ' ' + estado.niveles[pv]);
    pintar();
  },
  /** Sequenced: la fila de dígitos. Lleva a la fila de ese PV y la abre; los del hilo, al pasado o al futuro. */
  digito(pv) {
    const f = ultimo?.secuencia?.filas?.find((x) => x.pv === pv);
    if (!f) return;
    if (!f.hilo) estado.niveles[pv] = NIVEL.bloque;
    if (estado.foco.pv !== CENTROS[0]) estado.foco.pv = CENTROS[0]; // las filas están en el anverso
    irTrasPintar = pv;
    tocar(estado.foco.X, 'dígito ' + pv);
    pintar();
  },
  /** Mapped: los puntitos del foco suben un paso todos los PV (hasta el 3×3); su mando, los baja. */
  todos(delta) {
    const r = ampliarTodos(estado, delta, { pvs: ultimo?.pvs });
    estado.niveles = r.niveles;
    estado.recientes = r.recientes;
    limpiarMensajes();
    tocar(estado.foco.X, 'todos ' + delta);
    pintar();
  },
  /** Un interruptor del 5 del 0 de mi alta (sobrio o animado; antes, de la barra): escribe esa preferencia (sobrio o animado) como lo hace la configuración, y repinta. */
  async preferencia(clave, valor) {
    if (!clave || !estado.eje) return;
    try {
      await escribirPreferencias({ [clave]: valor });
      guardar();
      estado.aviso = '';
    } catch (e) {
      estado.aviso = enLlano(String(e.message ?? e).replace(/^evento (rechazado|mal formado): /, ''), e);
    }
    abrirSincronia();
    pintar();
  },
  /** Mapped, sin scroll: la página siguiente o la anterior de los ocupantes de un PV. */
  pagina(pv, delta) {
    estado.paginas[pv] = Math.max(1, (estado.paginas[pv] ?? 1) + delta);
    tocar(estado.foco.X, 'página ' + pv + ' ' + estado.paginas[pv]);
    pintar();
  },
  /** Mapped, pantalla completa: entrar en una celda de la rejilla de un PV baja un nivel de profundidad. */
  celda(pv, X, d) {
    estado.profundidad[pv] = [...(estado.profundidad[pv] ?? []), Number.isInteger(d) ? { X, d } : X];
    estado.paginas[pv] = 1;
    tocar(estado.foco.X, 'celda ' + pv + ' ' + estado.profundidad[pv].length);
    pintar();
  },
  /** Mapped, pantalla completa: bajar un nivel por el dígito d de una celda, dentro del mismo registro (encargo «lecturas»). */
  bajar(pv, d) {
    if (!Number.isInteger(pv) || !Number.isInteger(d)) return;
    estado.profundidad[pv] = [...(estado.profundidad[pv] ?? []), { d }];
    estado.paginas[pv] = 1;
    tocar(estado.foco.X, 'bajar ' + pv + ' ' + d);
    pintar();
  },
  /** Mapped, pantalla completa: volver un nivel de profundidad. */
  subir(pv) {
    estado.profundidad[pv] = (estado.profundidad[pv] ?? []).slice(0, -1);
    estado.paginas[pv] = 1;
    tocar(estado.foco.X, 'subir ' + pv);
    pintar();
  },
  profundidad(delta, pv, X) {
    if (pv !== null && pv !== undefined) return manejadores.nivel(pv, delta, X);
    if (enMapped()) return manejadores.todos(delta);
    // Sin PV: todos los laterales a la vez.
    for (const k of LATERALES) estado.niveles[k] = Math.min(NIVEL.bloque, Math.max(NIVEL.comprimido, (estado.niveles[k] ?? NIVEL.comprimido) + delta));
    tocar(estado.foco.X, 'profundidad ' + delta);
    pintar();
  },
  foco(X, pv) { irA(X, pv); },
  voltear() {
    const [anverso, reverso] = CENTROS;
    estado.foco.pv = estado.foco.pv === anverso ? reverso : anverso;
    limpiarMensajes();
    tocar(estado.foco.X, 'voltear ' + estado.foco.pv);
    pintar();
  },
  editar(X, pv) {
    const input = raiz.querySelector(`[data-centro] [data-campo="${pv}"]`);
    if (input) { input.focus(); input.select?.(); }
  },
  aro(X, pv, { desplegar, ancla } = {}) {
    if (!X) return;
    // `ancla`: la caja del elemento pulsado en la ventana (de gestos.js, al abrir); al desplegar un sitio se conserva la de antes. Es estado de pantalla, no del árbol.
    // Desplegar un sitio en un aro abierto sobre otro registro (o cerrado) lo abre ya desplegado; en el mismo, lo pliega si ya lo estaba.
    const mismo = estado.aro?.X === X;
    estado.aro = { X, pv: desplegar ? (mismo && estado.aro?.pv === pv ? null : pv) : null, ancla: ancla ?? (desplegar && mismo ? estado.aro.ancla : null), editar: false };
    estado.formulario = null;
    limpiarMensajes();
    tocar(X, 'aro' + (pv !== null && pv !== undefined ? ' ' + pv : ''));
    pintar();
  },
  /**
   * Mantener un hueco (issue #22: un hijo de la rejilla, el espacio libre de un mundo, un PV vacío): el aro con un input
   * nuevo en el centro; lo escrito crea el elemento en la posición pv de X (campo con `nuevo`) y abre su aro.
   */
  async aroNuevo(X, pv, { ancla, en, nombre } = {}) {
    if (!X || !Number.isInteger(pv) || !estado.eje?.obtener(X)) return;
    // Bajado por dígitos dentro de X (encargo «lecturas»): el elemento se crea en la dirección entera, X.<en>.<pv>.
    const base = Array.isArray(en) && en.every(Number.isInteger) ? en : [];
    // Sin nada que crear en esa posición (VG 14-11, #87: lo que el núcleo ofrece escribir ahí) el aro no se abre.
    if (!creableEn(estado.eje, X, [...base, pv], estado.identidad, { idioma: idioma() }).length) return;
    estado.aro = { X, pv: null, nuevo: pv, ...(base.length ? { en: [...base, pv] } : {}), ...(nombre ? { nombre } : {}), ancla: ancla ?? null, editar: false };
    estado.formulario = null;
    limpiarMensajes();
    tocar(X, 'aro nuevo ' + pv);
    await pintar();
    const input = raiz.querySelector('.aro [data-nuevo][data-campo]');
    if (input) input.focus();
  },
  /** Mantener el centro del aro: editarlo (el input con su valor, la lista del 0 debajo y la del 5 encima); el foco, en el input. */
  async editarAro() {
    if (!estado.aro) return;
    estado.aro = { ...estado.aro, pv: null, editar: true };
    tocar(estado.aro.X, 'aro editar');
    await pintar();
    // Las dos listas, recortadas a la ventana (la del 5 crece hacia arriba y la del 0 hacia abajo: con scroll si no caben).
    const MARGEN = 8;
    for (const lista of raiz.querySelectorAll('.aro-edicion .opciones')) {
      const r = lista.getBoundingClientRect();
      const sobra = Math.max(MARGEN - r.top, r.bottom - (globalThis.innerHeight - MARGEN), 0);
      if (sobra > 0) lista.style.maxHeight = Math.max(60, r.height - sobra) + 'px';
    }
    const input = raiz.querySelector('.aro [data-campo]');
    if (input) { input.focus(); input.select?.(); }
  },
  /** Un clic en el centro del aro: cerrarlo y entrar en el elemento (su anverso). */
  aroEntrar(X) {
    if (!X) return;
    estado.aro = null;
    irA(X, CENTROS[0]);
  },
  /** Un valor de una lista del aro (contrato.opciones): se escribe en la posición pv de X como cualquier campo, y el aro se cierra (en el de un hueco, crea el elemento). */
  opcion(X, pv, valor) {
    if (!X || valor === undefined || valor === '') return;
    const nuevo = Number.isInteger(estado.aro?.nuevo);
    if (!nuevo) estado.aro = null;
    return manejadores.campo(X, pv, valor, { nuevo });
  },
  /** Las teclas 1-4 y 6-9 con el aro abierto: lanzar la acción por defecto de ese sitio (si no tiene, nada). */
  aroTecla(pv) {
    const hueco = ultimo?.aro?.huecos?.find((h) => h.pv === pv);
    if (estado.aro && hueco?.accion) manejadores.lanzar(estado.aro.X, hueco.accion.id);
  },
  lanzar(X, accion, paso, { ejecutar = false } = {}) {
    const sobre = X ?? estado.aro?.X ?? estado.foco.X;
    // Una acción que pide un archivo (un parámetro cuyo 4 es «file»: «adjuntar un archivo»): el selector de archivos, ya
    // (en el mismo gesto: el navegador solo lo abre así); al elegir, se sube y se escribe la transacción con su referencia.
    const deArchivo = estado.eje?.obtener(sobre) ? formulario(estado.eje, sobre, accion, estado.identidad)?.campos.filter((c) => c.archivo) ?? [] : [];
    if (deArchivo.length) {
      estado.aro = null;
      estado.formulario = null;
      limpiarMensajes();
      tocar(sobre, 'lanzar ' + canonicoDe(accion));
      elegirArchivo(sobre, accion, deArchivo);
      pintar();
      return;
    }
    // Ejecutar desde el 4 (VG 12-11, decisión 7): desde una celda abierta del 4 o un paso del camino del 9, el formulario
    // enseña lo exigido en T, la denominación y el botón de ejecutar por el rango.
    // Un paso del camino lleva sus parámetros (el anuncio que cumple «deliver», por ejemplo): el formulario sale con ellos.
    const delPaso = paso !== null && paso !== undefined ? ultimo?.camino?.pasos?.[paso]?.hacer : null;
    const valores = delPaso && delPaso.id === accion && delPaso.parametros && typeof delPaso.parametros === 'object' ? { ...delPaso.parametros } : {};
    estado.formulario = { X: sobre, accion, valores, motivos: [], resultado: null, paso, ejecutar: Boolean(ejecutar) || (paso !== null && paso !== undefined) };
    estado.previa = null;
    estado.aro = null;
    limpiarMensajes();
    tocar(sobre, 'lanzar ' + canonicoDe(accion));
    pintar();
  },
  /** El 3 por tema (encargo pv3): el botón de una caja cicla todos → doy → recibo. */
  filtroCaja(caja) {
    if (!Number.isInteger(caja)) return;
    const orden = ['todos', 'doy', 'recibo'];
    const f = estado.filtrosDelTres;
    f[caja] = orden[(orden.indexOf(f[caja] ?? 'todos') + 1) % orden.length];
    tocar(estado.foco.X, 'filtro 3.' + caja + ' ' + f[caja]);
    pintar();
  },
  /** El interrogante (o el muñeco) de un sitio: la cruceta del propio nodo X.<lugar>, como menú de configuración (#38). */
  sitio(X, lugar, { general = false } = {}) {
    if (!X || !estado.eje?.obtener(X)) return;
    estado.sitio = { X, lugar, general };
    estado.aro = null;
    estado.formulario = null;
    limpiarMensajes();
    tocar(X, 'sitio ' + lugar);
    pintar();
  },
  /** Una posición de la cruceta de un sitio: el formulario de su acción con los parámetros que el sitio ya da. */
  lanzarCon(X, accion, valores) {
    if (!X || !accion) return;
    estado.formulario = { X, accion, valores: valores ?? {}, motivos: [], resultado: null };
    estado.aro = null;
    limpiarMensajes();
    tocar(X, 'lanzar ' + canonicoDe(accion));
    pintar();
  },
  /**
   * Arrastrar a una persona de una caja del 3 a otra (encargo pv3): reclasificar la conversación con «move to group»
   * sobre su alta (al 5, vetar). Si no pasa, el formulario de la acción con el motivo.
   */
  async reclasificar(persona, caja) {
    const alta = estado.eje?.alta(persona)?.id;
    if (!alta || !Number.isInteger(caja)) return;
    limpiarMensajes();
    const valores = { whom: persona, zone: caja };
    const r = await enviar(estado.eje, alta, 'move to group', valores, estado.identidad, firmarCon(estado.identidad));
    if (r.ok && r.asentado) {
      trasEscribir();
      estado.exito = t('registrado', { accion: nombreDeAccion('move to group'), id: r.asentado.id.slice(0, 8) }) + ' · ' + t('reclasificado', { que: persona, caja }) + (r.asentado.firma ? ' ' + t('firmado') : '');
      tocar(estado.foco.X, 'reclasificar ' + persona + ' 3.' + caja);
      marcarNuevos();
    } else {
      estado.formulario = { X: alta, accion: 'move to group', valores, motivos: motivosConGuardian(motivosEnLlano(r.motivos, estado.eje)), resultado: null };
    }
    pintar();
  },
  cerrar() {
    if (hayRosetonAmpliado(estado.rosetones)) estado.rosetones = {};
    else if (estado.copia) estado.copia = null;
    else if (estado.libroPrivado) estado.libroPrivado = null;
    else if (estado.arranque && estado.eje) estado.arranque = null;
    else if (estado.retoque) estado.retoque = null;
    else if (estado.config) { estado.config = false; estado.motivosPreferencias = []; }
    else if (estado.formulario) estado.formulario = null;
    else if (estado.reglas) estado.reglas = null;
    else if (estado.puente) estado.puente = null;
    else if (estado.ajustes) estado.ajustes = null;
    else if (estado.sitio) estado.sitio = null;
    else if (estado.aro) estado.aro = null;
    else if (estado.celdaMatriz) estado.celdaMatriz = null; // la celda abierta de la matriz del 4 (encargo «el4»)
    else if (enMapped() && estado.profundidad[estado.foco.pv]?.length) estado.profundidad[estado.foco.pv].pop(); // subir un nivel de la rejilla
    else if (enMapped() && LATERALES.includes(estado.foco.pv)) estado.foco = { ...estado.foco, pv: CENTROS[0] }; // salir de la pantalla completa
    else return;
    pintar();
  },
  /**
   * Ejecutar (VG 12-11, decisión 7): la escala de la que parte la T que se quema; la denominación la recalcula el núcleo.
   * Lo ya escrito en el formulario se guarda antes de repintar.
   */
  denominacion(escala, form) {
    const f = estado.formulario;
    if (!f?.ejecutar || typeof escala !== 'string') return;
    if (form) f.valores = { ...f.valores, ...valoresDelFormulario(form).valores };
    f.escala = escala;
    tocar(f.X, 'denominación ' + escala);
    pintar();
  },
  /** El reverso del formulario (VG 14-11, #89): fórmulas, tipos y BTML en crudo; se abre a propósito y vuelve. Lo escrito se guarda antes de repintar. */
  voltearFormulario(form) {
    const f = estado.formulario;
    if (!f) return;
    if (form) f.valores = { ...f.valores, ...valoresDelFormulario(form).valores };
    f.reverso = !f.reverso;
    tocar(f.X, 'reverso del formulario ' + (f.reverso ? 'abierto' : 'cerrado'));
    pintar();
  },
  async enviar(form) {
    const f = estado.formulario;
    if (!f) return;
    const { valores, motivos } = valoresDelFormulario(form);
    f.valores = valores;
    if (motivos.length) { f.motivos = motivos; f.resultado = null; pintar(); return; }
    // Ejecutar desde el 4 (VG 12-11, decisión 7): la T se quema en la denominación que enseña el formulario (la propuesta o
    // la que sale de la escala elegida); el botón no se bloquea por el rango: apagado también se pulsa.
    const denominacion = f.ejecutar ? (f.escala ?? acciones.ejecucion(estado.eje, f.accion, { X: f.X, ...valores }, estado.identidad, { idioma: idioma() }).denominacion ?? undefined) : undefined;
    // Un mensaje de una conversación pide antes la reserva de quien escribe (docs/notas/R_EN_CANALES.md): se escribe aquí,
    // con su coste a la vista y confirmada; si no entra, el mensaje no se intenta.
    const antes = await antesDelMensaje(estado.eje, f.X, f.accion, valores, estado.identidad, { idioma: idioma() });
    for (const x of antes.registros) {
      if (!(await confirmarEnPagina(t('reservaAntes', { coste: x.coste ? textoDelCoste(x.coste) : t('salidaSinCoste') })))) return;
      const rr = await enviar(estado.eje, x.X, x.plantilla, x.valores, estado.identidad, firmarCon(estado.identidad));
      if (!rr.asentado) {
        f.motivos = [{ mensaje: t('reservaNoEntra', { motivo: motivosConGuardian(motivosEnLlano(rr.motivos, estado.eje)).map((m) => m.mensaje).join('; ') }) }];
        f.resultado = null;
        pintar();
        return;
      }
      trasEscribir();
      estado.exito = t('reservaHecha');
    }
    const r = await enviar(estado.eje, f.X, f.accion, valores, estado.identidad, firmarCon(estado.identidad), denominacion ? { denominacion } : {});
    if (r.ok && r.asentado) {
      // Una cosa dada de alta nace también con su HTML básico en el PV0 (VG 14-11, #84), como mi cuenta.
      if (canonicoDe(f.accion) === 'register a thing') await adjuntarHtmlInicial(estado.eje, r.asentado.id, estado.identidad, firmarCon(estado.identidad), idioma());
      trasEscribir();
      if (f.propuesta) externa.quitarPropuesta(almacenLocal(), dondePropuestas(), f.propuesta);
      estado.formulario = null;
      estado.exito = t('registrado', { accion: nombreDeAccion(f.accion), id: r.asentado.id.slice(0, 8) }) + (r.asentado.firma ? ' ' + t('firmado') : '');
      tocar(f.X, 'hecho ' + canonicoDe(f.accion));
      marcarNuevos();
    } else if (r.ok && r.lectura) {
      f.resultado = sinNombreInterno(r.lectura.mensaje, estado.eje);
      f.motivos = [];
    } else if (r.ok && !r.evento) {
      f.resultado = r.pasos ? t('pasosMios', { cuantos: r.pasos.length }) : r.paso ? t('elPaso', { que: r.paso.hacer ? nombreDeAccion(r.paso.hacer.plantilla) : r.paso.falta }) : t('nadaQueHacer');
      f.motivos = [];
    } else {
      f.motivos = motivosConGuardian(motivosEnLlano(r.motivos, estado.eje)); // lo escrito sigue en el formulario (f.valores)
      f.resultado = null;
    }
    pintar();
  },
  // ---- «Reglas del libro» y «Ajustes de este elemento» (A21 y A23; carta/reglas.js) ----
  /** Abrir «Reglas del libro» (desde la configuración o desde el génesis): la lista de cambios. */
  reglas() {
    if (!estado.eje) return;
    estado.reglas = { cambio: null, proponer: null, aviso: null, motivos: [], exito: null };
    estado.config = false;
    estado.sitio = null;
    estado.aro = null;
    estado.formulario = null;
    limpiarMensajes();
    tocar(estado.foco.X, 'reglas del libro');
    pintar();
    void ponerEnVigorSolo();
  },
  /** El detalle de un cambio (su propuesta). */
  reglasCambio(id) {
    if (!estado.reglas || typeof id !== 'string') return;
    estado.reglas = { ...estado.reglas, cambio: id, proponer: null, salida: null, aviso: null, motivos: [], exito: null };
    tocar(estado.foco.X, 'cambio ' + id.slice(0, 8));
    pintar();
    void ponerEnVigorSolo();
  },
  /** Volver a la lista de cambios. */
  reglasVolver() {
    if (!estado.reglas) return;
    estado.reglas = { ...estado.reglas, cambio: null, proponer: null, salida: null, aviso: null, motivos: [] };
    pintar();
  },
  /** El formulario de proponer un cambio. */
  reglasProponer() {
    if (!estado.reglas) return;
    estado.reglas = { ...estado.reglas, cambio: null, proponer: { posicion: null, valores: {}, clase: null }, salida: null, aviso: null, motivos: [], exito: null };
    tocar(estado.foco.X, 'proponer un cambio');
    pintar();
  },
  /** Elegir qué cambia: «cómo queda» parte del valor de hoy de esa posición; lo demás escrito se guarda. */
  reglasPosicion(posicion, form) {
    const p = estado.reglas?.proponer;
    if (!p) return;
    const { titulo, explicacion, pieza } = valoresDePropuesta(form);
    estado.reglas.proponer = { posicion: posicion || null, valores: { titulo, explicacion, pieza }, clase: null };
    estado.reglas.aviso = null;
    estado.reglas.motivos = [];
    pintar();
  },
  /** «Proponer»: la carta comprueba antes de escribir; si pasa, «propose a change» por el camino de siempre. */
  async reglasPropuesta(form) {
    const p = estado.reglas?.proponer;
    if (!p || !estado.eje) return;
    const v = valoresDePropuesta(form);
    limpiarMensajes();
    const r = await proponerCambio(estado.eje, estado.identidad, v, firmarCon(estado.identidad));
    if (!estado.reglas) return;
    if (r.asentado) {
      trasEscribir();
      estado.reglas = { cambio: r.asentado.id, proponer: null, aviso: null, motivos: [], exito: t('reglasPropuesto', { id: r.asentado.id.slice(0, 8) }) + (r.asentado.firma ? ' ' + t('firmado') : '') };
      tocar(estado.foco.X, 'propuesto ' + r.asentado.id.slice(0, 8));
      marcarNuevos();
    } else {
      estado.reglas.proponer = { posicion: v.posicion, valores: v, clase: r.comprobacion?.claseLlana ?? null, avanzado: Boolean(v.pieza) };
      estado.reglas.aviso = r.aviso ?? null;
      estado.reglas.motivos = motivosConGuardian(r.motivos ?? []);
    }
    pintar();
  },
  /** Apoyar, retirar el apoyo, aprobar, retirar la propuesta o poner en vigor, por el camino de siempre (coste, firma, sincronía). */
  async reglasActuar(que, id) {
    if (!estado.reglas || !estado.eje) return;
    limpiarMensajes();
    const r = await actuarEnCambio(estado.eje, id, que, estado.identidad, firmarCon(estado.identidad));
    if (!estado.reglas) return;
    if (r.asentado) {
      trasEscribir();
      estado.reglas = { ...estado.reglas, aviso: null, motivos: [], exito: t('reglasHecho', { accion: t('reglasAccion_' + que), id: r.asentado.id.slice(0, 8) }) + (r.asentado.firma ? ' ' + t('firmado') : '') };
      tocar(estado.foco.X, que + ' ' + String(id).slice(0, 8));
      marcarNuevos();
    } else {
      estado.reglas = { ...estado.reglas, aviso: null, motivos: motivosConGuardian(r.motivos ?? []), exito: null };
    }
    pintar();
  },
  /** «Irme con lo mío» (desde «Reglas del libro»): pone en el eje los sellos guardados y busca mi libro nuevo, si ya lo hay. */
  async salida() {
    if (!estado.reglas || !estado.eje) return;
    // `buscando`: el botón espera a saber si ya hay libro nuevo (nuevoDeLaSalida); `bloqueado`: lo hay y no se abre.
    estado.reglas = { ...estado.reglas, cambio: null, proponer: null, salida: { punto: 'vigente', nuevo: null, ocupado: false, buscando: true, bloqueado: false }, aviso: null, motivos: [], exito: null };
    if (estado.cuenta) puente.sellosGuardados(estado.eje, estado.cuenta.alta);
    tocar(estado.foco.X, 'irme con lo mío');
    pintar();
    await nuevoDeLaSalida();
    pintar();
  },
  /** Con qué reglas nace el libro nuevo: las vigentes o las de antes del último cambio en vigor. */
  salidaPunto(punto) {
    const s = estado.reglas?.salida;
    if (!s || (punto !== 'vigente' && punto !== 'antes')) return;
    s.punto = punto;
    pintar();
  },
  /**
   * El único botón de la salida: firma el primer paso «listo», tal cual lo da el plan, tras confirmarlo en la página con su
   * coste a la vista; el génesis abre el libro nuevo como otro libro de esta cuenta, marcado con este libro. Después se
   * vuelve a pedir el plan. Lo que falle se dice en la hoja y la hoja queda libre.
   */
  async salidaFirmar() {
    const s = estado.reglas?.salida;
    if (!s || s.ocupado || s.buscando || s.bloqueado || !estado.eje || !firmaLaCuenta()) return;
    let vista;
    let nombre;
    let coste;
    try {
      ({ vista, nombre, coste } = salidaDe());
    } catch (e) {
      estado.reglas.motivos = [{ mensaje: t('salidaNoSeLee', { motivo: String(e?.message ?? e) }) }];
      pintar();
      return;
    }
    const p = vista?.siguiente;
    if (!p) return;
    const enElViejo = p.libro === 'viejo';
    const firmar = p.que === 'genesis' ? null : enElViejo ? firmarCon(estado.identidad) : firmarEnElNuevo(s.nuevo ?? {});
    if (p.que !== 'genesis' && !firmar) {
      estado.reglas.motivos = [{ mensaje: t('salidaSinFirma') }];
      pintar();
      return;
    }
    const texto = p.que === 'genesis'
      ? t('salidaConfirmarGenesis', { n: p.n, nombre, punto: t('salidaPunto_' + vista.punto).toLowerCase() })
      : t('salidaConfirmar', { n: p.n, donde: t('salidaEnLibro_' + p.libro), paso: textoDelPasoDeSalida(vista.pasos.find((x) => x.n === p.n) ?? p, nombre), coste: coste ? textoDelCoste(coste) : t('salidaSinCoste') });
    if (!(await confirmarEnPagina(texto))) return;
    limpiarMensajes();
    s.ocupado = true;
    try {
      await pintar();
      const c = estado.cuenta;
      if (p.que === 'genesis') {
        const r = await puente.abrirLibroDeSalida({ cuenta: c, privada: c.privada, guardian: c.guardian === true ? guardian : null, paso: p, viejo: estado.eje.genesisId });
        if (estado.reglas?.salida === s) s.nuevo = { cuenta: r.cuenta, eje: r.eje, privada: r.privada, firmante: r.firmante };
        if (estado.reglas) estado.reglas.exito = t('salidaHecho', { n: p.n });
      } else {
        const eje = enElViejo ? estado.eje : s.nuevo?.eje;
        const r = await puente.firmarPaso(eje, p, firmar);
        if (r.asentado) {
          if (enElViejo) { trasEscribir(); marcarNuevos(); } else s.nuevo.cuenta = puente.guardarLibroNuevo(s.nuevo);
          if (estado.reglas) estado.reglas.exito = t('salidaHecho', { n: p.n }) + (r.asentado.firma ? ' ' + t('firmado') : '');
        } else if (estado.reglas) estado.reglas.motivos = motivosConGuardian(r.motivos ?? []);
      }
    } catch (e) {
      if (estado.reglas) estado.reglas.motivos = [{ mensaje: enLlano(String(e?.message ?? e), e) }];
    } finally {
      s.ocupado = false;
    }
    pintar();
  },
  /** En el libro viejo, el enlace que cuenta hacia mi libro nuevo (para enviarle la E y los registros), confirmado con su coste. */
  async salidaEnlazar() {
    const s = estado.reglas?.salida;
    if (!s?.nuevo?.eje || s.ocupado || s.buscando || !firmaLaCuenta()) return;
    const coste = puente.costeDelEnlaceAlNuevo(estado.eje, estado.identidad, s.nuevo.eje);
    if (!(await confirmarEnPagina(t('salidaEnlazarConfirmar', { nombre: s.nuevo.cuenta.nombre, coste: coste ? textoDelCoste(coste) : t('salidaSinCoste') })))) return;
    limpiarMensajes();
    s.ocupado = true;
    try {
      await pintar();
      const r = await puente.enlazarNuevo(estado.eje, estado.identidad, s.nuevo.eje, firmarCon(estado.identidad));
      if (r.asentado) {
        trasEscribir();
        marcarNuevos();
        if (estado.reglas) estado.reglas.exito = t('salidaEnlazadoHecho') + (r.asentado.firma ? ' ' + t('firmado') : '');
      } else if (estado.reglas) estado.reglas.motivos = motivosConGuardian(r.motivos ?? []);
    } catch (e) {
      if (estado.reglas) estado.reglas.motivos = [{ mensaje: enLlano(String(e?.message ?? e), e) }];
    } finally {
      s.ocupado = false;
    }
    pintar();
  },
  /** «Puente» (desde la salida o desde una línea de enlace con uno de mis libros): la hoja «Entre mis libros». */
  async puente() {
    if (!estado.eje) return;
    estado.puente = { otros: new Map(), enviar: null, traer: null, aviso: null, motivos: [], exito: null, ocupado: false };
    estado.reglas = null;
    estado.aro = null;
    estado.formulario = null;
    estado.sitio = null;
    estado.config = false;
    if (estado.cuenta) puente.sellosGuardados(estado.eje, estado.cuenta.alta);
    limpiarMensajes();
    tocar(estado.foco.X, 'puente entre mis libros');
    pintar();
    try {
      await abrirLosEnlazados();
    } catch (e) {
      if (estado.puente) estado.puente.aviso = t('puenteNoSeLee', { motivo: String(e?.message ?? e) });
    }
    pintar();
  },
  /** Elegir lo mío que se envía a otro libro: abre su formulario (a qué libro y cuánto). */
  puenteEnviarSerie(serie) {
    const p = estado.puente;
    if (!p || typeof serie !== 'string') return;
    Object.assign(p, { enviar: { serie }, traer: null, motivos: [], exito: null });
    pintar();
  },
  /** «Traer de este libro»: lo que el libro enlazado tiene sellado y aún no está aquí. */
  puenteTraerDe(enlace) {
    const p = estado.puente;
    if (!p || typeof enlace !== 'string') return;
    Object.assign(p, { traer: { enlace }, enviar: null, motivos: [], exito: null });
    pintar();
  },
  /** Enviar a otro libro, tras confirmarlo en la página con el aviso, el grado del enlace y lo que cuesta. */
  async puenteEnviar(form) {
    const p = estado.puente;
    if (!p?.enviar || p.ocupado || !firmaLaCuenta()) return;
    const v = puenteSeguro();
    if (!v.enviar) { pintar(); return; }
    const valores = valoresDe(form);
    const destino = v.enviar.destinos.find((d) => d.enlace === valores.enlace);
    const cantidad = Number(valores.cantidad);
    p.enviar.enlace = destino?.enlace ?? p.enviar.enlace;
    p.enviar.cantidad = valores.cantidad;
    if (!destino) {
      p.motivos = [{ mensaje: t('puenteSinDestinoElegido') }];
      pintar();
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > v.enviar.disponible) {
      p.motivos = [{ mensaje: t('puenteCantidadNoVale', { disponible: v.enviar.disponible }) }];
      pintar();
      return;
    }
    const datos = { enlace: destino.enlace, serie: v.enviar.serie, cantidad, publica: estado.cuenta.publica };
    const coste = puente.costeDelEnvio(estado.eje, estado.identidad, datos);
    const texto = t('puenteConfirmarEnvio', { cuanto: puente.serieEnLlano(estado.eje, datos.serie, cantidad, idioma()), libro: destino.nombre, grado: destino.grado ?? '', aviso: t('puenteAvisoEnvio') + ' ' + t('puenteRedDePruebas'), coste: coste ? textoDelCoste(coste) : t('salidaSinCoste') });
    if (!(await confirmarEnPagina(texto))) return;
    await escribirEnElPuente(() => puente.enviarAOtroLibro(estado.eje, estado.identidad, { ...datos, firmar: firmarCon(estado.identidad) }), t('puenteEnviado', { libro: destino.nombre }));
  },
  /** Traer aquí un registro sellado del libro enlazado, con su prueba, tras confirmarlo con lo que cuesta. */
  async puenteTraer(id) {
    const p = estado.puente;
    if (!p?.traer || p.ocupado || !firmaLaCuenta()) return;
    const v = puenteSeguro();
    const x = v.traer?.lista.find((r) => r.id === id);
    const l = v.enlaces.find((e) => e.id === p.traer.enlace);
    const origen = l ? p.otros.get(l.libro)?.eje : null;
    if (!x || !origen) { pintar(); return; }
    const datos = { enlace: l.id, origen, id };
    const coste = puente.costeDeTraer(estado.eje, estado.identidad, datos);
    if (!(await confirmarEnPagina(t('puenteConfirmarTraer', { titulo: x.titulo || id.slice(0, 8), libro: l.nombre, coste: coste ? textoDelCoste(coste) : t('salidaSinCoste') })))) return;
    await escribirEnElPuente(() => puente.traerDeOtroLibro(estado.eje, estado.identidad, { ...datos, firmar: firmarCon(estado.identidad) }), t('puenteTraido', { libro: l.nombre }));
  },
  /** Recibir lo traído (la ida, o la parte siguiente de una vuelta), tras confirmarlo con lo que queda y lo que cuesta. */
  async puenteRecibir(id) {
    const p = estado.puente;
    if (!p || p.ocupado || !firmaLaCuenta()) return;
    const x = puenteSeguro().traidos.find((r) => r.traido === id);
    if (!x?.recibir) { pintar(); return; }
    const coste = puente.costeDeRecibir(estado.eje, estado.identidad, { id });
    if (!(await confirmarEnPagina(t('puenteConfirmarRecibir', { queda: x.envio.queda, coste: coste ? textoDelCoste(coste) : t('salidaSinCoste') })))) return;
    await escribirEnElPuente(() => puente.recibirDeOtroLibro(estado.eje, estado.identidad, { id, firmar: firmarCon(estado.identidad) }), t('puenteRecibidoYa'));
  },
  /** «Ajustes de este elemento» (desde su configuración, la cruceta de su 0). */
  ajustesElemento(X) {
    if (!X || !estado.eje?.obtener(X)) return;
    estado.ajustes = { X };
    estado.sitio = null;
    estado.aro = null;
    estado.formulario = null;
    limpiarMensajes();
    tocar(X, 'ajustes de este elemento');
    pintar();
  },
  // ---- retocar un texto en su sitio (A20 escalón 1, docs/notas/RETOQUES.md) ----
  /** El interruptor de la configuración: encender o apagar el modo «retocar textos» (solo cuenta para quien puede retocar). */
  modoRetocar(encendido) {
    estado.retocar = Boolean(encendido);
    if (!estado.retocar) estado.retoque = null;
    tocar(estado.foco.X, 'retocar textos ' + (estado.retocar ? 'encendido' : 'apagado'));
    pintar();
  },
  /** Un texto marcado tocado en el modo «retocar textos»: abre su hoja (la clave y el idioma con que se leyó). */
  retocarTexto(clave, enIdioma) {
    if (!estado.retocar || typeof clave !== 'string' || !clave) return;
    estado.retoque = { clave, idioma: enIdioma || idioma(), texto: null, aviso: null, motivos: [] };
    tocar(estado.foco.X, 'retocar ' + clave);
    pintar();
  },
  /** Otro idioma en la hoja del retoque: el texto de hoy en ese idioma. */
  retoqueIdioma(otro) {
    if (!estado.retoque || typeof otro !== 'string' || !otro) return;
    estado.retoque = { ...estado.retoque, idioma: otro, texto: null, aviso: null, motivos: [] };
    pintar();
  },
  /** «Guardar» en la hoja: el registro «retouch a text» por el mismo camino que cualquier acción (firmado, asentado, guardado y sincronizado). */
  async guardarRetoque(form) {
    const r0 = estado.retoque;
    if (!r0 || !estado.eje) return;
    const texto = form?.querySelector?.('[data-retoque-texto]')?.value ?? '';
    limpiarMensajes();
    const r = await guardarRetoque(estado.eje, estado.identidad, { clave: r0.clave, idioma: r0.idioma, texto }, firmarCon(estado.identidad));
    if (r.asentado) {
      trasEscribir();
      estado.retoque = null;
      estado.exito = t('retoqueGuardado', { id: r.asentado.id.slice(0, 8) }) + (r.asentado.firma ? ' ' + t('firmado') : '');
      tocar(estado.foco.X, 'retocado ' + r0.clave);
      marcarNuevos();
    } else {
      estado.retoque = { ...r0, texto, aviso: r.aviso ?? null, motivos: r.aviso ? [] : motivosConGuardian(r.motivos ?? []) };
    }
    pintar();
  },
  /** «Volver al texto original» (en la hoja o en la lista): el registro sin texto, que retira los retoques de esa clave en ese idioma. */
  async retoqueOriginal(clave, idiomaDelRetoque) {
    if (!estado.eje || typeof clave !== 'string' || !clave) return;
    limpiarMensajes();
    const r = await guardarRetoque(estado.eje, estado.identidad, { clave, idioma: idiomaDelRetoque || idioma(), texto: null }, firmarCon(estado.identidad));
    if (r.asentado) {
      trasEscribir();
      if (estado.retoque?.clave === clave) estado.retoque = null;
      estado.exito = t('retoqueRetirado', { id: r.asentado.id.slice(0, 8) }) + (r.asentado.firma ? ' ' + t('firmado') : '');
      tocar(estado.foco.X, 'original ' + clave);
      marcarNuevos();
    } else if (estado.retoque?.clave === clave) {
      estado.retoque = { ...estado.retoque, aviso: r.aviso ?? null, motivos: r.aviso ? [] : motivosConGuardian(r.motivos ?? []) };
    } else {
      estado.aviso = r.aviso ?? motivosConGuardian(r.motivos ?? []).map((m) => m.mensaje ?? m).join(' · ');
    }
    pintar();
  },
  /** La configuración, separada por posición (VG 14-11, #92): parte '2' = mis criterios y preferencias, '9' = guía y exterior; cada una guarda solo lo suyo. */
  async configurar(form, parte) {
    if (!form) { estado.config = parte === '9' ? '9' : '2'; estado.motivosPreferencias = []; estado.formulario = null; estado.aro = null; estado.sitio = null; pintar(); return; }
    const valores = {};
    for (const input of form.querySelectorAll('input[name], select[name]')) valores[input.name] = input.value.trim().split(/\s+/).filter(Boolean);
    const valoresGuia = Object.fromEntries([...form.querySelectorAll('[data-guia-campo]')].map((i) => [i.dataset.guiaCampo, i.value]));
    const valoresExterior = Object.fromEntries([...form.querySelectorAll('[data-exterior-campo]')].map((i) => [i.dataset.exteriorCampo, i.value]));
    // Un número que no lo es o unas claves del observador mal escritas avisan y no se guarda nada (repaso beta #13).
    const avisos = [
      ...guia.avisosDeAjustes(preferencias(estado.eje, estado.identidad)?.campos, Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.join(' ')])), { positivo: false }),
      ...guia.avisosDeAjustes(guia.ajustesEditables(estado.eje, estado.identidad)?.campos, valoresGuia),
      ...guia.avisosDeAjustes(guia.ajustesEditablesDe(exterior.AJUSTES.plantilla, estado.eje, estado.identidad)?.campos, valoresExterior),
    ];
    if (avisos.length) { estado.motivosPreferencias = avisos.map((mensaje) => ({ mensaje })); pintar(); return; }
    // La clave de lectura, aparte: al almacén local de la cuenta, nunca al registro de preferencias (que va en el eje).
    const campoClave = form.querySelector('[data-clave-lectura]');
    if (campoClave && estado.cuenta) cuentas.guardarClaveLectura(estado.cuenta.alta, campoClave.value);
    // Lo de la guía: la clave de la API, también aparte (solo en este navegador); los demás ajustes son un registro más.
    const campoIa = form.querySelector('[data-clave-ia]');
    if (campoIa && altaDeGuia()) guia.guardarClaveIa(almacenLocal(), altaDeGuia(), campoIa.value);
    // El segundo factor (VG 12/13-11, #66, #70): un criterio más en el 2.4 de mi alta, con la plantilla «second factor», si la familia está escrita.
    const valoresSegundo = Object.fromEntries([...form.querySelectorAll('[data-segundo-factor-campo]')].map((i) => [i.dataset.segundoFactorCampo, i.value.trim()]));
    if (!preferencias(estado.eje, estado.identidad, valores)) { estado.motivosPreferencias = [{ mensaje: t('sinAlta') }]; pintar(); return; }
    try {
      await escribirPreferencias(valores);
      const ajustesGuia = guia.ajustesEditables(estado.eje, estado.identidad, valoresGuia);
      if (ajustesGuia?.cambiado) await salida.escribirDesde(estado.eje, { modo: 'sequenced', autor: estado.identidad, sobre: ajustesGuia.sobre, en: ajustesGuia.en, payload: ajustesGuia.payload, ...horaDe() }, privadaDe(estado.identidad));
      // Los ajustes del exterior (relé, archivos, sello): otro registro más en el 9 del alta, con la misma forma que el de la guía.
      const ajustesExterior = guia.ajustesEditablesDe(exterior.AJUSTES.plantilla, estado.eje, estado.identidad, valoresExterior);
      if (ajustesExterior?.cambiado) await salida.escribirDesde(estado.eje, { modo: 'sequenced', autor: estado.identidad, sobre: ajustesExterior.sobre, en: ajustesExterior.en, payload: ajustesExterior.payload, ...horaDe() }, privadaDe(estado.identidad));
      if (valoresSegundo.family) {
        const familias = valoresSegundo.family.split(/[\s,]+/).filter(Boolean);
        const r = await enviar(estado.eje, estado.eje.alta(estado.identidad).id, 'second factor', { family: familias.length === 1 ? familias[0] : familias, amount: Number(valoresSegundo.amount || 0), ...(valoresSegundo.holder ? { holder: valoresSegundo.holder } : {}) }, estado.identidad, firmarCon(estado.identidad));
        if (!r.asentado) throw new Error(motivosEnLlano(r.motivos, estado.eje).map((m) => m.mensaje ?? m).join(' · ') || 'second factor');
      }
      guardar();
      estado.config = false;
      estado.motivosPreferencias = [];
      estado.exito = t('configuracionGuardada');
    } catch (e) {
      estado.motivosPreferencias = [{ mensaje: enLlano(String(e.message ?? e).replace(/^evento (rechazado|mal formado): /, ''), e) }];
    }
    // El servidor, el eje compartido o la clave pueden haber cambiado: la sincronía se vuelve a abrir (y sube la configuración).
    abrirSincronia();
    pintar();
  },
  async campo(X, pv, texto, { nuevo = false } = {}) {
    try {
      // Desde el aro de un hueco bajado por dígitos, la dirección entera (estado.aro.en); si no, la posición pv de X.
      const en = nuevo && estado.aro?.X === X && estado.aro?.nuevo === pv && Array.isArray(estado.aro.en) ? estado.aro.en : [pv];
      const ev = await salida.escribirDesde(estado.eje, { modo: 'pointed', autor: estado.identidad, sobre: X, en: direccion(en), payload: salida.desdePointed(estado.eje, texto), ...horaDe() }, privadaDe(estado.identidad));
      trasEscribir();
      // Lo escrito desde el centro del aro en edición: hecho, se cierra. Desde el aro de un hueco (issue #22): el elemento
      // nuevo existe y se abre su aro (en su 2, «adjuntar un archivo»), en el mismo sitio.
      estado.aro = nuevo ? { X: ev.id, pv: null, ancla: estado.aro?.ancla ?? null, editar: false } : null;
      estado.exito = t(nuevo ? 'creado' : 'escrito', { id: ev.id.slice(0, 8), pv, X: X.slice(0, 8) }) + (ev.firma ? ' ' + t('firmado') : '');
      estado.aviso = '';
      tocar(X, 'escribir ' + pv);
      marcarNuevos();
    } catch (e) {
      estado.aviso = enLlano(String(e.message ?? e).replace(/^evento (rechazado|mal formado): /, ''), e);
    }
    pintar();
  },
  cargarMas(pv) {
    estado.paginas[pv] = (estado.paginas[pv] ?? 1) + 1;
    tocar(estado.foco.X, 'cargar más ' + pv);
    pintar();
  },
  /** Un rosetón (los míos, VG 14-11, #91): pulsarlo lo amplía, flotando sobre la carta; pulsar el mismo lo cierra. */
  roseton(pv) {
    const alta = estado.eje.alta(estado.identidad)?.id;
    const abierto = hayRosetonAmpliado(estado.rosetones);
    estado.rosetones = alternarRoseton(estado.rosetones, pv);
    if (alta && !abierto) tocar(alta, 'rosetón ' + pv);
    pintar();
  },
  /** Doble toque en un rosetón: su vista ampliada a pantalla completa (la configuración de la cartera, por ahora la misma vista). */
  rosetonCompleto(pv) {
    const alta = estado.eje.alta(estado.identidad)?.id;
    estado.rosetones = rosetonAPantallaCompleta(pv);
    if (alta) tocar(alta, 'rosetón ' + pv + ' completa');
    pintar();
  },
  /** Pulsar fuera del rosetón ampliado, o su «cerrar»: se cierra. */
  cerrarRoseton() {
    estado.rosetones = {};
    pintar();
  },
  /**
   * «buscar su recibo de pago» en el reverso de un registro (encargo «carta: pagos»): lo apunta en la sincronía de la
   * cuenta (esperarPago, por el puntero del pago: el id del registro) y sincroniza; el recibo entra cuando llega. Sin
   * libro compartido o sin «pay url» no hay a quién pedirlo: se dice.
   */
  buscarPago(X) {
    const S = estado.sincronia;
    if (!X || !estado.eje?.obtener(X)) return;
    if (!S?.pago) {
      estado.aviso = t('pagoSinLibro');
      pintar();
      return;
    }
    S.esperarPago(X);
    guardar();
    pintar();
    void sincronizar();
  },
  /**
   * «autorizar» en lo por autorizar del 6 de mi alta (encargo «anfitrión», carta/anfitrion.js): por cada cosa mía que
   * le falta, el firmante del anfitrión; lo que firma bien se asienta como cualquier registro (eje.anadir y, tras
   * escribir, guardar y sincronizar) y se repinta; sin clave, el aviso; lo que no vale, sus motivos en el aviso.
   */
  async autorizar(id) {
    if (!anfitrion || !id || autorizando.has(id) || !estado.eje?.obtener(id)) return;
    limpiarMensajes();
    const cosas = porFirmar(estado.eje, estado.identidad, id, { epoca: estado.eje.epoca(), idioma: idioma() });
    if (!cosas.length) return;
    autorizando.add(id);
    pintar();
    try {
      const r = await autorizarCon(anfitrion, estado.eje, id, cosas, { idioma: idioma(), asentar: (ev) => estado.eje.anadir(ev), sinClave: (cosa) => t('autorizarSinClave', { cosa }) });
      if (r.asentados.length) {
        trasEscribir();
        estado.exito = t('autorizadoPor', { cosas: cosas.filter((c) => r.asentados.some((ev) => ev.autor === c.id)).map((c) => c.texto).join(', ') });
        marcarNuevos();
      }
      const avisos = [...r.avisos, ...motivosEnLlano(r.motivos, estado.eje).map((m) => m.mensaje)];
      if (avisos.length) estado.aviso = avisos.join(' · ');
    } catch (e) {
      estado.aviso = String(e?.message ?? e);
    } finally {
      autorizando.delete(id);
    }
    pintar();
  },
  /** El reverso como editor de BTML (#93): alternar el BTML crudo y el formateado, solo en esta sesión (no se escribe nada: cómo se abre es «al abrir»). */
  formatear() {
    estado.formatoSesion = !formatoDe().formateado;
    pintar();
  },
  /**
   * Un criterio de formato del BTML (fecha, números, estilo, al abrir): con cuenta, un registro «format settings» en el
   * libro por cada cambio, por el camino de las preferencias; sin cuenta, en memoria durante la sesión. El idioma es
   * la preferencia «language» del núcleo.
   */
  async formato(clave, valor) {
    if (clave === 'idioma') return manejadores.preferencia('language', valor);
    if (!estado.cuenta) {
      estado.formatoMemoria = { ...estado.formatoMemoria, [clave]: valor };
      pintar();
      return;
    }
    try {
      const r = registroDeFormato(estado.eje, estado.identidad, { [clave]: valor });
      if (!r) throw new Error(t('sinAlta'));
      await salida.escribirDesde(estado.eje, { modo: 'sequenced', autor: estado.identidad, sobre: r.sobre, en: r.en, payload: r.payload, ...horaDe() }, privadaDe(estado.identidad));
      guardar();
      estado.aviso = '';
    } catch (e) {
      estado.aviso = enLlano(String(e.message ?? e).replace(/^evento (rechazado|mal formado): /, ''), e);
    }
    abrirSincronia();
    pintar();
  },
  leido() {
    estado.leido = alternarLeido();
    tocar(estado.foco.X, 'leído');
    pintar();
  },
  async englobar() {
    if (!estado.local) return;
    try {
      const ev = await estado.local.englobar(firmarCon(estado.identidad), { nota: t('unRatoEnLaCarta') });
      trasEscribir();
      estado.exito = ev ? t('esteRatoEnElEje', { id: ev.id.slice(0, 8) }) : t('nadaQueEnglobar');
      estado.aviso = '';
      marcarNuevos();
    } catch (e) {
      estado.aviso = enLlano(String(e.message ?? e).replace(/^evento (rechazado|mal formado): /, ''), e);
    }
    pintar();
  },
  /** El selector «soy»: una de mis cuentas (cuenta:<alta>), crear o restaurar una, probar con un ejemplo, o una identidad del eje de ejemplo. */
  async quien(valor) {
    if (valor.startsWith('cuenta:')) { await entrarEnCuenta(valor.slice('cuenta:'.length)); return; }
    if (valor === 'nueva') return manejadores.arranque('crear');
    if (valor === 'restaurar') return manejadores.arranque('restaurar');
    if (valor === EJEMPLO) return manejadores.arranque(EJEMPLO);
    const id = valor;
    if (!estado.eje?.identidades().includes(id)) return;
    guardarLibroLocal();
    estado.identidad = id;
    if (!estado.cuenta) guardarLocal(CLAVE_YO, id);
    abrirLibroLocal();
    estado.aro = null;
    estado.formulario = null;
    estado.sitio = null;
    estado.rosetones = {};
    limpiarMensajes();
    pintar();
  },
  async ejemplo(id) {
    if (estado.cuenta || !EJEMPLOS.some((e) => e.id === id) || id === ejemploElegido()) return;
    elegirEjemplo(id);
    await reiniciar();
  },
  reiniciar,
  /**
   * Seguir el camino (autoejecutar). Camino B: firma varios pasos seguidos sin que se pida cada uno, así que es una firma
   * automática: con la sesión del guardián cerrada no se intenta (aviso persistente; el botón «abrir la sesión» lo
   * rehace con `gesto`, y entonces sí se intenta).
   */
  async seguir({ gesto = false, X: dado } = {}) {
    const X = dado ?? estado.foco.X;
    if (estado.cuenta?.firmante && !gesto && !(await sesionAbierta(guardian, estado.cuenta.publica))) {
      estado.guardian.sesionCerrada = true;
      estado.guardian.pendiente = { que: 'seguir', X };
      pintar();
      return;
    }
    try {
      const r = await acciones.autoejecutar(estado.eje, X, estado.identidad, firmarCon(estado.identidad), horaDe());
      trasEscribir();
      const hechos = r.hechos.map((h) => nombreDeAccion(h.paso.hacer.plantilla)).join(', ');
      const delGuardian = r.parado ? errorDelGuardian() : null; // parado porque el guardián no firmó: dicho en llano
      estado.exito = (r.hechos.length ? t('hechos', { cuales: hechos }) : t('ningunPasoDado')) + (r.parado && !delGuardian ? ' ' + t('paradoEn', { que: r.parado.paso.hacer ? nombreDeAccion(r.parado.paso.hacer.plantilla) : r.parado.paso.falta, motivos: r.parado.motivos.map((m) => m.mensaje).join('; ') }) : '');
      estado.aviso = delGuardian ?? '';
      tocar(X, 'seguir');
      marcarNuevos();
    } catch (e) {
      estado.aviso = enLlano(String(e.message ?? e), e);
    }
    pintar();
  },
  /**
   * El botón del aviso «la sesión del guardián está cerrada» (camino B), un gesto del usuario: con algo parado esperando
   * firma, lo rehace (seguir: su firma abre el diálogo del guardián); si no, pide la sesión con `pedirSesion` (el diálogo
   * del guardián, sin escribir ningún registro). Después vuelve a mirar la sesión: abierta, el aviso se va; si el guardián
   * no la abrió, el aviso se queda con una línea (no reintenta sola).
   */
  async abrirGuardian() {
    const g = estado.guardian;
    if (!estado.cuenta?.firmante || g.abriendo) return;
    const cuenta = estado.cuenta;
    g.abriendo = true;
    limpiarMensajes();
    await pintar();
    g.noAbrio = false;
    const pendiente = g.pendiente;
    g.pendiente = null;
    try {
      if (pendiente?.que === 'seguir') await manejadores.seguir({ gesto: true, X: pendiente.X });
      else {
        const r = await pedirSesion(guardian, cuenta.publica); // null: sin el verbo, el botón no se enseña
        if (r && !r.abierta) g.noAbrio = true;
      }
    } finally {
      g.abriendo = false;
      if (estado.cuenta === cuenta) {
        g.sesionCerrada = !(await sesionAbierta(guardian, cuenta.publica));
        if (!g.sesionCerrada) g.noAbrio = false;
      }
      pintar();
    }
  },
  /** Previsualizar un paso del camino (encargo «datos3»): construirlo y validarlo sin escribir; lo que daría, bajo el paso. */
  async previsualizar(X, accion, paso) {
    const p = ultimo?.camino?.pasos?.[paso];
    if (!accion || !p?.hacer) return;
    try {
      const r = await previsualizar(estado.eje, X ?? estado.foco.X, accion, p.hacer.parametros ?? {}, estado.identidad, firmarParaVer(estado.identidad));
      estado.previa = { foco: estado.foco.X, paso, ...r, motivos: motivosEnLlano(r.motivos, estado.eje), ...(r.lectura ? { lectura: { ...r.lectura, mensaje: sinNombreInterno(r.lectura.mensaje, estado.eje) } } : {}) };
    } catch (e) {
      estado.previa = { foco: estado.foco.X, paso, ok: false, motivos: [{ regla: null, mensaje: String(e.message ?? e) }], movimientos: [] };
    }
    pintar();
  },
  /** La cohorte con que el cielo del 8 compara (encargo «datos3»): solo se mira así; elegirla para siempre es «change cohort», en el aro del 8. */
  cohorte(valor) {
    estado.cohorte = valor || null;
    tocar(estado.foco.X, 'cohorte ' + valor);
    pintar();
  },
  /** Abrir entera (en vertical) o volver a compactar una cadena del 7 del roadmap (forma «cadenas»): su clave, el id de su primer paso. Solo se mira. */
  cadena(clave) {
    if (!clave) return;
    const abiertas = { ...(estado.cadenasAbiertas ?? {}) };
    if (abiertas[clave]) delete abiertas[clave];
    else abiertas[clave] = true;
    estado.cadenasAbiertas = abiertas;
    pintar();
  },
  /** Abrir (o cerrar) una celda de la matriz del 4 de X (encargo «el4», VG 12-11, #49.8): su lista de movimientos, hasta diez. Solo se mira. */
  celdaMatriz(X, celda) {
    const misma = estado.celdaMatriz?.X === X && estado.celdaMatriz?.celda === celda;
    estado.celdaMatriz = X && celda && !misma ? { X, celda } : null;
    tocar(estado.foco.X, 'celda de la matriz ' + (estado.celdaMatriz?.celda ?? '-'));
    pintar();
  },
  hermano(delta, pv) {
    // Cambiar de PV (la franja) o de hermano: con un PV abierto, el siguiente lateral; en el centro, el hermano del foco.
    if (pv !== null && pv !== undefined) {
      if (enMapped() || enSecuencia()) return; // en Mapped y en la columna de Sequenced cada PV tiene su sitio: deslizar sobre uno no lo cambia por otro
      const i = LATERALES.indexOf(pv);
      const siguiente = LATERALES[(i + delta + LATERALES.length) % LATERALES.length];
      estado.niveles = { [siguiente]: Math.max(NIVEL.tarjeta, estado.niveles[pv] ?? NIVEL.tarjeta) };
      tocar(estado.foco.X, 'pv ' + siguiente);
      pintar();
      return;
    }
    const ev = estado.eje.obtener(estado.foco.X);
    if (!ev?.sobre) return;
    const hermanos = estado.eje.sobre(ev.sobre).map((h) => h.id);
    const i = hermanos.indexOf(ev.id);
    const otro = hermanos[(i + delta + hermanos.length) % hermanos.length];
    if (otro && otro !== ev.id) irA(otro, 0);
  },
  saltar(pv) {
    if (enSecuencia()) return manejadores.digito(pv); // las teclas 0-9, como la fila de dígitos
    if (CENTROS.includes(pv)) { estado.foco.pv = pv; pintar(); return; }
    estado.niveles[pv] = Math.max(NIVEL.tarjeta, estado.niveles[pv] ?? NIVEL.comprimido);
    pintar();
    raiz.querySelector(`[data-pv="${pv}"]:not(.ocupante):not(.rejilla-celda)`)?.focus();
  },

  // ---------- la guía del PV9 (carta/guia.js): solo lectura ----------

  /** Pregunta a la guía con el contexto exacto de la pantalla; la respuesta se guarda en la conversación de esta alta. */
  async guiaPreguntar(pregunta) {
    const texto = String(pregunta ?? '').trim();
    const g = estado.guia;
    const eje = estado.eje;
    const yo = estado.identidad;
    const alta = altaDeGuia();
    if (!texto || g.pensando || !alta) return;
    datosGuia();
    Object.assign(g, { pensando: true, pendiente: texto, error: '', borrador: '' });
    pintarGuia();
    const aj = guia.ajustes(eje, yo);
    let r;
    try {
      const destino = guia.destinoDe(eje, yo);
      r = await guia.preguntar({
        via: aj.via, ejemplo: !estado.cuenta, url: destino?.url, ejeCompartido: destino?.eje, claveLectura: cuentas.claveLectura(alta), claveIa: guia.claveIa(almacenLocal(), alta),
        modelo: aj.modelo, instrucciones: guia.instrucciones(eje, estado.foco.X, yo), historial: g.alta === alta ? g.historial : [], pregunta: texto, maximo: aj.historial,
        contexto: await guia.contexto(estado, eje, yo, { ...medidas(), cuenta: Boolean(estado.cuenta), tope: aj.contexto }),
      });
    } catch (e) {
      r = { ok: false, motivo: String(e?.message ?? e) };
    }
    if (r.ok) {
      const h = [...guia.cargarHistorial(almacenLocal(), alta, aj.historial), { role: 'user', content: texto }, { role: 'assistant', content: r.texto }].slice(-aj.historial);
      guia.guardarHistorial(almacenLocal(), alta, h, aj.historial);
      if (g.alta === alta) g.historial = h;
    } else if (g.alta === alta) {
      g.error = r.motivo;
      g.borrador = texto;
    }
    if (g.alta === alta) Object.assign(g, { pensando: false, pendiente: '' });
    pintarGuia();
  },
  /** Descargar el markdown con las instrucciones de la guía y el contexto exacto de la pantalla (carta/externa.js). */
  async guiaExportar() {
    if (!estado.eje || !estado.foco.X) return;
    try {
      const archivo = await externa.exportar(estado, estado.eje, estado.identidad, { ...medidas(), cuenta: Boolean(estado.cuenta) });
      descargarArchivo(archivo);
      estado.exito = t('externaDescargado', { archivo: archivo.nombre });
      estado.aviso = '';
    } catch (e) {
      estado.aviso = String(e?.message ?? e);
    }
    pintar();
  },
  /** Elegir el archivo de propuestas (el input oculto de la guía); lo que se elija llega a guiaArchivo. */
  guiaImportar() {
    raiz.querySelector('[data-guia-archivo]')?.click();
  },
  /** El texto de un archivo de propuestas: las que se entienden y las que no entran como pendientes. */
  guiaArchivo(texto) {
    const r = externa.importar(texto);
    if (!r.ok) { estado.aviso = r.motivo; estado.exito = ''; }
    else if (externa.anadirPropuestas(almacenLocal(), dondePropuestas(), r.propuestas)) { estado.exito = t('externaImportadas', { cuantas: r.propuestas.length }); estado.aviso = ''; }
    else { estado.aviso = t('sinAlmacenamiento'); estado.exito = ''; }
    pintar();
  },
  /**
   * Una propuesta importada: aceptar (lanzarla con sus parámetros: acciones.transaccion, las reglas y la firma; si algo no
   * pasa, el formulario con el motivo), modificar (el formulario con los parámetros rellenos) o rechazar (descartarla).
   */
  async propuesta(que, id) {
    const p = externa.leerPropuestas(almacenLocal(), dondePropuestas()).find((x) => x.id === id);
    if (!p || !estado.eje) return;
    if (que === 'rechazar') {
      externa.quitarPropuesta(almacenLocal(), dondePropuestas(), id);
      limpiarMensajes();
      pintar();
      return;
    }
    const e = externa.evaluar(estado.eje, estado.identidad, p);
    if (!e.valida) return;
    let motivos = [];
    if (que === 'aceptar') {
      // Con su instante, si lo trae (la petición de alta de una cosa: su prueba de posesión firma el id de ese registro).
      const r = await enviar(estado.eje, e.sobre, e.accion, e.parametros, estado.identidad, firmarCon(estado.identidad), e.t ? { t: e.t } : {});
      if (r.ok && r.asentado) {
        trasEscribir();
        externa.quitarPropuesta(almacenLocal(), dondePropuestas(), id);
        estado.exito = t('registrado', { accion: nombreDeAccion(e.accion), id: r.asentado.id.slice(0, 8) }) + (r.asentado.firma ? ' ' + t('firmado') : '');
        estado.aviso = '';
        tocar(e.sobre, 'hecho ' + canonicoDe(e.accion));
        marcarNuevos();
        pintar();
        return;
      }
      motivos = motivosConGuardian(motivosEnLlano(r.motivos, estado.eje)); // lo que no pasa se enseña en el formulario, para cambiarlo
    }
    estado.formulario = { X: e.sobre, accion: e.accion, valores: e.parametros, motivos, resultado: null, propuesta: id };
    estado.aro = null;
    limpiarMensajes();
    tocar(e.sobre, 'lanzar ' + canonicoDe(e.accion));
    pintar();
  },
  /**
   * Tocar una zona de la cara (DISENO_ZONAS_GUIA §4): se vuelve a leer la zona en el libro (nunca del DOM). Si lleva a un
   * paso de una guía, es seguir ese paso; a otro registro de este libro, el foco va a él; a un registro de otro libro, se
   * entra en ese libro con el foco en él si está en este dispositivo, y si no, se dice. Nunca firma, escribe, lanza ni
   * pide nada a la red.
   */
  async zona(X, id) {
    if (!estado.eje || !X || !id) return;
    const z = contrato.zonas(estado.eje, X).find((x) => x.id === id);
    if (!z) { limpiarMensajes(); estado.aviso = t('zonaNoEsta'); pintar(); return; }
    const { libro, registro } = z.destino;
    if (libro === null) {
      if (guiasCarta.pasoDelLibro(estado.eje, registro)) return seguirPasoDeGuia(null, registro);
      return irA(registro, 0);
    }
    const entrada = await guiasCarta.libroDeEntrada(libro, { entradas: estado.cuenta ? misEntradas() : [], libros: librosDelDispositivo, actual: libroAbierto() });
    if (!entrada) { limpiarMensajes(); estado.aviso = t('zonaLibroNoEsta'); pintar(); return; }
    const ejeDestino = await librosDelDispositivo.eje(entrada.alta);
    if (ejeDestino && guiasCarta.pasoDelLibro(ejeDestino, registro)) return seguirPasoDeGuia(entrada.alta, registro);
    limpiarMensajes();
    await entrarEnCuenta(entrada.alta, { foco: registro });
  },
  /** Tocar un paso de una de mis guías en el 9: seguirlo (el formulario de su acción, relleno). */
  guiaPaso(id) {
    if (!id) return;
    return seguirPasoDeGuia(guiaDePaso.has(id) ? guiaDePaso.get(id) : null, id);
  },
  /** Tocar un paso en el camino de su guía (en el libro de la guía): seguirlo, en el libro donde se hace. */
  guiaSeguir(id) {
    if (!id) return;
    return seguirPasoDeGuia(null, id);
  },
  /** Una de las preguntas hechas de la época (los botones rápidos). */
  guiaRapida(i) {
    const q = guia.preguntasRapidas(estado.eje, idioma())[i];
    if (q) return manejadores.guiaPreguntar(q);
  },
  /** Con quién habla el PV9: la guía o Core (solo con el servidor de retoques). */
  guiaCon(con) {
    estado.guia.con = con === 'core' && retoques() ? 'core' : 'guia';
    pintarGuia();
  },
  /** Manda a Core lo escrito, con el contexto de la pantalla (guia.contexto), el entorno (opinar.entornoDe) y lo señalado; la respuesta se pinta según llega. */
  async corePreguntar(pedido) {
    const r = retoques();
    const c = estado.core;
    const texto = String(pedido ?? '').trim();
    if (!r || !texto || c.pensando || !estado.eje) return;
    datosCore();
    const aj = guia.ajustes(estado.eje, estado.identidad);
    const carta = raiz.querySelector('[data-nodo="carta"]');
    const deLaCarta = carta ? opinar.entornoDe(carta) : {};
    const entorno = { libro: estado.cuenta ? { nombre: estado.cuenta.nombre, alta: estado.cuenta.alta } : 'ejemplo', yo: estado.identidad, ...deLaCarta, foco: { ...estado.foco, X0: deLaCarta.foco?.X0 ?? null }, niveles: estado.niveles };
    let contexto = '';
    try { contexto = await guia.contexto(estado, estado.eje, estado.identidad, { ...medidas(), cuenta: Boolean(estado.cuenta), tope: aj.contexto }); } catch (e) { contexto = String(e?.message ?? e); }
    const senalado = c.senalado;
    const cuerpo = guia.mensajeACore({ texto, contexto, entorno, senalado });
    c.turnos = [...c.turnos, { role: 'user', texto, senalado: senalado.map((s) => s.etiqueta) }, { role: 'core', texto: '' }];
    Object.assign(c, { pensando: true, borrador: '', senalado: [], senalando: false, error: '' });
    guia.guardarCore(almacenLocal(), c.turnos);
    pintarGuia();
    const turnos = c.turnos;
    await r.core(cuerpo, (trozo) => {
      if (c.turnos !== turnos) return; // una conversación nueva entre medias
      c.turnos[c.turnos.length - 1] = guia.conTrozo(c.turnos[c.turnos.length - 1], trozo);
      if (trozo.tipo !== 'texto') guia.guardarCore(almacenLocal(), c.turnos);
      if (trozo.tipo === 'fin' || trozo.tipo === 'error') c.pensando = false;
      pintarGuiaPronto();
    });
    c.pensando = false;
    guia.guardarCore(almacenLocal(), c.turnos);
    pintarGuia();
    void refrescarFondo();
  },
  /** «Señalar»: el siguiente toque en la carta señala ese elemento (otra vez, lo deja). */
  coreSenalar() {
    estado.core.senalando = !estado.core.senalando;
    pintarGuia();
  },
  /** Quitar una etiqueta de lo señalado. */
  coreQuitar(i) {
    estado.core.senalado = estado.core.senalado.filter((_, j) => j !== i);
    pintarGuia();
  },
  /**
   * «Entrar en el libro del roadmap» (el ensayo): la copia de la cuenta de la dueña que da el servidor de retoques, restaurada
   * por el camino de siempre (cuentas.restaurarCuenta, el eje del libro compartido, guardarla aquí), abierta y sincronizada.
   */
  async coreEnsayo() {
    const r = retoques();
    const c = estado.core;
    if (!r?.ensayoCuenta || c.entrandoEnsayo || !hayQueEntrarEnElEnsayo()) return;
    Object.assign(c, { entrandoEnsayo: true, errorEnsayo: '' });
    pintarEnsayo();
    try {
      const { copia, frase } = await r.ensayoCuenta();
      // La copia puede ser la de los dos libros de la dueña (el roadmap y la guía de ensayo, cuentas.exportarTodos): se
      // guardan todos, cada uno con su libro compartido, y se entra en el del roadmap.
      const todos = cuentas.esCopiaDeTodos(copia) ? await cuentas.restaurarTodos(copia, frase) : null;
      const lista = todos ? todos.restaurados : [await cuentas.restaurarCuenta(copia, frase)];
      let rc = null;
      let delLibro = null;
      let guardada = true;
      let aviso = '';
      for (const x of lista) {
        const destino = x.claveLectura ? sincronia.destino(x.eje, x.cuenta.identidad) : null;
        let suyo = null;
        if (destino) {
          const d = await sinc.ejeDelServidor({ cuenta: x.cuenta, url: destino.url, eje: destino.eje, claveLectura: x.claveLectura, foto: x.eje });
          if (d.eje) { x.eje = d.eje; suyo = d.sincronia; } else aviso = t('noBajaDelServidor', { motivo: d.motivo });
        }
        guardada = (await cuentas.guardarCuenta(x)) && guardada;
        if (suyo) cuentas.guardarEstadoSincronia(x.cuenta.alta, suyo.serializar());
        if (!rc || x.cuenta.alta === estado.core.ensayo?.alta) { rc = x; delLibro = suyo; }
      }
      if (!rc) throw new Error((todos?.fallidos ?? []).map((f) => f.motivo).join(' · '));
      entrarCon(rc);
      estado.guardado = guardada ? t('guardadoEnNavegador', { cuantos: rc.eje.orden.length }) : t('sinAlmacenamiento');
      estado.exito = t('cuentaRestaurada', { nombre: rc.cuenta.nombre, cuantos: rc.eje.orden.length }) + (delLibro ? ' · ' + t('ejeDelServidor', { cuantos: rc.eje.orden.length }) : '');
      estado.aviso = aviso;
      estado.foco = { X: rc.cuenta.alta, pv: 0 };
      tocar(rc.cuenta.alta, null);
      marcarNuevos();
      if (estado.sincronia) void sincronizar();
      c.entrandoEnsayo = false;
      await pintar();
    } catch (e) {
      Object.assign(c, { entrandoEnsayo: false, errorEnsayo: String(e?.message ?? e) });
      pintarEnsayo();
    }
  },
  /** Una conversación nueva con Core: la del agente y la de este navegador. */
  async coreNueva() {
    const r = retoques();
    if (!r || estado.core.pensando) return;
    const hecho = await r.nueva();
    if (hecho.ok) {
      guia.vaciarCore(almacenLocal());
      Object.assign(estado.core, { turnos: [], error: '' });
    } else estado.core.error = hecho.motivo ?? '';
    pintarGuia();
  },
  /** Vaciar la conversación de esta alta. */
  guiaVaciar() {
    const alta = altaDeGuia();
    if (!alta) return;
    guia.vaciarHistorial(almacenLocal(), alta);
    Object.assign(estado.guia, { historial: [], error: '' });
    pintarGuia();
  },

  // ---------- mi cuenta ----------

  /** La pantalla de arranque: el menú, crear, restaurar, probar con un ejemplo o entrar en una cuenta guardada. */
  async arranque(que) {
    limpiarMensajes();
    if (que === 'crear' || que === 'crear-mio') {
      // «crear-mio» (A24, §4.2): un libro nuevo con la clave del libro abierto; «crear», persona nueva (una clave nueva).
      const conMiClave = que === 'crear-mio' && firmaLaCuenta();
      estado.arranque = { modo: 'crear', campos: cuentas.camposDelAlta({ idioma: idiomaDeInterfaz() }), valores: {}, motivos: [], conClave: firmaLaCuenta(), conMiClave };
    } else if (que === 'restaurar') {
      estado.arranque = { modo: 'restaurar', motivos: [] };
    } else if (que === EJEMPLO) {
      estado.arranque = null;
      await entrarEnEjemplo();
      return;
    } else if (typeof que === 'string' && que.startsWith('cuenta:')) {
      await entrarEnCuenta(que.slice('cuenta:'.length));
      return;
    } else {
      estado.arranque = { modo: 'menu', conClave: firmaLaCuenta() };
    }
    estado.copia = null;
    estado.libroPrivado = null;
    estado.config = false;
    estado.formulario = null;
    estado.aro = null;
    await pintar();
  },
  /** Crear mi cuenta con el nombre y el idioma del formulario: la clave se genera aquí, el génesis es mi alta, y se entra. */
  async crear(form) {
    const ar = estado.arranque;
    if (!ar || ar.modo !== 'crear' || ar.ocupado) return;
    ar.valores = valoresDe(form);
    ar.motivos = [];
    ar.ocupado = true;
    await pintar();
    try {
      // Camino B: la cuenta nace en el guardián (su clave nunca llega aquí) y todo lo de su alta lo firma él.
      // Un libro nuevo con mi clave (A24, §4.2): la de la entrada abierta (con el guardián, la misma pública) y mi identidad;
      // sin «sync ledger» del sitio, que es el nombre del libro compartido del otro: el nuevo queda solo en este dispositivo.
      const mio = ar.conMiClave && estado.cuenta ? estado.cuenta : null;
      const ajustes = mio ? Object.fromEntries(Object.entries(ajustesDelSitio.defectos() ?? {}).filter(([k]) => k !== sincronia.CONFIGURACION.eje)) : ajustesDelSitio.defectos();
      // Con el emparejamiento por QR (A25), un libro nuevo con la clave de una cuenta del navegador no pasa por la app.
      const conGuardian = guardian && !(mio && mio.guardian !== true && guardian === emparejado.adaptador);
      const r = await cuentas.crearCuenta({ nombre: ar.valores.nombre, idioma: ar.valores.idioma, ajustes, htmlInicial: true, ...(conGuardian ? { guardian } : {}), ...(mio ? { conClave: { publica: mio.publica, privada: mio.privada }, identidad: mio.identidad } : {}) });
      const guardada = await cuentas.guardarCuenta(r);
      entrarCon(r);
      estado.guardado = guardada ? t('guardadoEnNavegador', { cuantos: r.eje.orden.length }) : t('sinAlmacenamiento');
      estado.exito = t('cuentaCreada');
      estado.niveles[PV_CAMINO] = NIVEL.tarjeta; // el tutorial del alta nueva, a la vista
      estado.foco = { X: r.cuenta.alta, pv: 0 };
      tocar(r.cuenta.alta, null);
      marcarNuevos();
      await pintar();
    } catch (e) {
      ar.ocupado = false;
      // Camino B: lo que rechaza el guardián, en llano (lo escrito sigue en el formulario: ar.valores); lo demás, tal cual.
      const delGuardian = guardian && codigoDe(e) ? claveDelError(e) : null;
      if (delGuardian === 'guardianFallo') console.error('guardián:', String(e?.message ?? e));
      ar.motivos = [{ mensaje: delGuardian ? t(delGuardian) : String(e?.message ?? e) }];
      await pintar();
    }
  },
  /** Restaurar una cuenta desde su archivo de copia y la frase: se descifra, se revalida el eje, se guarda aquí y se entra. */
  async restaurar(form) {
    const ar = estado.arranque;
    if (!ar || ar.modo !== 'restaurar' || ar.ocupado) return;
    const archivo = form.querySelector('input[name="archivo"]')?.files?.[0];
    const { frase } = valoresDe(form);
    if (!archivo) { ar.motivos = [{ mensaje: t('sinArchivo') }]; await pintar(); return; }
    ar.motivos = [];
    ar.ocupado = true;
    await pintar();
    let texto;
    try {
      texto = await archivo.text();
    } catch (e) {
      ar.ocupado = false;
      ar.motivos = [{ mensaje: t('archivoNoLeido', { motivo: e?.message ?? e }) }];
      await pintar();
      return;
    }
    // La copia de todos mis libros (A24, §4.7): cada libro, tal cual; uno malo no estropea los demás y se dice cuál.
    if (cuentas.esCopiaDeTodos(texto)) { await restaurarTodos(ar, texto, frase); return; }
    try {
      // La copia de una cuenta del guardián: para leer hasta que el guardián de este equipo tenga la cuenta (conGuardian).
      const r = await cuentas.conGuardian(await cuentas.restaurarCuenta(texto, frase), guardian);
      // Con el libro compartido (la copia lleva la clave de lectura y su eje, el servidor y el eje compartido), el eje
      // nace del génesis del servidor (sincronizar(null)) y lo de la foto que falte va detrás; si no se puede, se sigue
      // con la foto, como hoy, y se dice.
      const destino = r.claveLectura ? sincronia.destino(r.eje, r.cuenta.identidad) : null;
      let delLibro = null;
      let aviso = '';
      if (destino) {
        const d = await sinc.ejeDelServidor({ cuenta: r.cuenta, url: destino.url, eje: destino.eje, claveLectura: r.claveLectura, foto: r.eje });
        if (d.eje) { r.eje = d.eje; delLibro = d.sincronia; } else aviso = t('noBajaDelServidor', { motivo: d.motivo });
      }
      const existia = cuentas.cuentas().some((c) => c.alta === r.cuenta.alta);
      const guardada = await cuentas.guardarCuenta(r);
      if (delLibro) cuentas.guardarEstadoSincronia(r.cuenta.alta, delLibro.serializar());
      entrarCon(r);
      estado.guardado = guardada ? t('guardadoEnNavegador', { cuantos: r.eje.orden.length }) : t('sinAlmacenamiento');
      estado.exito = t('cuentaRestaurada', { nombre: r.cuenta.nombre, cuantos: r.eje.orden.length }) + (delLibro ? ' · ' + t('ejeDelServidor', { cuantos: r.eje.orden.length }) : '') + (existia ? ' · ' + t('cuentaSustituida') : '');
      estado.aviso = aviso;
      estado.foco = { X: r.cuenta.alta, pv: 0 };
      tocar(r.cuenta.alta, null);
      marcarNuevos();
      await pintar();
    } catch (e) {
      ar.ocupado = false;
      ar.motivos = [{ mensaje: e?.antigua ? t('copiaDeFirmasAntiguas') : String(e?.message ?? e) }];
      await pintar();
    }
  },
  /** La copia de seguridad: abrir el diálogo (null) o, con el formulario, cifrar con la frase y descargar el archivo. */
  async copia(form, { todos = false } = {}) {
    if (!estado.cuenta) return;
    if (!form) {
      // La de todos mis libros (A24, §4.7): un archivo con la copia de cada libro de mi clave, tal cual.
      estado.copia = todos
        ? { todos: true, archivo: cuentas.nombreDeArchivoDeTodos(estado.cuenta), cuantos: misEntradas().length, minimo: FRASE_MINIMA, motivos: [], hecho: '' }
        : { archivo: cuentas.nombreDeArchivo(estado.cuenta), minimo: FRASE_MINIMA, motivos: [], hecho: '' };
      estado.config = false;
      estado.formulario = null;
      estado.aro = null;
      estado.sitio = null;
      limpiarMensajes();
      await pintar();
      return;
    }
    const c = estado.copia;
    if (!c || c.ocupado) return;
    const { frase, frase2 } = valoresDe(form);
    if (!frase || frase.length < FRASE_MINIMA) { c.motivos = [{ mensaje: t('fraseCorta') }]; await pintar(); return; }
    if (frase !== frase2) { c.motivos = [{ mensaje: t('frasesNoCoinciden') }]; await pintar(); return; }
    c.motivos = [];
    c.ocupado = true;
    await pintar();
    try {
      let fuera = '';
      let archivo;
      if (c.todos) {
        guardar(); // lo de este libro, al día antes de leerlo
        const { libros: mios, fallidos } = await libros.librosParaCopia(misEntradas(), { guardian });
        archivo = await cuentas.exportarTodos(mios, frase);
        if (fallidos.length) fuera = ' · ' + t('copiaDeTodosSinAlguno', { lista: fallidos.map((f) => `«${f.nombre}» (${f.motivo})`).join('; ') });
      } else archivo = await cuentas.exportarCuenta({ cuenta: estado.cuenta, eje: estado.eje, privada: estado.cuenta.privada, claveLectura: cuentas.claveLectura(estado.cuenta.alta) }, frase);
      descargar(cuentas.textoDeArchivo(archivo), c.archivo);
      estado.copia = null;
      estado.exito = t('copiaDescargada', { archivo: c.archivo }) + fuera;
    } catch (e) {
      c.ocupado = false;
      c.motivos = [{ mensaje: String(e?.message ?? e) }];
    }
    await pintar();
  },
  /** La copia de todos mis libros: abre el diálogo de la copia en ese modo. */
  copiaTodos() { return manejadores.copia(null, { todos: true }); },

  // ---------- varios libros (A24; carta/libros.js) ----------

  /** «Tus libros»: tocar uno cambia de libro con lo que ya hay (su foco, su alta). */
  async libro(alta) {
    if (!alta || alta === estado.cuenta?.alta) return;
    limpiarMensajes();
    await entrarEnCuenta(alta);
  },
  /** «Abrir otro libro»: la pantalla de arranque de hoy, sobre la carta. */
  libroOtro() { return manejadores.arranque('menu'); },
  /** «Entrar» en uno de mis libros privados: cambiar de libro y llegar a `foco` (el génesis del pequeño). */
  async libroEntrar(alta, foco) {
    if (!cuentas.cuentas().some((c) => c.alta === alta)) { estado.aviso = t('libroNoEsta'); pintar(); return; }
    limpiarMensajes();
    await entrarEnCuenta(alta, { foco });
  },
  /** «Volver» al libro grande: cambiar de libro y llegar al elemento del que cuelga el pequeño. */
  async libroVolver(alta, foco) { return manejadores.libroEntrar(alta, foco); },
  /**
   * «Anunciarlo en el libro grande», desde el génesis del pequeño: pide las claves de línea de este libro y, si las hay,
   * vuelve al elemento del grande con el anuncio a la vista (su coste antes de confirmar). Sin claves, se dice llano.
   */
  async libroAnunciar(alta, X) {
    const pequeno = estado.cuenta;
    if (!pequeno || !estado.eje) return;
    limpiarMensajes();
    const libro = estado.eje.genesisId;
    const claves = await clavesDeLinea(guardian, pequeno.publica, libro);
    if (!claves.length) { estado.aviso = t('libroSinSellador'); pintar(); return; }
    const nombre = pequeno.nombre;
    if (!(await entrarEnCuenta(alta, { foco: X }))) return;
    if (!estado.eje.obtener(X)) return;
    if (contrato.librosPrivados(estado.eje, X).some((l) => l.libro === libro)) {
      cuentas.marcarCuelga(pequeno.alta, { anunciado: true });
      estado.exito = t('libroYaAnunciado');
      pintar();
      return;
    }
    const elemento = ceroDe(estado.eje, X, { idioma: idioma() }, X.slice(0, 8));
    estado.libroPrivado = { X, elemento, nombre, fase: 'anunciar', guardian: estado.cuenta?.guardian === true, claves: claves.length, clavesDeLinea: claves, anuncio: libros.costeDelAnuncio(estado.eje, X, estado.identidad, { libro, claves }), entrar: pequeno.alta, libro };
    pintar();
  },
  /** «Abrir aquí un libro privado» sobre X: el diálogo, con el nombre del elemento por defecto y lo que cuesta, a la vista. */
  async libroPrivado(X) {
    if (!firmaLaCuenta() || !estado.eje?.obtener(X)) return;
    limpiarMensajes();
    estado.aro = null;
    estado.formulario = null;
    const previa = await libros.previaDelLibroPrivado(estado.eje, X, estado.identidad, { idioma: idioma() });
    estado.libroPrivado = { X, ...previa, fase: 'pedir', guardian: estado.cuenta?.guardian === true, motivos: [] };
    pintar();
  },
  /**
   * Confirmado el nombre: crea el libro pequeño con mi clave y escribe en él de qué cuelga (libros.abrirLibroPrivado). Si el
   * anfitrión da claves de línea, el anuncio en este libro se enseña con su coste para confirmarlo; si no, se dice llano.
   * Lo hecho queda aunque un paso falle, y se dice qué falta.
   */
  async libroPrivadoCrear(form) {
    const lp = estado.libroPrivado;
    if (!lp || lp.fase !== 'pedir' || lp.ocupado || !estado.cuenta) return;
    const nombre = String(valoresDe(form).nombre ?? '').trim() || lp.nombre;
    lp.nombre = nombre;
    lp.motivos = [];
    lp.ocupado = true;
    await pintar();
    try {
      const c = estado.cuenta;
      const r = await libros.abrirLibroPrivado({ grande: { eje: estado.eje, cuenta: c, privada: c.privada }, X: lp.X, nombre, ...(c.guardian === true ? { guardian } : {}) });
      Object.assign(lp, { ocupado: false, entrar: r.pequeno.cuenta.alta, libro: r.pequeno.eje.genesisId });
      if (r.falta) Object.assign(lp, { fase: 'hecho', falta: r.falta, motivos: r.motivos });
      else if (r.claves.length) Object.assign(lp, { fase: 'anunciar', claves: r.claves.length, clavesDeLinea: r.claves, anuncio: libros.costeDelAnuncio(estado.eje, lp.X, estado.identidad, { libro: lp.libro, claves: r.claves }) });
      else Object.assign(lp, { fase: 'hecho', sinClaves: true });
    } catch (e) {
      lp.ocupado = false;
      lp.motivos = [{ mensaje: enLlano(String(e?.message ?? e), e) }];
    }
    pintar();
  },
  /** El anuncio en este libro («open a private book here» sobre X, con el id del pequeño y sus claves de línea), confirmado. */
  async libroPrivadoAnunciar() {
    const lp = estado.libroPrivado;
    if (!lp || lp.fase !== 'anunciar' || lp.ocupado) return;
    lp.ocupado = true;
    lp.motivos = [];
    await pintar();
    try {
      const r = await libros.anunciarLibroPrivado(estado.eje, lp.X, estado.identidad, { libro: lp.libro, claves: lp.clavesDeLinea, firmar: firmarEnElAbierto() });
      lp.ocupado = false;
      if (r.ok && r.asentado) {
        trasEscribir();
        cuentas.marcarCuelga(lp.entrar, { anunciado: true });
        Object.assign(lp, { fase: 'hecho', anunciado: true });
        marcarNuevos();
      } else Object.assign(lp, { fase: 'hecho', falta: r.sinClaves ? null : 'anuncio', sinClaves: Boolean(r.sinClaves), motivos: motivosConGuardian(r.motivos ?? []) });
    } catch (e) {
      Object.assign(lp, { ocupado: false, fase: 'hecho', falta: 'anuncio', motivos: [{ mensaje: enLlano(String(e?.message ?? e), e) }] });
    }
    pintar();
  },

  /** Olvidar esta cuenta en este navegador (su eje, su clave y sus libros locales); sin copia no se recupera. */
  async olvidar() {
    const c = estado.cuenta;
    if (!c) return;
    if (!(await confirmarEnPagina(t('olvidarConfirmar', { nombre: c.nombre })))) return;
    const ids = estado.eje?.identidades?.() ?? [c.identidad];
    estado.local = null; // su libro local no se vuelve a guardar
    cambiarDeEje(null, null);
    cuentas.olvidarCuenta(c.alta, ids);
    estado.cuenta = null;
    estado.arranque = { modo: 'menu' };
    estado.aviso = t('cuentaOlvidada', { nombre: c.nombre });
    await pintar();
  },
};

/** Reiniciar el ejemplo: borra lo guardado del ejemplo en este navegador y empieza el elegido (no toca las cuentas). */
async function reiniciar() {
  if (estado.cuenta) return;
  persistencia.borrarLocal(CLAVE_EJE);
  try { globalThis.localStorage?.removeItem(CLAVE_CLAVES); } catch { /* sin almacenamiento */ }
  for (const id of estado.eje?.identidades?.() ?? []) { try { globalThis.localStorage?.removeItem(CLAVES_EJEMPLO.local(id)); } catch { /* nada */ } }
  estado.claves = await cargarClaves();
  const { eje, foco } = await crearEjemplo(estado);
  estado.eje = eje;
  estado.niveles = {};
  estado.sitio = null;
  estado.recientes = [];
  estado.paginas = {};
  estado.profundidad = {};
  estado.vistos = new Set();
  estado.nuevos = new Set();
  abrirLibroLocal();
  guardar();
  irA(foco);
}

// ---------- el emparejamiento por QR (A25: camino B sin anfitrión; carta/guardian-emparejado.js, carta/emparejar.js) ----------

/**
 * El emparejamiento de esta página (sin anfitrión; con anfitrión, todo null y no se ofrece emparejar), el adaptador que
 * hace de guardián mientras está vivo, su pantalla, si ha habido emparejamiento en esta página («Volver a emparejar»),
 * los registros firmados que no se pudieron asentar (no se reintentan en esta página) y la cola de asentar (de uno en uno).
 */
const emparejado = { emparejamiento: null, adaptador: null, pantalla: null, hubo: false, fallidos: new Set(), serie: Promise.resolve() };

/** ¿Falta en este dispositivo un libro con la clave de la app emparejada? (la pantalla ofrece abrir uno o restaurar una copia) */
function sinLibroDeLaApp() {
  const e = emparejado.emparejamiento?.estado();
  return Boolean(e) && !cuentas.cuentas().some((c) => c.guardian === true && cuentas.mismaClave(c.publica, e.app));
}

/** Sin anfitrión: el emparejamiento (en IndexedDB), su pantalla y lo guardado (si sigue en plazo); su guardián, si está vivo. Nunca lanza. */
async function iniciarEmparejamiento() {
  if (hayAnfitrion) return;
  try {
    const emparejamiento = new Emparejamiento({
      almacen: almacenIndexedDB(), agente: ('navegador · ' + location.host).slice(0, 200),
      avisar: (a) => { emparejado.pantalla?.avisar(a); void trasEmparejamiento(a); },
    });
    emparejado.emparejamiento = emparejamiento;
    emparejado.adaptador = guardianEmparejado(emparejamiento, { avisar: (a) => emparejado.pantalla?.avisar(a) });
    emparejado.pantalla = instalarEmparejar({ raiz, emparejamiento, adaptador: emparejado.adaptador, alCambiar: (a) => trasEmparejamiento(a), abrirArranque: (que) => manejadores.arranque(que), sinLibro: sinLibroDeLaApp });
    await emparejamiento.cargar();
  } catch (e) {
    console.error('emparejamiento:', String(e?.message ?? e));
  }
  usarGuardian(guardianDeLaCarta(emparejado));
  if (emparejado.emparejamiento?.estado()) emparejado.hubo = true;
  emparejado.pantalla?.pintar();
}

/** Los avisos que solo cambian la línea del emparejamiento (la pantalla los pinta sola). */
const SOLO_LA_LINEA = new Set(['conectado', 'desconectado', 'auth_rechazado', 'firma_invalida', 'rechazo', 'propuesta', 'propuesta_resuelta']);

/**
 * Tras un cambio del emparejamiento (leído un QR, aceptado, caducado, revocado, rechazado, olvidado): el guardián de la
 * página vuelve a ser el que toca (guardianDeLaCarta) y la cuenta del guardián abierta pasa a firmar por el
 * emparejamiento (si la app guarda su clave) o vuelve a solo lectura, con su sincronía rehecha. Después, lo firmado que
 * falte en el libro se asienta. Repinta la carta si algo de ella cambió.
 */
async function trasEmparejamiento(aviso = {}) {
  const emp = emparejado.emparejamiento;
  if (!emp) return;
  if (emp.estado()) emparejado.hubo = true;
  // Una firma que llega para lo propuesto antes de recargar (o vuelto a pedir desde la lista) se asienta aquí; la de esta
  // página la asienta su propio flujo.
  if (aviso.tipo === 'firma') { await asentarDelEmparejamiento(); return; }
  if (SOLO_LA_LINEA.has(aviso.tipo)) return;
  const antes = guardian;
  usarGuardian(guardianDeLaCarta(emparejado));
  let repintar = antes !== guardian || Boolean(estado.arranque);
  const c = estado.cuenta;
  if (c?.guardian === true) {
    const firma = await tieneLaCuenta(guardian, c.publica);
    if (estado.cuenta !== c) return;
    if (firma !== Boolean(c.firmante) || antes !== guardian) {
      c.soloLeer = !firma;
      c.firmante = firma ? firmanteDeCuenta(guardian, c.publica, { eje: () => estado.eje }) : null;
      estado.guardian = { sesionCerrada: false, pendiente: null, abriendo: false, criterios: null, noAbrio: false };
      estado.sincronia = sinc.soltar(estado.sincronia, c.alta);
      abrirSincronia();
      repintar = true;
    } else if (aviso.tipo === 'emparejada' && estado.guardian.sesionCerrada) {
      // La app ha aceptado: la sesión ya está abierta; lo automático que se paró vuelve a intentarse.
      estado.guardian.sesionCerrada = false;
      if (estado.sincronia) void sincronizar();
      repintar = true;
    }
  }
  await asentarDelEmparejamiento();
  emparejado.pantalla?.pintar();
  if (repintar) await pintar();
}

/**
 * Lo firmado por la app tras recargar (docs/notas/EMPAREJAMIENTO.md): las propuestas «firmado» de este libro que aún no
 * están en él se asientan (guardian-emparejado.js asentarFirmadas: el cuerpo idéntico por autoridad.firmar) y se
 * descartan; las que ya están, solo se descartan. De una en una (sin asentar nada dos veces). Si se asienta o falla algo,
 * se dice y se repinta.
 */
function asentarDelEmparejamiento() {
  const paso = emparejado.serie.then(async () => {
    const emp = emparejado.emparejamiento;
    const eje = estado.eje;
    if (!emp || !eje || !estado.cuenta) return;
    const deEstaPagina = new Set([...(emparejado.adaptador?.deEstaPagina ?? []), ...emparejado.fallidos]);
    const r = await asentarFirmadas(emp, eje, { deEstaPagina });
    for (const f of r.fallidos) { emparejado.fallidos.add(f.id); console.error('emparejamiento (asentar):', f.motivo); }
    if (r.descartados.length || r.asentados.length) emparejado.pantalla?.pintar();
    if (estado.eje !== eje || !(r.asentados.length || r.fallidos.length)) return;
    if (r.asentados.length) {
      guardar();
      if (estado.sincronia) void sincronizar();
      marcarNuevos();
      estado.exito = t('emparejarAsentados', { n: r.asentados.length });
    }
    if (r.fallidos.length) estado.aviso = t('emparejarNoAsentado', { motivo: r.fallidos[0].motivo });
    await pintar();
  });
  emparejado.serie = paso.catch(() => {});
  return emparejado.serie;
}

// ---------- arranque ----------

async function arrancar() {
  gestos = instalar(raiz, manejadores);
  await ajustesDelSitio.cargar(); // ./sitio.json, opcional: los defectos del sitio (silencioso si no está)
  await iniciarEmparejamiento(); // sin anfitrión: el emparejamiento por QR guardado, antes de abrir la cuenta (su guardián)
  opinar.instalar({
    raiz, cuenta: () => estado.cuenta?.nombre ?? 'ejemplo', alCambiar: () => { void pintar(); },
    // Con «opinions anchor» (los ajustes de la guía), cada opinión se escribe además como un registro anclado en el proyecto.
    async alGuardar(opinion) {
      void retoques()?.opinion(opinion); // con el servidor de retoques, también a retoques/.datos/opiniones.jsonl
      const r = await externa.anclarOpinion(estado.eje, estado.identidad, opinion, { firmar: firmarCon(estado.identidad), ...horaDe() });
      if (r.ok) trasEscribir();
      return r;
    },
  });
  // El archivo de propuestas que elige la persona (el input oculto de la guía).
  raiz.addEventListener('change', async (e) => {
    if (!e.target.matches?.('[data-guia-archivo]')) return;
    const archivo = e.target.files?.[0];
    let texto = null;
    try { texto = archivo ? await archivo.text() : null; } catch { estado.aviso = t('externaNoSeLee'); pintar(); }
    e.target.value = '';
    if (texto !== null) manejadores.guiaArchivo(texto);
  });
  let temporizador = null;
  // Repintar solo si cambia el ancho y no hay un campo con el foco: el teclado del móvil solo cambia el alto y
  // dispara resize, y un repintado entero cerraba el teclado y perdía el archivo elegido (VG, 10-11, al restaurar).
  let anchoAnterior = window.innerWidth;
  window.addEventListener('resize', () => {
    const editando = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
    if (editando || window.innerWidth === anchoAnterior) return;
    anchoAnterior = window.innerWidth;
    clearTimeout(temporizador); temporizador = setTimeout(pintar, 120);
  });
  // Lo escrito en la pregunta de la guía se recuerda (un repintado entero no lo pierde).
  raiz.addEventListener('input', (e) => { if (e.target.matches?.('[data-guia-pregunta]')) estado.guia.borrador = e.target.value; });
  if (retoques()) {
    // Hablar con Core: lo escrito se recuerda, «señalar» intercepta el siguiente toque y el sitio se guarda al irse (recargar).
    raiz.addEventListener('input', (e) => { if (e.target.matches?.('[data-core-texto]')) estado.core.borrador = e.target.value; });
    instalarSenalar();
    // La lista de cambios de fondo: si está abierta se queda abierta al repintar; se pide al cargar.
    raiz.addEventListener('toggle', (e) => { if (e.target.matches?.('[data-core-fondo]')) estado.core.fondoAbierto = e.target.open; }, true);
    void refrescarFondo();
    void refrescarEnsayo();
    window.addEventListener('pagehide', guardarSitioDeRetoques);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarSitioDeRetoques(); });
  }
  // El libro compartido: al volver la red y cada 30 s con la pestaña visible (la cola decide si toca reintentar).
  window.addEventListener('online', () => { if (estado.sincronia) void sincronizar(); });
  setInterval(() => { if (estado.sincronia && document.visibilityState === 'visible') void sincronizar(); }, sinc.CADA);
  // Dónde entrar: la última cuenta usada; si lo último fue un ejemplo, el ejemplo; si hay cuentas y no se sabe cuál, la
  // última de la lista; si no hay nada elegido, la pantalla de arranque.
  const lista = cuentas.cuentas();
  const u = cuentas.ultima();
  if (u === EJEMPLO) await entrarEnEjemplo();
  else if (u && lista.some((c) => c.alta === u)) await entrarEnCuenta(u);
  else if (lista.length) await entrarEnCuenta(lista[lista.length - 1].alta);
  else { estado.arranque = { modo: 'menu' }; await pintar(); }
  if (retoques()) await volverAlSitio();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* sin SW: la web funciona igual con red */ });
  }
}

arrancar().catch((e) => {
  raiz.innerHTML = `<p class="aviso">${t('noArranca', { motivo: e.message ?? e }).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>`;
  console.error(e);
});
