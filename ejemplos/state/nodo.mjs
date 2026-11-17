// El eje de un nodo de la clase `state`, de ejemplo (encargo «época del nodo», punto 7). TODO INVENTADO: identidades,
// claves de prueba derivadas de semillas fijas escritas aquí, digests, commits, urls; nada real y ningún servidor.
//
// El eje nace con la época de la clase state escrita en su libro (Eje.genesis({ epoca }), datos/epocas/state/), y en él:
//
//   1. la disposición de referencia (VG 17-11): el TITULAR abre el libro (escribe el génesis: el libro es suyo), da de
//      alta su llavero (la cosa cuya clave custodia StateArk: la que firma) e invita al operador, que acepta (su alta);
//   2. el camino del 9 del nodo, paso a paso y cada uno con su acción: el operador da de alta el nodo SOBRE SU PROPIA
//      ALTA, nombrando al titular, y sigue: autoridad, relé, archivo, un contexto declarado y en servicio;
//   3. las demás piezas con su papel: el contenedor del TLS (por digest), una puerta, el despliegue de la carta, un worker,
//      el vigía y el ejecutor (agentes, el vigía con 180 minutos de T) y un eje servido;
//   4. el titular escribe el criterio «require authorization» en el 2.4 del nodo (y su propio llavero lo firma). Lo
//      reservado al autor del génesis (retoques, enlaces del libro, puente, gobierno de la época, exterior con que se
//      verifica) lo firma el titular: docs/EPOCA_STATE.md §1 bis;
//   5. el operador pide reiniciar el vigía: queda por autorizar; la firma de otro no vale; el llavero la firma; el
//      ejecutor lo hace y deja su recibo, que la da por ejecutada;
//   6. un cambio de núcleo autorizado cuya revalidación falla: el ejecutor lo cierra con error y el núcleo no cambia;
//   7. un umbral (autorizado), una fecha de vencimiento con su renovación y medidas del vigía sobre las piezas;
//   8. conexiones (VG 17-11: la conexión es un invitado): el operador, dueño del nodo, fija el precio del grupo de las
//      conexiones («my R»: su R devuelta) e invita por nombre al nodo, con su R, a dos nodos; cada uno acepta (su alta);
//      el precio, cada invitación y el veto esperan la firma del llavero del titular, que firma; el vecino declara sus
//      relés en su alta y pide dos anclas devolviendo una unidad de R cada vez: el dueño sirve la primera («anchor
//      served») y la segunda queda pendiente; el otro queda fuera con el veto;
//   9. una visita de fuera que intenta medir una pieza y no puede;
//  10. los dos canales (encargo «los dos canales», VG 17-11 por Core State): el agente de la casa (con un modelo
//      simulado) y sus conversaciones: una por la casa (una persona pregunta, el agente responde), una por Telegram (el
//      servicio da de alta al interlocutor, abre la conversación, entra un mensaje, el agente responde, una entrega
//      fallida y su reintento enviado) y una renombrada y archivada, que ya no admite mensajes. El interlocutor de fuera
//      entra con «register an interlocutor»: una cosa del servicio sin clave, con un segundo de T (la 0 no abre una
//      cuenta sin un movimiento). La R en los canales (encargo «la R en los canales», VG 17-11): abrir y cada mensaje que
//      entra dan R al agente (la persona de la casa, la suya; el servicio, la suya, que emite y quema T real la primera
//      vez), el agente la guarda y cada mensaje que sale devuelve una unidad a su emisor; el dueño del nodo, al servir un
//      ancla, da una unidad de su R a quien la pidió.
//
// Uso: node ejemplos/state/nodo.mjs   (imprime el resumen; `ejemploNodo()` da el eje a las pruebas y a la carta).

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Eje } from '../../src/eje.js';
import { publicaDe, firmar, firmarPosesion } from '../../src/autoridad.js';
import * as A from '../../src/acciones.js';
import { epocaState } from '../../datos/epocas/state/generar.mjs';
import { registrosParaUnMensaje, cupo, RESERVA } from '../../datos/epocas/state/ayuda.mjs';

/** Una clave de prueba derivada de una semilla fija (nada real): { publica, privada } x-only en hexadecimal. */
export const claveDePrueba = (semilla) => {
  const privada = createHash('sha256').update('agram/ejemplo-state/' + semilla).digest('hex');
  return { publica: publicaDe(privada), privada };
};

