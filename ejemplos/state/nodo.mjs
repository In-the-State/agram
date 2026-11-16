// El eje de un nodo de la clase `state`, de ejemplo (encargo «época del nodo», punto 7). TODO INVENTADO: identidades,
// claves de prueba derivadas de semillas fijas escritas aquí, digests, commits, urls; nada real y ningún servidor.
//
// El eje nace con la época de la clase state escrita en su libro (Eje.genesis({ epoca }), datos/epocas/state/), y en él:
//
//   1. el operador (la cuenta raíz, que monta el nodo) invita al titular, que da de alta su llavero (la cosa cuya clave
//      custodia StateArk: la que firma);
//   2. el camino del 9 del nodo, paso a paso y cada uno con su acción: alta del nodo, autoridad, relé, archivo, un
//      contexto declarado y en servicio;
//   3. las demás piezas con su papel: el contenedor del TLS (por digest), una puerta, el despliegue de la carta, un worker,
//      el vigía y el ejecutor (agentes, el vigía con 180 minutos de T) y un eje servido;
//   4. el titular escribe el criterio «require authorization» en el 2.4 del nodo (y su propio llavero lo firma);
//   5. el operador pide reiniciar el vigía: queda por autorizar; la firma de otro no vale; el llavero la firma; el
//      ejecutor lo hace y deja su recibo, que la da por ejecutada;
//   6. un cambio de núcleo autorizado cuya revalidación falla: el ejecutor lo cierra con error y el núcleo no cambia;
//   7. un umbral (autorizado), una fecha de vencimiento con su renovación y medidas del vigía sobre las piezas;
//   8. conexiones: una añadida y autorizada, un cambio de permisos, y otra quitada;
//   9. una visita de fuera que intenta medir una pieza y no puede.
//
// Uso: node ejemplos/state/nodo.mjs   (imprime el resumen; `ejemploNodo()` da el eje a las pruebas y a la carta).

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Eje } from '../../src/eje.js';
import { publicaDe, firmar, firmarPosesion } from '../../src/autoridad.js';
import * as A from '../../src/acciones.js';
import { epocaState } from '../../datos/epocas/state/generar.mjs';

/** Una clave de prueba derivada de una semilla fija (nada real): { publica, privada } x-only en hexadecimal. */
export const claveDePrueba = (semilla) => {
  const privada = createHash('sha256').update('agram/ejemplo-state/' + semilla).digest('hex');
  return { publica: publicaDe(privada), privada };
};

/** Los nombres del ejemplo (inventados). */
export const N = Object.freeze({
  operador: 'operador', titular: 'titular', llavero: 'llavero', visita: 'visita',
  nodo: 'nodo-ejemplo', autoridad: 'autoridad', rele: 'rele', archivo: 'archivo', contexto: 'contexto-tienda',
  contenedor: 'contenedor-web', puerta: 'puerta-a', despliegue: 'despliegue-carta', worker: 'worker', vigia: 'vigia', ejecutor: 'ejecutor', ejeServido: 'eje-servido-a',
});
const CON_CLAVE = [N.operador, N.titular, N.llavero, N.visita, N.vigia, N.ejecutor];
export const CLAVES = Object.freeze(Object.fromEntries(CON_CLAVE.map((n) => [n, claveDePrueba(n)])));

const DIA = '2026-11-16';
/** Un instante del día del ejemplo: minutos desde las 08:00. */
export const hora = (min) => new Date(Date.parse(DIA + 'T08:00:00Z') + min * 60_000).toISOString().replace('.000Z', 'Z');

/**
 * El eje del nodo de ejemplo. → { eje, ids: { nombre → id }, claves, epoca, rechazos: [{ caso, motivos }] }.
 * `hasta` (opcional) para en un paso del camino: 'nodo', 'autoridad', 'rele', 'archivo', 'contexto' (sin poner en
 * servicio ni lo demás), para ver el camino a medias.
 */
