// El contrato HTTP del libro compartido, como una función (Request) → Response
// de la API Fetch, igual en Deno (index.ts la sirve con Deno.serve sobre
// PostgREST) y en Node (servidor/prueba/servidor.mjs la sirve con node:http
// sobre un almacén en memoria). Sin dependencias. docs/CONTRATO.md, «El libro
// compartido».
//
//   POST {url}/ejes            crea un eje: { eje } → 201 { eje, claveLectura, creado }; la clave se devuelve UNA vez
//                              (solo se guarda su hash). Protegido: Authorization: Bearer <clave de servicio> o
//                              X-Crear-Ejes: <AGRAM_CREAR_EJES>. 409 si ya existe; 503 si no está habilitado.
//   POST {url}/eventos         { eje, evento } → 201 { orden, recibido } (200 y duplicado: true si ya estaba: idempotente).
//                              400 forma, id o firma; 403 autor sin alta en el eje; 401 sin clave de lectura, clave mala o eje que no existe (la
//                              misma respuesta: no se revela si un eje existe, #106);
//                              413 cuerpo > 256 KB; 429 más de 60 escrituras por minuto en el eje.
//                              Un registro con contexto.tanda no entra suelto: 400 (va entero por /eventos/tanda).
//   POST {url}/eventos/tanda   { eje, eventos: [e1, …, em] } → 201 { tanda, eventos: [{ id, orden, recibido }] }: una tanda
//                              (agram-equipo/CONTRATO_TANDA.md), todos o ninguno, con órdenes consecutivos; tanda = id de e1.
//                              200 lo mismo y duplicado: true si sus m ids ya estaban, seguidos y en ese orden. Si no puede
//                              entrar, el estado de siempre (400 forma y marca, 401, 403, 413, 429…) con { error, indice, id }
//                              (el miembro que falla, desde 0; null si es de la petición o de la lista entera) y nada
//                              guardado; 409 con el primer miembro que ya estaba si trae miembros ya subidos y otros no.
//                              Un solo autor en todos los miembros. Topes: cada miembro 256 KB (413 con su índice), la
//                              petición entera 1 MB (413 con null). Gasta m escrituras del minuto solo si pasa la forma.
//   GET  {url}/eventos?eje=…&desde=<orden>&cuantos=<≤500>
//                              → { eventos: [{ orden, recibido, evento }], siguiente } con orden > desde, por llegada;
//                              siguiente es el desde de la página siguiente, o null si no hay más.
//   OPTIONS                    CORS: https://agram.ikisai.com y http://localhost:*.
//
// Las rutas cuelgan de la función `eventos` desplegada en Supabase
// (/functions/v1/eventos, /functions/v1/eventos/ejes y /functions/v1/eventos/tanda); se reconocen por el
// final del camino, así que valen con cualquier prefijo.
//
// El almacén (`almacen`) es lo único que cambia entre el despliegue y la
// prueba: ejes y eventos como filas, con el orden de llegada y la hora del
// servidor. La criptografía (`cripto.comprobar`) es verificar.js en la función
// y el núcleo en el servidor de prueba (la paridad la comprueba
// test/paridad-funcion.test.js).

import * as verificar from './verificar.js';

/** Orígenes admitidos por CORS: la carta publicada y el desarrollo local. */
export const ORIGENES = Object.freeze(['https://agram.ikisai.com', 'https://aarpia.ikisai.com', 'https://stateark.ikisai.com', 'https://beta.agram.ikisai.com', 'https://agram-beta.pages.dev', /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/]);
/** Tope del cuerpo de una petición, en bytes; en una tanda, el de cada miembro. */
export const LIMITE_CUERPO = 256 * 1024;
/** Tope del cuerpo entero de una petición de tanda (POST /eventos/tanda), en bytes (CONTRATO_TANDA, precisión 9). */
export const LIMITE_TANDA = 1024 * 1024;
/** Escrituras admitidas por eje y minuto. */
export const ESCRITURAS_POR_MINUTO = 60;
/** Tope de eventos por página. */
export const PAGINA = 500;
/** Nombres de eje admitidos (los mismos que la tabla). */
export const NOMBRE_EJE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** Miembros de una tanda: de 2 a 32 (CONTRATO_TANDA: no hay tandas de uno; 32 cabe siempre en los topes de hoy). */
export const TANDA_MINIMA = 2;
export const TANDA_MAXIMA = 32;