/** Los nombres del ejemplo (inventados). */
export const N = Object.freeze({
  operador: 'operador', titular: 'titular', llavero: 'llavero', visita: 'visita',
  vecino: 'nodo-vecino', dePaso: 'nodo-de-paso',
  nodo: 'nodo-ejemplo', autoridad: 'autoridad', rele: 'rele', archivo: 'archivo', contexto: 'contexto-tienda',
  contenedor: 'contenedor-web', puerta: 'puerta-a', despliegue: 'despliegue-carta', worker: 'worker', vigia: 'vigia', ejecutor: 'ejecutor', ejeServido: 'eje-servido-a',
  agenteCasa: 'agente-casa', personaCasa: 'persona-casa', servicio: 'servicio-telegram', interlocutor: 'interlocutor-1',
});
const CON_CLAVE = [N.operador, N.titular, N.llavero, N.visita, N.vigia, N.ejecutor, N.vecino, N.dePaso, N.agenteCasa, N.personaCasa, N.servicio];
/** La huella del interlocutor de ejemplo (inventada: el sha256 de un texto fijo, no el HMAC de ningún identificador real). */
export const HUELLA = createHash('sha256').update('agram/ejemplo-state/interlocutor-1').digest('hex');
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
  const eje = await Eje.genesis({ identidad: N.titular, foco: ['nodo de ejemplo de la clase state'], t: t(), clave: K.titular.publica, privada: K.titular.privada, exigirFirmas: true, epoca });
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
  /** Un mensaje que entra con lo que lo precede (la reserva de quien escribe, si falta): registrosParaUnMensaje. */
  async function meter(conversacion, quien, params, guarda, guardaReserva) {
    for (const r of registrosParaUnMensaje(eje, conversacion, quien, params)) {
      const { X, ...resto } = r.params;
      await hacer(r.plantilla, X, resto, quien, { guarda: r.plantilla === RESERVA ? guardaReserva : guarda });
    }
  }
  /** Lo que tiene que rechazarse: se anota el caso y sus motivos; si pasa, el ejemplo falla. */
  async function noPasa(caso, nombre, X, params, quien) {
    const antes = eje.orden.length;
    const r = await A.transaccion(eje, nombre, { X, ...params }, quien, { t: t(), ...(K[quien] ? firmaDe(quien) : {}) });
    if (r.ok) throw new Error(`ejemplo del nodo: «${caso}» pasó y no debía`);
    if (eje.orden.length !== antes) throw new Error(`ejemplo del nodo: «${caso}» entró en el eje`);
    rechazos.push({ caso, motivos: r.motivos.map((m) => m.mensaje ?? String(m)) });
  }

  // 1. El libro es del titular (su génesis es su alta); da de alta su llavero (la cosa que firma; su clave la custodia
  // StateArk) e invita al operador, que acepta: su alta. La invitación da lo de siempre (una unidad de R del titular).
  ids.altaTitular = eje.genesisId;
  await hacer('register a thing', ids.altaTitular, { thing: N.llavero, minutes: 60, key: K.llavero.publica }, N.titular, { cosa: N.llavero, guarda: 'llavero' });
  const inv = await eje.invitar({ autor: N.titular, invitado: N.operador, clave: K.operador.publica, t: t(), privada: K.titular.privada });
  ids.invitacionOperador = inv.id;
  ids.altaOperador = (await eje.aceptar(inv, K.operador, { t: t() })).id;

  // 2. El camino del nodo: alta (sobre la del operador, que la escribe y es dueño de sus piezas), autoridad, relé,
  // archivo, contexto, en servicio.
  const nodo = await hacer('register the node', ids.altaOperador, { node: N.nodo, minutes: 60, holder: N.titular }, N.operador, { guarda: 'nodo' });
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

  // 8. Conexiones (VG 17-11, encargo «pedir el ancla y la conexión como invitado»): una conexión es un invitado con alta en
  // el libro del nodo. El dueño del nodo (el operador, que escribió su alta) pone el precio de su grupo «cercanos» (3) en
  // «my R» (su R devuelta: la R que da es la llave del servicio) e invita por nombre, al dominio del nodo (el 5 de la
  // invitación) y a ese grupo, a la identidad de cada otro nodo, con su clave y R suya; cada uno acepta (su alta). El
  // vecino declara sus relés en su alta y pide un ancla (devuelve una unidad de R y nombra el lote de su libro como
  // datos); el otro nodo queda fuera con el veto. Conexiones vigentes y pedidos: las lecturas «current connections» y
  // «anchors asked» de la época.
  // Con el criterio del titular escrito (paso 4), conectar, poner el precio del grupo y vetar esperan la firma de su
  // llavero (la lectura «second factor» de esta época): el llavero firma cada una. La conexión no está vigente hasta esa
  // firma (encargo «la firma del titular en las conexiones», VG 17-11).
  const altaOperador = eje.alta(N.operador).id;
  const precio = await hacer('set a group price', altaOperador, { token: 'my R', amount: 1, zone: 3 }, N.operador, { guarda: 'precioConexiones' });
  await autorizarCon(N.llavero, precio.id);
  const conectar = async (otro, cuanta, guarda) => {
    const inv = await eje.invitar({ autor: N.operador, invitado: otro, clave: K[otro].publica, da: [{ token: 'R', cantidad: cuanta }], grupo: 3, dominio: nodo.id, tema: 'conexión con el nodo ' + N.nodo, t: t(), privada: K.operador.privada });
    ids['invitacion' + guarda[0].toUpperCase() + guarda.slice(1)] = inv.id;
    ids[guarda] = (await eje.aceptar(inv, K[otro], { t: t() })).id;
    ids['firma' + guarda[0].toUpperCase() + guarda.slice(1)] = (await autorizarCon(N.llavero, inv.id)).id;
  };
  await conectar(N.vecino, 3, 'conexion');
  await hacer('declare my relays', ids.conexion, { relays: ['wss://vecino.ejemplo.invalid', 'wss://vecino-2.ejemplo.invalid'] }, N.vecino, { guarda: 'relesVecino' });
  // Dos pedidos de ancla del vecino: el primero lo sirve el dueño del nodo («anchor served», con la cabecera madre que
  // incluye la pedida, su nivel y el camino); el segundo queda pendiente.
  await hacer('ask for an anchor', nodo.id, { ledger: 'ab'.repeat(32), key: K[N.vecino].publica, level: 2, header: 'cd'.repeat(32) }, N.vecino, { guarda: 'pedidoAncla' });
  await hacer('anchor served', ids.pedidoAncla, { mother: '9a'.repeat(32), level: 3, path: 'sip' }, N.operador, { guarda: 'anclaServida' });
  await hacer('ask for an anchor', nodo.id, { ledger: 'ab'.repeat(32), key: K[N.vecino].publica, level: 2, header: '5e'.repeat(32) }, N.vecino, { guarda: 'pedidoPendiente' });
  await conectar(N.dePaso, 1, 'otraConexion');
  await hacer('declare my relays', ids.otraConexion, { relays: ['wss://paso.ejemplo.invalid'] }, N.dePaso);
  const veto = await hacer('veto someone', altaOperador, { whom: N.dePaso }, N.operador, { guarda: 'quitarConexion' });
  await autorizarCon(N.llavero, veto.id);

  // 9. Una visita de fuera (invitada por el operador) intenta medir una pieza: no puede (no es agente del nodo).
  const invV = await eje.invitar({ autor: N.operador, invitado: N.visita, clave: K.visita.publica, t: t(), privada: K.operador.privada });
  ids.altaVisita = (await eje.aceptar(invV, K.visita, { t: t() })).id;
  await noPasa('una visita mide una pieza', 'measure a piece', ids.contenedor, { what: 'disco', value: 1, unit: '%' }, N.visita);

  // 10. Los dos canales (encargo «los dos canales», VG 17-11 por Core State; cerrado con Core AARPIA). El agente de la
  // casa es una pieza «agent» declarada, con un modelo simulado; sus conversaciones cuelgan del 1.5 de su alta. La persona
  // de la casa y el servicio de Telegram entran por invitación del operador con R suya: abrir una conversación sobre el
  // alta del agente (una pieza) les cuesta el precio de su grupo, una unidad de esa R devuelta.
  await hacer('register an agent', nodo.id, { thing: N.agenteCasa, minutes: 600, key: K[N.agenteCasa].publica, model: 'modelo simulado (no llama a nada de fuera)', limits: ['una respuesta por mensaje'] }, N.operador, { cosa: N.agenteCasa, guarda: 'agenteCasa' });
  await hacer('declare agent', ids.agenteCasa, {}, N.operador);
  const entra = async (quien, cuanta, guarda) => {
    const i = await eje.invitar({ autor: N.operador, invitado: quien, clave: K[quien].publica, da: [{ token: 'R', cantidad: cuanta }], t: t(), privada: K.operador.privada });
    ids[guarda] = (await eje.aceptar(i, K[quien], { t: t() })).id;
  };
  await entra(N.personaCasa, 3, 'altaPersonaCasa');
  // Por la casa: la persona abre, pregunta (ella es su interlocutor) y el agente responde. Abrir le da al agente una
  // unidad de R de la persona (la suya: la pone en mano y, si le falta, la emite). Preguntar no se la da: la reserva
  // (encargo «reservar en lugar de entregar», VG 17-11): la persona escribe una vez su reserva de la conversación para el
  // agente («a reserve» de la 0, en «return») y cada mensaje que entra bloquea una unidad de su R con la salida en ella;
  // responder gasta una, que vuelve a la persona. Qué escribir, en orden, lo dice registrosParaUnMensaje.
  const casa = await hacer('open a conversation', ids.agenteCasa, { title: 'Horario de la tienda' }, N.personaCasa, { guarda: 'conversacionCasa' });
  await meter(casa.id, N.personaCasa, { channel: 'house', text: '¿A qué hora abre la tienda de ejemplo?' }, 'preguntaCasa', 'reservaCasa');
  await hacer('message out', casa.id, { text: 'Abre a las nueve (respuesta del modelo simulado).', 'reply to': ids.preguntaCasa }, N.agenteCasa, { guarda: 'respuestaCasa' });
  // Por Telegram: el servicio da de alta al interlocutor (la huella de su identificador de fuera, nunca el identificador),
  // abre la conversación y escribe lo que entra en su nombre; el agente responde; la primera entrega falla y el reintento
  // sale. El alta del interlocutor («register an interlocutor») es una cosa del servicio sin clave, con su canal y su huella
  // en el 6 y un segundo de T, lo mínimo que la 0 pide para abrir una cuenta. La R la pone el servicio, que es una persona
  // del libro: abrir da al agente una unidad de R del servicio; cada mensaje que entra la reserva en la reserva del
  // servicio para el agente en esa conversación (la primera vez la emite, y eso quema T real del servicio en el mismo
  // registro); la respuesta del agente gasta una, que vuelve al servicio (el interlocutor es una cosa sin clave: no emite ni
  // mueve R).
  await entra(N.servicio, 5, 'altaServicio');
  await hacer('register an interlocutor', ids.altaServicio, { thing: N.interlocutor, channel: 'telegram', fingerprint: HUELLA }, N.servicio, { guarda: 'interlocutor' });
  const tg = await hacer('open a conversation', ids.agenteCasa, { interlocutor: N.interlocutor }, N.servicio, { guarda: 'conversacionTelegram' });
  await meter(tg.id, N.servicio, { channel: 'telegram', text: 'Hola, ¿queda pan?', file: 'telegram:AgAD-ejemplo_0001' }, 'entraTelegram', 'reservaTelegram');
  await hacer('message out', tg.id, { text: 'Sí, hasta las dos.', 'reply to': ids.entraTelegram }, N.agenteCasa, { guarda: 'saleTelegram' });
  await hacer('delivery result', ids.saleTelegram, { result: 'failed', cause: 'el canal no respondió a tiempo' }, N.servicio, { guarda: 'entregaFallida' });
  await hacer('delivery result', ids.saleTelegram, { result: 'sent', reference: 'ref-ejemplo-42' }, N.servicio, { guarda: 'entregaEnviada' });
  // Una conversación renombrada y archivada: ya no admite mensajes.
  const vieja = await hacer('open a conversation', ids.agenteCasa, { title: 'Una prueba' }, N.personaCasa, { guarda: 'conversacionArchivada' });
  await hacer('rename a conversation', vieja.id, { title: 'Una prueba ya resuelta' }, N.personaCasa, { guarda: 'renombre' });
  // La persona había reservado para el agente en ella («a reserve» y «fill a reserve», una unidad): archivar, como es quien
  // reservó, retira lo que quede en el mismo registro.
  const reservaVieja = await hacer(RESERVA, vieja.id, { spender: N.agenteCasa, modes: 'return' }, N.personaCasa, { guarda: 'reservaArchivada' });
  await hacer('fill a reserve', reservaVieja.id, { amount: 1 }, N.personaCasa);
  await hacer('archive a conversation', vieja.id, {}, N.personaCasa, { guarda: 'archivada' });
  await noPasa('un mensaje en una conversación archivada', 'message in', vieja.id, { channel: 'house', text: '¿Sigue abierta?' }, N.personaCasa);

  // Por último, una operación que queda por autorizar: así la carta la enseña en «por autorizar». La hace el ejecutor (el
  // defecto es el último agente dado de alta, que desde el paso 10 es el de la casa).
  await hacer('restart a piece', ids.contenedor, { executor: N.ejecutor }, N.operador, { guarda: 'reinicioPendiente' });

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
  const { leerRegla } = await import('../../src/bqlm.js');
  const { ContextoEje } = await import('../../src/contexto-eje.js');
  const lee = (n, id) => leerRegla(e.lecturas.find((r) => r[0][0] === n), id, new ContextoEje(eje, { epoch: e })).valor.map((x) => x?.id ?? x);
  for (const x of lee('conversations', ids.agenteCasa)) console.log(`conversación «${lee('conversation title', x)}»: ${lee('conversation archived', x)[0] ? 'archivada' : 'activa'}, ${lee('message count', x)} mensajes, ${lee('messages to deliver', x).length} por entregar`);
  console.log(`R que guarda el agente de la casa: ${[N.personaCasa, N.servicio].map((q) => `${eje.saldo(N.agenteCasa, 'R:' + q)} de ${q}`).join(', ')}`);
  console.log(`cupo del agente: ${[ids.conversacionCasa, ids.conversacionTelegram].map((c) => cupo(eje, c)).join(' en la casa, ')} por Telegram`);
}