export async function ejemploNodo({ hasta = null } = {}) {
  const epoca = epocaState();
  const K = CLAVES;
  let minuto = 0;
  const t = () => hora(minuto++);
  const eje = await Eje.genesis({ identidad: N.operador, foco: ['nodo de ejemplo de la clase state'], t: t(), clave: K.operador.publica, privada: K.operador.privada, exigirFirmas: true, epoca });
  const ids = { genesis: eje.genesisId };
  const rechazos = [];
  const firmaDe = (quien) => ({ firmar: (ev) => firmar(ev, K[quien].privada) });

  /** Lanza una plantilla de transacción como `quien` y la asienta; con `cosa`, la cosa firma su prueba de posesión. */
  async function hacer(nombre, X, params, quien, { cosa = null, guarda = null } = {}) {
    const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: t(), ...(K[quien] ? firmaDe(quien) : {}) });
    let ev = r.evento;
    if (cosa && ev) ev = await firmarPosesion(ev, cosa, K[cosa].privada);
    const motivos = ev ? await eje.validar(ev) : r.motivos.map((m) => m.mensaje);
    if (!ev || motivos.length) throw new Error(`ejemplo del nodo: «${nombre}» de ${quien} no pasa: ${JSON.stringify(cosa ? motivos : r.motivos)}`);
    await eje.anadir(ev);
    if (guarda) ids[guarda] = ev.id;
    return ev;
  }
  /** Lo que tiene que rechazarse: se anota el caso y sus motivos; si pasa, el ejemplo falla. */
  async function noPasa(caso, nombre, X, params, quien) {
    const antes = eje.orden.length;
    const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: t(), ...(K[quien] ? firmaDe(quien) : {}) });
    if (r.ok) throw new Error(`ejemplo del nodo: «${caso}» pasó y no debía`);
    if (eje.orden.length !== antes) throw new Error(`ejemplo del nodo: «${caso}» entró en el eje`);
    rechazos.push({ caso, motivos: r.motivos.map((m) => m.mensaje ?? String(m)) });
  }

  // 1. El titular, por invitación del operador, y su llavero (la cosa que firma; su clave la custodia StateArk).
  const inv = await eje.invitar({ autor: N.operador, invitado: N.titular, clave: K.titular.publica, t: t(), privada: K.operador.privada });
  ids.altaTitular = (await eje.aceptar(inv, K.titular, { t: t() })).id;
  await hacer('register a thing', ids.altaTitular, { thing: N.llavero, minutes: 60, key: K.llavero.publica }, N.titular, { cosa: N.llavero, guarda: 'llavero' });

  // 2. El camino del nodo: alta, autoridad, relé, archivo, contexto, en servicio.
  const nodo = await hacer('register the node', eje.genesisId, { node: N.nodo, minutes: 60, holder: N.titular }, N.operador, { guarda: 'nodo' });
  if (hasta === 'nodo') return { eje, ids, claves: K, epoca, rechazos };
  await hacer('register the authority', nodo.id, { thing: N.autoridad, minutes: 1, commit: '0a1b2c3', sha256: 'aa'.repeat(32) }, N.operador, { guarda: 'autoridad' });
  if (hasta === 'autoridad') return { eje, ids, claves: K, epoca, rechazos };
  await hacer('register the relay', nodo.id, { thing: N.rele, minutes: 1 }, N.operador, { guarda: 'rele' });
  if (hasta === 'rele') return { eje, ids, claves: K, epoca, rechazos };
  await hacer('register the archive', nodo.id, { thing: N.archivo, minutes: 1 }, N.operador, { guarda: 'archivo' });
  if (hasta === 'archivo') return { eje, ids, claves: K, epoca, rechazos };
  await hacer('declare a context', nodo.id, { thing: N.contexto, minutes: 1, event: 'cc'.repeat(32), 'relay url': 'wss://rele.ejemplo.invalid' }, N.operador, { guarda: 'contexto' });
  if (hasta === 'contexto') return { eje, ids, claves: K, epoca, rechazos };
  await hacer('put in service', nodo.id, {}, N.operador, { guarda: 'enServicio' });

  // 3. Las demás piezas, cada una con su papel; el vigía y el ejecutor, agentes (con su clave y su T), declarados.
  await hacer('register a container', nodo.id, { thing: N.contenedor, minutes: 1, digest: 'sha256:' + 'dd'.repeat(32), image: 'servidor-web-de-ejemplo' }, N.operador, { guarda: 'contenedor' });
  await hacer('register a gate', nodo.id, { thing: N.puerta, minutes: 1 }, N.operador, { guarda: 'puerta' });
  await hacer('register a deployment', nodo.id, { thing: N.despliegue, minutes: 1, commit: '4d5e6f7', arguments: '--puerto 8080', volume: '/datos/ejemplo' }, N.operador, { guarda: 'despliegue' });
  await hacer('register a worker', nodo.id, { thing: N.worker, minutes: 1 }, N.operador, { guarda: 'worker' });
  await hacer('register an agent', nodo.id, { thing: N.vigia, minutes: 180, key: K.vigia.publica, model: 'modelo-de-ejemplo', limits: ['una medida por hora'] }, N.operador, { cosa: N.vigia, guarda: 'vigia' });
  await hacer('register an agent', nodo.id, { thing: N.ejecutor, minutes: 180, key: K.ejecutor.publica, model: 'sin modelo: lista cerrada de órdenes', limits: ['sin shell'] }, N.operador, { cosa: N.ejecutor, guarda: 'ejecutor' });
  await hacer('declare agent', ids.vigia, {}, N.operador);
  await hacer('declare agent', ids.ejecutor, {}, N.operador);
  await hacer('register a served ledger', nodo.id, { thing: N.ejeServido, minutes: 1, ledger: 'eje-a', genesis: 'ee'.repeat(32) }, N.operador, { guarda: 'ejeServido' });

  // 4. El criterio del titular: lo que requiere autorización y quién firma (su llavero). La propia plantilla está en la
  // lista, así que el criterio mismo espera la firma: el llavero lo autoriza.
  const criterio = await hacer('require authorization', nodo.id, { signer: N.llavero }, N.titular, { guarda: 'criterio' });
  await autorizarCon(N.llavero, criterio.id);

  // 5. Reiniciar el vigía: por autorizar; la firma de otro no vale; el llavero firma; el ejecutor lo hace y deja su recibo.
  const reinicio = await hacer('restart a piece', ids.vigia, {}, N.operador, { guarda: 'reinicio' });
  ids.firmaDeOtro = (await autorizarCon(N.operador, reinicio.id, { aunqueNoValga: true })).id;
  ids.firmaReinicio = (await autorizarCon(N.llavero, reinicio.id)).id;
  await hacer('leave a receipt', ids.vigia, { operation: reinicio.id, result: 'reiniciado', evidence: 'ff'.repeat(32) }, N.ejecutor, { guarda: 'reciboReinicio' });

  // 6. Cambiar el núcleo: autorizado, pero la revalidación del libro falla: el ejecutor lo cierra con error.
  const cambio = await hacer('change the core', ids.autoridad, { commit: '9f8e7d6', sha256: 'bb'.repeat(32) }, N.operador, { guarda: 'cambioNucleo' });
  await autorizarCon(N.llavero, cambio.id);
  await hacer('report a failure', ids.autoridad, { operation: cambio.id, cause: 'la revalidación del libro con el núcleo nuevo falló', evidence: 'revalidacion-ejemplo.log' }, N.ejecutor, { guarda: 'falloNucleo' });

  // 7. Umbral (requiere autorización), vencimiento y su renovación, y medidas del vigía sobre las piezas.
  const umbral = await hacer('set a threshold', ids.contenedor, { what: 'disco', limit: 80, unit: '%' }, N.operador, { guarda: 'umbral' });
  await autorizarCon(N.llavero, umbral.id);
  const vence = await hacer('set an expiry', ids.contenedor, { what: 'certificado TLS', when: '2027-02-01T00:00:00Z' }, N.operador, { guarda: 'vencimiento' });
  await hacer('renew an expiry', vence.id, { when: '2027-05-01T00:00:00Z' }, N.operador, { guarda: 'renovacion' });
  await hacer('measure a piece', ids.contenedor, { what: 'disco', value: 42, unit: '%' }, N.vigia, { guarda: 'medida' });
  await hacer('measure a piece', ids.rele, { what: 'cola del espejo', value: 0, unit: 'eventos' }, N.vigia, { guarda: 'medidaRele' });

  // Una operación libre: reenviar la cola del espejo (sin firma), hecha.
  const reenvio = await hacer('resend the mirror queue', ids.rele, {}, N.operador, { guarda: 'reenvio' });
  await hacer('leave a receipt', ids.rele, { operation: reenvio.id, result: 'cola reenviada' }, N.ejecutor, { guarda: 'reciboReenvio' });

  // 8. Conexiones: una añadida (autorizada y hecha) con un cambio de permisos; otra añadida y quitada.
  const conexion = await hacer('add a connection', nodo.id, { name: 'nodo-vecino', key: claveDePrueba('nodo-vecino').publica, relays: ['wss://vecino.ejemplo.invalid'], permissions: ['leer-salud', 'aviso-caida'] }, N.operador, { guarda: 'conexion' });
  await autorizarCon(N.llavero, conexion.id);
  await hacer('leave a receipt', nodo.id, { operation: conexion.id, result: 'conexión abierta' }, N.ejecutor, { guarda: 'reciboConexion' });
  const permisos = await hacer('change a connection\'s permissions', conexion.id, { permissions: ['leer-salud'] }, N.operador, { guarda: 'permisos' });
  await autorizarCon(N.llavero, permisos.id);
  await hacer('leave a receipt', conexion.id, { operation: permisos.id, result: 'permisos cambiados' }, N.ejecutor, { guarda: 'reciboPermisos' });
  const otra = await hacer('add a connection', nodo.id, { name: 'nodo-de-paso', key: claveDePrueba('nodo-de-paso').publica, relays: ['wss://paso.ejemplo.invalid'], permissions: ['leer-salud'] }, N.operador, { guarda: 'otraConexion' });
  await autorizarCon(N.llavero, otra.id);
  await hacer('leave a receipt', nodo.id, { operation: otra.id, result: 'conexión abierta' }, N.ejecutor, { guarda: 'reciboOtra' });
  const quitar = await hacer('remove a connection', otra.id, {}, N.operador, { guarda: 'quitarConexion' });
  await autorizarCon(N.llavero, quitar.id);

  // 9. Una visita de fuera (invitada por el operador) intenta medir una pieza: no puede (no es agente del nodo).
  const invV = await eje.invitar({ autor: N.operador, invitado: N.visita, clave: K.visita.publica, t: t(), privada: K.operador.privada });
  ids.altaVisita = (await eje.aceptar(invV, K.visita, { t: t() })).id;
  await noPasa('una visita mide una pieza', 'measure a piece', ids.contenedor, { what: 'disco', value: 1, unit: '%' }, N.visita);

  // Por último, una operación que queda por autorizar: así la carta la enseña en «por autorizar».
  await hacer('restart a piece', ids.contenedor, {}, N.operador, { guarda: 'reinicioPendiente' });

  return { eje, ids, claves: K, epoca, rechazos };

  /** La autorización de `quien` sobre un registro (acciones.autorizar, firmada con su clave), asentada. */
  async function autorizarCon(quien, id, { aunqueNoValga = false } = {}) {
    const r = await A.autorizar(eje, id, quien, { privada: K[quien].privada, t: t() });
    if (!r.evento || (!r.ok && !aunqueNoValga)) throw new Error(`ejemplo del nodo: la autorización de ${quien} no pasa: ${JSON.stringify(r.motivos)}`);
    await eje.anadir(r.evento);
    return r.evento;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { eje, ids, rechazos } = await ejemploNodo();
  const e = eje.epoca();
  console.log(`eje del nodo de ejemplo: ${eje.orden.length} registros (${eje.registrosDeLaEpoca.length} de la época ${e.nombre}, ${e.id.slice(0, 12)}…)`);
  const c = await A.camino(eje, ids.nodo, N.operador);
  console.log('camino del nodo: ' + c.pasos.filter((p) => p.fuente === 'tutorial').map((p) => `${p.hacer?.plantilla ?? p.regla}${p.hecho ? ' ✓' : ''}`).join(' · '));
  const est = (id) => A.ejecuciones(eje, eje.obtener(id).sobre).find((x) => x.ocupante.ref === id)?.estacion;
  console.log(`reinicio del vigía: ${est(ids.reinicio)} · cambio de núcleo: ${est(ids.cambioNucleo)} (fin: ${(await import('../../src/motor.js')).cerrado(eje, ids.cambioNucleo).fin}) · reinicio del contenedor: ${est(ids.reinicioPendiente)}`);
  console.log('por autorizar (titular): ' + A.porAutorizar(eje, N.titular).map((x) => x.que).join(' | '));
  for (const r of rechazos) console.log(`rechazado como debía: ${r.caso}: ${r.motivos.join('; ').slice(0, 160)}`);
}