/** ¿Lleva el registro crudo `ev` la marca de tanda (contexto.tanda, con cualquier valor)? */
export const llevaMarcaDeTanda = (ev) => Boolean(ev && typeof ev === 'object' && ev.contexto && typeof ev.contexto === 'object' && Object.hasOwn(ev.contexto, 'tanda'));

/**
 * La marca de una tanda que llega (CONTRATO_TANDA, con sus «Precisiones tras las tres entregas»): null si vale, o
 * { indice, error } (indice del primer miembro que falla, desde 0, o null si el fallo es de la lista entera). Un fallo de
 * marca es siempre 400. De la lista entera (indice null): que no sea una lista, que traiga menos de 2 o más de 32, y un
 * `de` que no es el número de miembros que llegan (`de` se compara con los reales, nunca al revés). De un miembro: sin
 * marca o con claves de sobra (solo n, de y anterior), `n` que no es su sitio, el 1 con `anterior`, un `anterior` que no
 * es el id del de antes, un id que no es un hash o repetido, y un autor distinto del del miembro 1 (todos los miembros
 * llevan el mismo autor). Mira los registros crudos; ids de verdad y firmas son la forma, después.
 *
 * Es la comprobación LOCAL de la puerta: la función de Supabase se despliega sola y no importa el núcleo (src/evento.js,
 * fallosDeTanda, endurece la marca con las mismas reglas). La paridad de las dos la miran las pruebas.
 */
export function comprobarMarcaDeTanda(eventos) {
  if (!Array.isArray(eventos)) return { indice: null, error: 'eventos debe ser una lista de registros' };
  const de = eventos.length;
  if (de < TANDA_MINIMA || de > TANDA_MAXIMA) return { indice: null, error: 'una tanda tiene de ' + TANDA_MINIMA + ' a ' + TANDA_MAXIMA + ' miembros; llegan ' + de };
  const marcaDe = (ev) => (llevaMarcaDeTanda(ev) ? ev.contexto.tanda : undefined);
  // `de` es de la lista entera: si un miembro dice otro número, el fallo no es de ese miembro sino de la tanda que llega.
  for (const ev of eventos) {
    const m = marcaDe(ev);
    if (m && typeof m === 'object' && !Array.isArray(m) && Object.hasOwn(m, 'de') && m.de !== de) return { indice: null, error: 'un miembro dice de = ' + JSON.stringify(m.de) + ' y la tanda trae ' + de + ' (incompleta o de más)' };
  }
  const vistos = new Set();
  const autor = eventos[0]?.autor;
  for (let k = 0; k < de; k++) {
    const ev = eventos[k];
    const marca = marcaDe(ev);
    const no = (texto) => ({ indice: k, error: 'el miembro ' + (k + 1) + ' ' + texto });
    if (!marca || typeof marca !== 'object' || Array.isArray(marca)) return no('no lleva la marca contexto.tanda = { n, de, anterior }');
    const sobra = Object.keys(marca).filter((c) => c !== 'n' && c !== 'de' && c !== 'anterior');
    if (sobra.length) return no('lleva en contexto.tanda claves que no son n, de ni anterior: ' + sobra.join(', '));
    if (marca.de !== de) return no('no dice de = ' + de);
    if (marca.n !== k + 1) return no('dice n = ' + JSON.stringify(marca.n) + ' y está en el sitio ' + (k + 1));
    if (k === 0) {
      if (Object.hasOwn(marca, 'anterior')) return no('es el primero y no lleva anterior');
    } else if (!verificar.esHash(marca.anterior) || marca.anterior !== eventos[k - 1]?.id) {
      return no('debe llevar como anterior el id del miembro ' + k);
    }
    if (!verificar.esHash(ev.id)) return no('no tiene un id (hash SHA-256 en hexadecimal)');
    if (vistos.has(ev.id)) return no('repite el id de otro miembro');
    vistos.add(ev.id);
    if (typeof ev.autor !== 'string' || ev.autor !== autor) return no('es de otro autor (' + JSON.stringify(ev.autor) + '): todos los miembros de una tanda son del autor del miembro 1 (' + JSON.stringify(autor) + ')');
  }
  return null;
}

const aBase64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Una clave de lectura nueva: 32 bytes al azar en base64url. */
export function generarClaveLectura() {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return aBase64url(bytes);
}

/** El hash que se guarda de una clave de lectura (SHA-256 en hexadecimal). */
export const hashDeClave = (clave) => verificar.hash(clave);

/**
 * Construye el manejador. `almacen` ofrece, todas async:
 *   crearEje(eje, claveHash) → { creado } | null si ya existía
 *   eje(eje) → { eje, clave_lectura_hash, creado } | null
 *   vacio(eje) → boolean
 *   claveDe(eje, autor) → clave pública (hex x-only) | undefined (la declarada en el primer evento del eje que la lleva: el alta)
 *   obtener(eje, id) → { orden, recibido } | null
 *   insertar(eje, { id, autor, firma, cuerpo }) → { orden, recibido } | null si el id ya estaba
 *   insertarTanda(eje, [{ id, autor, firma, cuerpo }]) → [{ orden, recibido }] con órdenes consecutivos, todas en un solo
 *                paso atómico (nada de otro entre medias), o null si alguna ya estaba (y entonces no inserta ninguna).
 *                Puede lanzar un error con { estado, indice, id } (la puerta con autoridad: 422, 501): la ruta lo responde.
 *   listar(eje, desde, cuantos) → [{ orden, recibido, cuerpo }] con orden > desde, por orden
 * `crearEjes` es { servicio, secreto }: lo que autoriza POST /ejes (cualquiera de los dos; ninguno, deshabilitado).
 */
export function crearApi({ almacen, cripto = verificar, crearEjes = {}, origenes = ORIGENES, limiteCuerpo = LIMITE_CUERPO, limiteTanda = LIMITE_TANDA, escriturasPorMinuto = ESCRITURAS_POR_MINUTO, ahora = () => new Date() }) {
  const ventanas = new Map(); // eje → { minuto, n }: el contador simple en memoria de las escrituras

  const cors = (request) => {
    const origen = request.headers.get('origin');
    const cabeceras = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Clave-Lectura, X-Crear-Ejes, Authorization', 'Access-Control-Max-Age': '86400' };
    if (origen && origenes.some((o) => (o instanceof RegExp ? o.test(origen) : o === origen))) {
      cabeceras['Access-Control-Allow-Origin'] = origen;
      cabeceras.Vary = 'Origin';
    }
    return cabeceras;
  };

  const json = (request, estado, cuerpo) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(request) } });
  const error = (request, estado, texto) => json(request, estado, { error: texto });

  async function leerCuerpo(request, tope = limiteCuerpo) {
    const declarado = Number(request.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > tope) return { error: 413 };
    const texto = await request.text();
    if (new TextEncoder().encode(texto).length > tope) return { error: 413 };
    try {
      const datos = JSON.parse(texto);
      return datos && typeof datos === 'object' && !Array.isArray(datos) ? { datos } : { error: 400 };
    } catch {
      return { error: 400 };
    }
  }

  /**
   * El eje y su clave de lectura: { eje } o { respuesta } con el error. Un eje que no existe y una clave mala dan la MISMA
   * respuesta (401, mismo cuerpo): desde fuera no se puede saber si un eje existe probando nombres (#106). Por eso no hay
   * «404 eje desconocido»; el hash de la clave se calcula igual en los dos casos.
   */
  async function abrirEje(request, nombre) {
    if (typeof nombre !== 'string' || !NOMBRE_EJE.test(nombre)) return { respuesta: error(request, 400, 'eje: nombre inválido'), estado: 400, texto: 'eje: nombre inválido' };
    const fila = await almacen.eje(nombre);
    const clave = request.headers.get('x-clave-lectura');
    const hash = clave ? await hashDeClave(clave) : null;
    if (!fila || !hash || hash !== fila.clave_lectura_hash) return { respuesta: error(request, 401, 'clave de lectura ausente o incorrecta'), estado: 401, texto: 'clave de lectura ausente o incorrecta' };
    return { eje: fila };
  }

  function pasaElLimite(eje) {
    const minuto = Math.floor(ahora().getTime() / 60000);
    const v = ventanas.get(eje);
    if (!v || v.minuto !== minuto) {
      ventanas.set(eje, { minuto, n: 1 });
      return true;
    }
    v.n += 1;
    return v.n <= escriturasPorMinuto;
  }

  /**
   * ¿Caben `n` escrituras más este minuto en el eje? Si caben, las cuenta todas y devuelve -1; si no, no cuenta ninguna
   * y devuelve cuántas cabían (el índice del primer miembro que ya no cabe). El mismo contador que pasaElLimite.
   */
  function cabenEscrituras(eje, n) {
    const minuto = Math.floor(ahora().getTime() / 60000);
    const v = ventanas.get(eje);
    const usadas = v && v.minuto === minuto ? v.n : 0;
    const libres = Math.max(0, escriturasPorMinuto - usadas);
    if (n > libres) return libres;
    ventanas.set(eje, { minuto, n: usadas + n });
    return -1;
  }

  async function crearEje(request) {
    const auth = request.headers.get('authorization') ?? '';
    const portador = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const secreto = request.headers.get('x-crear-ejes') ?? '';
    const { servicio, secreto: esperado } = crearEjes;
    if (!servicio && !esperado) return error(request, 503, 'crear ejes no está habilitado: falta AGRAM_CREAR_EJES o la clave de servicio');
    const autorizado = (servicio && portador === servicio) || (esperado && secreto === esperado);
    if (!autorizado) return error(request, 401, 'crear ejes exige la clave de servicio (Authorization: Bearer) o X-Crear-Ejes');
    const leido = await leerCuerpo(request);
    if (leido.error) return error(request, leido.error, leido.error === 413 ? 'cuerpo demasiado grande' : 'el cuerpo debe ser un objeto JSON');
    const nombre = leido.datos.eje;
    if (typeof nombre !== 'string' || !NOMBRE_EJE.test(nombre)) return error(request, 400, 'eje: nombre inválido (minúsculas, dígitos, punto, guion y guion bajo; hasta 64)');
    const claveLectura = generarClaveLectura();
    const creado = await almacen.crearEje(nombre, await hashDeClave(claveLectura));
    if (!creado) return error(request, 409, 'el eje ya existe: ' + nombre);
    return json(request, 201, { eje: nombre, claveLectura, creado: creado.creado });
  }

  async function subir(request) {
    const leido = await leerCuerpo(request);
    if (leido.error) return error(request, leido.error, leido.error === 413 ? 'cuerpo demasiado grande (tope ' + limiteCuerpo + ' bytes)' : 'el cuerpo debe ser un objeto JSON { eje, evento }');
    const { eje: nombre, evento } = leido.datos;
    const abierto = await abrirEje(request, nombre);
    if (abierto.respuesta) return abierto.respuesta;
    // Un miembro de una tanda nunca entra suelto (CONTRATO_TANDA): ni siquiera como duplicado.
    if (llevaMarcaDeTanda(evento)) return error(request, 400, 'un miembro de una tanda no entra suelto: va entera por POST /eventos/tanda');
    if (!pasaElLimite(nombre)) return error(request, 429, 'más de ' + escriturasPorMinuto + ' escrituras por minuto en el eje ' + nombre);
    // Idempotente: el mismo id (ya verificado cuando entró) devuelve su orden sin volver a comprobar nada.
    const previo = evento && verificar.esHash(evento.id) ? await almacen.obtener(nombre, evento.id) : null;
    if (previo) return json(request, 200, { orden: previo.orden, recibido: previo.recibido, duplicado: true });
    const r = await cripto.comprobar(evento, { vacio: await almacen.vacio(nombre), claveDelAutor: (autor) => almacen.claveDe(nombre, autor) });
    if (!r.ok) return error(request, r.estado, r.error);
    const ev = r.evento;
    const fila = await almacen.insertar(nombre, { id: ev.id, autor: ev.autor, firma: ev.firma, cuerpo: ev });
    if (fila) return json(request, 201, { orden: fila.orden, recibido: fila.recibido });
    const otra = await almacen.obtener(nombre, ev.id); // llegó dos veces a la vez: la primera ganó
    return otra ? json(request, 200, { orden: otra.orden, recibido: otra.recibido, duplicado: true }) : error(request, 500, 'no se pudo guardar');
  }

  /**
   * POST /eventos/tanda { eje, eventos }: varios registros que entran todos o ninguno (CONTRATO_TANDA). Comprueba, en
   * este orden y sin guardar nada hasta el final: la marca, la forma de cada miembro (en orden, viendo los anteriores:
   * el alta de un autor puede venir en un miembro anterior y «eje vacío» solo vale para el primero) y que cabe (`de`
   * escrituras en el tope por minuto; el cuerpo entero ya pasó el tope al leerlo). Después, insertarTanda: un solo paso.
   */
  async function subirTanda(request) {
    const falla = (estado, texto, indice = null, id = null) => json(request, estado, { error: texto, indice, id });
    const idDe = (ev) => (ev && typeof ev === 'object' && verificar.esHash(ev.id) ? ev.id : null);
    const leido = await leerCuerpo(request, limiteTanda);
    if (leido.error) return falla(leido.error, leido.error === 413 ? 'cuerpo demasiado grande (tope ' + limiteTanda + ' bytes, la petición de tanda entera)' : 'el cuerpo debe ser un objeto JSON { eje, eventos }');
    const { eje: nombre, eventos } = leido.datos;
    const abierto = await abrirEje(request, nombre);
    if (abierto.respuesta) return falla(abierto.estado, abierto.texto);
    // 1. La marca.
    const marca = comprobarMarcaDeTanda(eventos);
    if (marca) return falla(400, 'tanda mal marcada: ' + marca.error, marca.indice, marca.indice === null ? null : idDe(eventos[marca.indice]));
    const de = eventos.length;
    // Cada miembro, dentro del tope de un registro suelto: si uno solo se pasa, 413 con su índice.
    for (let k = 0; k < de; k++) {
      if (new TextEncoder().encode(JSON.stringify(eventos[k])).length > limiteCuerpo) return falla(413, 'el miembro ' + (k + 1) + ' no cabe (tope ' + limiteCuerpo + ' bytes por registro)', k, idDe(eventos[k]));
    }
    // Reintentar sin duplicar: si la tanda entera ya estaba, sus órdenes (sin volver a comprobar nada, como POST /eventos).
    const yaEstaba = async () => {
      const previos = [];
      for (const ev of eventos) previos.push(await almacen.obtener(nombre, ev.id));
      const cuantos = previos.filter(Boolean).length;
      const seguidos = cuantos === de && previos.every((p, k) => k === 0 || p.orden === previos[k - 1].orden + 1);
      if (seguidos) return json(request, 200, { tanda: eventos[0].id, eventos: eventos.map((ev, k) => ({ id: ev.id, orden: previos[k].orden, recibido: previos[k].recibido })), duplicado: true });
      if (cuantos > 0) {
        const k = previos.findIndex(Boolean);
        return falla(409, 'la tanda trae miembros ya subidos (' + cuantos + ' de ' + de + (cuantos === de ? ', no seguidos o en otro orden' : '') + '): es una tanda recompuesta; no se guarda nada y lo ya subido sigue como estaba', k, eventos[k].id);
      }
      return null;
    };
    const previa = await yaEstaba();
    if (previa) return previa;
    // 2. La forma de cada miembro, en orden y viendo los anteriores.
    const vacio = await almacen.vacio(nombre);
    const comprobados = [];
    const claveDelAutor = async (autor) => {
      const guardada = await almacen.claveDe(nombre, autor); // el alta ya guardada va antes que cualquier miembro
      if (guardada !== undefined) return guardada;
      for (const ev of comprobados) {
        const c = verificar.claveDeclarada(ev, autor);
        if (c !== undefined) return c;
      }
      return undefined;
    };
    for (let k = 0; k < de; k++) {
      const r = await cripto.comprobar(eventos[k], { vacio: vacio && k === 0, claveDelAutor });
      if (!r.ok) return falla(r.estado, r.error, k, idDe(eventos[k]));
      if (r.evento.id !== eventos[k].id) return falla(400, 'el id no corresponde al cuerpo', k, idDe(eventos[k]));
      comprobados.push(r.evento);
    }
    // 3. Que cabe: las `de` escrituras dentro del tope por minuto, o ninguna.
    const cabian = cabenEscrituras(nombre, de);
    if (cabian >= 0) return falla(429, 'la tanda son ' + de + ' escrituras y este minuto solo caben ' + cabian + ' en el eje ' + nombre + ' (tope ' + escriturasPorMinuto + '): no entra ninguna');
    // Guardar todas en un solo paso.
    let filas;
    try {
      filas = await almacen.insertarTanda(nombre, comprobados.map((ev) => ({ id: ev.id, autor: ev.autor, firma: ev.firma, cuerpo: ev })));
    } catch (e) {
      // La puerta con autoridad juzga la tanda dentro de insertarTanda: { estado, indice, id } (422 reglas, 501 sin tandas).
      if (Number.isInteger(e?.estado) && e.estado >= 400 && e.estado <= 599) return falla(e.estado, e.message, Number.isInteger(e.indice) ? e.indice : null, verificar.esHash(e.id) ? e.id : null);
      throw e;
    }
    if (filas) {
      if (!Array.isArray(filas) || filas.length !== de) return falla(500, 'el almacén no devolvió un orden por miembro');
      return json(request, 201, { tanda: comprobados[0].id, eventos: comprobados.map((ev, k) => ({ id: ev.id, orden: filas[k].orden, recibido: filas[k].recibido })) });
    }
    // Alguna ya estaba: llegó dos veces a la vez y la primera ganó (200), o es el fallo que el contrato quiere ver (409).
    return (await yaEstaba()) ?? falla(500, 'no se pudo guardar la tanda');
  }

  async function bajar(request, url) {
    const abierto = await abrirEje(request, url.searchParams.get('eje') ?? '');
    if (abierto.respuesta) return abierto.respuesta;
    const nombre = abierto.eje.eje;
    const desde = url.searchParams.has('desde') ? Number(url.searchParams.get('desde')) : 0;
    const cuantos = url.searchParams.has('cuantos') ? Number(url.searchParams.get('cuantos')) : PAGINA;
    if (!Number.isSafeInteger(desde) || desde < 0) return error(request, 400, 'desde debe ser un orden (entero ≥ 0)');
    if (!Number.isSafeInteger(cuantos) || cuantos < 1 || cuantos > PAGINA) return error(request, 400, 'cuantos debe estar entre 1 y ' + PAGINA);
    const filas = await almacen.listar(nombre, desde, cuantos + 1);
    const pagina = filas.slice(0, cuantos);
    const siguiente = filas.length > cuantos ? pagina[pagina.length - 1].orden : null;
    return json(request, 200, { eventos: pagina.map((f) => ({ orden: f.orden, recibido: f.recibido, evento: f.cuerpo })), siguiente });
  }

  return async function manejar(request) {
    const url = new URL(request.url);
    const camino = url.pathname.replace(/\/+$/, '');
    // La tanda, solo con el camino exacto …/eventos/tanda (la barra final se quita, como en las otras rutas; la query no
    // cuenta). Un camino parecido (…/eventos/tandaX, …/eventos/tanda/algo, …/Tanda, …/tanda suelto) no cae en ninguna de
    // las dos rutas de escritura: 404. Así una tanda no puede entrar por POST /eventos ni al revés por coincidencia.
    const ruta = camino.endsWith('/ejes') ? 'ejes' : camino.endsWith('/eventos/tanda') ? 'tanda' : /\/tanda[^/]*(\/|$)/i.test(camino) ? 'parecida' : 'eventos';
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
      if (ruta === 'parecida') return error(request, 404, 'ruta desconocida: la tanda va por POST …/eventos/tanda');
      if (ruta === 'ejes') return request.method === 'POST' ? await crearEje(request) : error(request, 405, 'solo POST');
      if (ruta === 'tanda') return request.method === 'POST' ? await subirTanda(request) : error(request, 405, 'solo POST');
      if (request.method === 'POST') return await subir(request);
      if (request.method === 'GET') return await bajar(request, url);
      return error(request, 405, 'solo GET y POST');
    } catch (e) {
      return error(request, 500, 'error del servidor: ' + (e?.message ?? String(e)));
    }
  };
}
