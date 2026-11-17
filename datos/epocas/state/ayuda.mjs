// La ayuda de la época state para quien escribe en las conversaciones desde fuera de la carta (la pasarela de StateArk,
// un conversador): el cupo de mensajes de una conversación (encargo «reservar en lugar de entregar», VG 17-11;
// docs/notas/R_EN_CANALES.md y docs/EPOCA_STATE.md §8, «La R en una conversación»).
//
// Abrir una conversación sigue entregando R al agente (eso le da P). Los mensajes ya no la entregan: la RESERVAN. Quien
// escribe un «message in» bloquea su R con la salida en su reserva de esa conversación para ese agente (un registro
// «a reserve» de la época 0, anclado en la conversación, que nombra al agente y solo dice «return»); el agente, al
// contestar con un «message out», gasta una unidad de la reserva del otro lado EN ESA MISMA CONVERSACIÓN, en modo
// «return» (vuelve disponible a su dueño). Sin cupo en esa conversación, el agente no escribe.
//
// Aquí:
//   · registrosParaUnMensaje: qué registros hay que escribir, en orden, para meter un mensaje (la reserva si falta, y el
//     mensaje), con las plantillas de siempre;
//   · cupo: lo que le queda a un agente en una conversación (sustituye a mirar eje.saldo(agente, 'R:' + emisor));
//   · las fórmulas que escriben las reglas y plantillas de la época state que lo exigen (node datos/epocas/state/ayuda.mjs
//     --escribir, y luego npm run epoca:state); test/reserva-canales.test.js comprueba que los archivos las llevan.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formatear } from '../generar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** La plantilla de la reserva (época 0) y lo que dice su payload: 3.1 quién gasta, 1.0 los modos. */
export const RESERVA = 'a reserve';

// ---------- lo que lee el JS ----------

const payloadDe = (eje, id) => eje.obtener(id)?.payload;
/** El agente de una conversación (su 1) y su interlocutor (su 3.1). */
export const agenteDe = (eje, conversacion) => [payloadDe(eje, conversacion)?.[1]].flat(2)[0];
export const interlocutorDe = (eje, conversacion) => [payloadDe(eje, conversacion)?.[3]?.[1]].flat(2)[0];
/** Quien escribió el alta de una identidad: ella misma si es una persona; su dueño si es una cosa. */
export const duenoDe = (eje, identidad) => eje.alta(identidad)?.autor ?? null;
const esPersona = (eje, identidad) => !eje.alta(identidad) || duenoDe(eje, identidad) === identidad;
const soloReturn = (p) => {
  const modos = [p?.[1]?.[0]].flat(2);
  return modos.includes('return') && !modos.includes('burn') && !modos.includes('pay');
};

/** Las reservas colgadas de una conversación (por llegada), de `de` (su autor) y para `para` (su 3.1), si se dicen. */
export function reservasEn(eje, conversacion, { de, para } = {}) {
  return eje.sobre(conversacion).filter((r) => [r.payload?.[4]].flat(2).includes(RESERVA)
    && (de === undefined || r.autor === de) && (para === undefined || [r.payload?.[3]?.[1]].flat(2)[0] === para));
}

/** La reserva de `quien` en la conversación para `para` en la que bloquean los mensajes (solo «return»), o null. */
export const reservaPara = (eje, conversacion, quien, para) => reservasEn(eje, conversacion, { de: quien, para }).find((r) => soloReturn(r.payload)) ?? null;

/**
 * El emisor de la R que gasta `agente` al escribir en la conversación: el agente de la conversación gasta la de la persona
 * del otro lado (el interlocutor si es una persona; si es una cosa, quien escribió su alta: el servicio o el dueño del
 * otro agente); el otro agente (agente con agente), la del dueño de este.
 */
export function emisorQueGasta(eje, conversacion, agente) {
  const ag = agenteDe(eje, conversacion);
  const inter = interlocutorDe(eje, conversacion);
  if (agente === ag || agente === duenoDe(eje, ag)) return esPersona(eje, inter) ? inter : duenoDe(eje, inter);
  return duenoDe(eje, ag);
}

/**
 * El cupo que le queda a `agente` (por defecto, el de la conversación) en una conversación: lo que tienen bloqueado, con la
 * salida en una reserva suya colgada de esa conversación que nombra a `agente`, los autores de esas reservas, de la R que
 * gasta (emisorQueGasta), y solo las reservas del otro lado (otroLado). Lo reservado en otra conversación no cuenta.
 */
export function cupo(eje, conversacion, agente = agenteDe(eje, conversacion)) {
  const clave = 'R:' + emisorQueGasta(eje, conversacion, agente);
  const lado = otroLado(eje, conversacion, agente);
  let n = 0;
  for (const r of reservasEn(eje, conversacion, { para: agente })) if (lado.includes(r.autor)) n += eje.bloqueado(r.autor, clave, r.id);
  return n;
}

/**
 * Quién es el otro lado de la conversación para `agente` (revisión de seguridad, hallazgo 5: solo su reserva da cupo): para
 * el agente de la conversación o su dueño, el interlocutor y quien escribió su alta (el servicio, por un interlocutor de
 * fuera; el dueño del otro agente); para el otro agente, el agente de la conversación y su dueño.
 */
export function otroLado(eje, conversacion, agente) {
  const ag = agenteDe(eje, conversacion);
  const inter = interlocutorDe(eje, conversacion);
  return agente === ag || agente === duenoDe(eje, ag) ? [inter, duenoDe(eje, inter)] : [ag, duenoDe(eje, ag)];
}

/**
 * Qué registros hay que escribir, en orden, para que `quien` meta un mensaje en una conversación: [{ plantilla, params }],
 * cada uno para `acciones.transaccion(eje, plantilla, params, quien)`, uno detrás de otro (la reserva tiene que estar en el
 * libro antes que el mensaje que la llena). `opciones.plantilla`: «message in», «message in from an agent» o
 * «message out» (por defecto, la que toca a `quien`: el agente de la conversación o su dueño, «message out»; otro agente,
 * «message in from an agent»; los demás, «message in»); lo demás de `opciones` son los parámetros del mensaje (text,
 * channel, give…). La reserva hace falta para lo que el mensaje bloquea: el «message in» de una persona (su R), el de otro
 * agente con algo que pasar (la R de su dueño, una por defecto) y el «message out» con «give» (agente con agente). Que haya
 * cupo para lo que el mensaje gasta lo dice `cupo`; sin él, el mensaje no entra.
 */
export function registrosParaUnMensaje(eje, conversacion, quien, opciones = {}) {
  const { plantilla: pedida, esAgente = false, ...params } = opciones;
  const ag = agenteDe(eje, conversacion);
  const plantilla = pedida ?? (quien === ag || quien === duenoDe(eje, ag) ? 'message out' : esAgente ? 'message in from an agent' : 'message in');
  const give = params.give;
  const fuera = [];
  const reservar = (para) => {
    if (!reservaPara(eje, conversacion, quien, para)) fuera.push({ plantilla: RESERVA, params: { X: conversacion, spender: para, modes: 'return' } });
  };
  if (plantilla === 'message out') {
    if (give > 0) reservar(interlocutorDe(eje, conversacion));
  } else if (give === undefined || give > 0) reservar(ag);
  fuera.push({ plantilla, params: { X: conversacion, ...params } });
  return fuera;
}

// ---------- las fórmulas ----------

/** El elemento de un where a la profundidad d (it a 0, it2 a 1…). */
const el = (d) => (d === 0 ? 'it' : 'it' + (d + 1));
const S = (x) => '(text(utf8(' + x + ')))';
const dice = (R, en) => '(payload(' + R + ')).' + en;
const SOLO_RETURN = (R) => '"return" in ' + dice(R, '1.0') + ' and not ("burn" in ' + dice(R, '1.0') + ') and not ("pay" in ' + dice(R, '1.0') + ')';

// En la regla: la candidata es el mensaje; C su conversación.
const C = '(first ev.6.5)';
const W = 'first ev.3';
const AG = 'first (payload(' + C + ')).1';
const DAG = 'first (first (first (payload(' + C + ')).1).6).3';
const INT = 'first (payload(' + C + ')).3.1';
const DINT = 'first (first (first (payload(' + C + ')).3.1).6).3';
const personaW = '(count (first ev.3).6 = 0 or first (first (first ev.3).6).3 = first ev.3)';
const personaINT = '(count (first (payload(' + C + ')).3.1).6 = 0 or ' + DINT + ' = ' + INT + ')';
const DW = 'first (first (first ev.3).6).3';

/** La salida `R` es una reserva de este libro de `titular`, colgada de la conversación del mensaje, que nombra a `gasta`. */
const reservaEnLaConversacion = (R, titular, gasta) => 'first ' + R + '.5 = ' + R + ' and "' + RESERVA + '" in ' + dice(R, 4)
  + ' and first ' + R + '.3 = ' + titular + ' and first ' + dice(R, '3.1') + ' = ' + gasta + ' and first ' + R + '.6.5 = first ev.6.5';

/** El movimiento `v` (a la profundidad d) bloquea R de `emisor` de quien escribe con la salida en su reserva de esta conversación para `para` (solo «return»). */
const llena = (v, d, emisor, para) => {
  const R = S(el(d + 1));
  return 'R in ' + v + '.0.0.0 and lock in ' + v + '.4 and ' + v + '.0.0.1 = ' + emisor + ' and ' + v + '.3.0 = ' + W
    + ' and count (' + v + '.2 where ' + reservaEnLaConversacion(R, W, para) + ' and ' + SOLO_RETURN(R) + ') > 0';
};
/**
 * El movimiento `v` (a la profundidad d) libera R de `emisor` de su titular, que es el otro lado (`lado`: dos
 * identidades), con la salida en una reserva suya de esta conversación que nombra a quien escribe.
 */
const gasta = (v, d, emisor, lado) => {
  const R = S(el(d + 1));
  return 'R in ' + v + '.0.0.0 and release in ' + v + '.4 and ' + v + '.0.0.1 = ' + emisor + ' and ' + v + '.3.0 != ' + W
    + ' and (' + v + '.3.0 = ' + lado[0] + ' or ' + v + '.3.0 = ' + lado[1] + ')'
    + ' and count (' + v + '.2 where ' + reservaEnLaConversacion(R, v + '.3.0', W) + ') > 0';
};
/** Al menos una unidad (con `exacto`, una y solo una: lo que gasta una contestación) de lo que cumple `bien` y ningún otro movimiento de R que no sea acuñar (poner en mano la propia). */
const soloEso = (bien, otro = null, exacto = false) => 'sum ((ev.1 where ' + bien + ') each 1) ' + (exacto ? '=' : '>=') + ' 1 and count (ev.1 where R in it.0.0.0 and not (mint in it.4) and not (' + bien + ')' + (otro ? ' and not (' + otro + ')' : '') + ') = 0';

/** Quién escribe un «message in» (sin cambios: los canales y el interlocutor). */
const QUIEN_ENTRA = '(first (payload(ev)).1.0 in epoch.9.0.5.2 and first (payload(ev)).1.1 = first ev.3 or not (first (payload(ev)).1.0 in epoch.9.0.5.2) and first (payload(ev)).1.1 != first ev.3 and first (first (first (payload(ev)).1.1).6).3 = first ev.3 and "interlocutor" in (payload(first (first (payload(ev)).1.1).6)).5)';

/**
 * La fórmula de «who writes a message» con el cupo por conversación. «message in» de una persona (en la casa, el
 * interlocutor; fuera, el servicio): al menos una unidad de R suya bloqueada con la salida en su reserva de esta
 * conversación para el agente (solo «return»). «message in» de una cosa (otro agente): al menos una unidad de R del dueño
 * de este agente gastada de una reserva de esta conversación que lo nombra (de su titular, en «return»: vuelve a él), y
 * puede bloquear además R de su propio dueño en su reserva para el agente. «message out» (el agente o su dueño): al menos
 * una unidad de R de la persona del otro lado gastada de una reserva de esta conversación que nombra a quien escribe;
 * agente con agente (canal de la casa e interlocutor que es una cosa), puede bloquear además R del dueño del agente en su
 * reserva para el otro. Ningún otro movimiento de R que no sea acuñar la propia.
 */
export function formulaDeQuienEscribe() {
  const cabeza = '=not ((first (payload(ev)).0 = "message in" or first (payload(ev)).0 = "message out") and last (first ev.6).5 = "3000000000" and "conversation with an agent" in (payload(' + C + ')).5)';
  const entraPersona = personaW + ' and ' + soloEso(llena('it', 0, W, AG));
  const entraCosa = 'not ' + personaW + ' and ' + soloEso(gasta('it', 0, DAG, [AG, DAG]), llena('it', 0, DW, AG), true);
  const salePersona = personaINT + ' and ' + soloEso(gasta('it', 0, INT, [INT, DINT]), null, true);
  const saleCosa = 'not ' + personaINT + ' and ' + soloEso(gasta('it', 0, DINT, [INT, DINT]), 'first (payload(ev)).1.0 in epoch.9.0.5.2 and ' + llena('it', 0, DAG, INT), true);
  return cabeza + ' or first (payload(ev)).0 = "message in" and ' + QUIEN_ENTRA + ' and (' + entraPersona + ' or ' + entraCosa + ')'
    + ' or first (payload(ev)).0 = "message out" and (' + W + ' = ' + AG + ' or ' + W + ' = ' + DAG + ') and (' + salePersona + ' or ' + saleCosa + ')';
}

// En las plantillas: it = la conversación, me = quien escribe, memo = el payload.
const tAG = 'first (payload(it)).1';
const tDAG = 'first (first (first (payload(it)).1).6).3';
const tINT = 'first (payload(it)).3.1';
const tDINT = 'first (first (first (payload(it)).3.1).6).3';
const tPersonaMe = '(count me.6 = 0 or first (first me.6).3 = me)';
const tPersonaINT = '(count (first (payload(it)).3.1).6 = 0 or ' + tDINT + ' = ' + tINT + ')';

/** El id de mi reserva en la conversación para `para` (solo «return»): la primera. */
const miReserva = (para) => 'first (((down it) where first it2.3 = me and "' + RESERVA + '" in (payload(it2)).4 and first (payload(it2)).3.1 = ' + para + ' and ' + SOLO_RETURN('it2') + ') each 5)';
/** Las reservas del otro lado (`lado`) que me nombran y cuyo autor tiene bloqueada en ellas al menos una unidad de R de `emisor`. */
const paraMi = (emisor, lado) => '((down it) where (first it2.3 = ' + lado[0] + ' or first it2.3 = ' + lado[1] + ') and "' + RESERVA + '" in (payload(it2)).4 and first (payload(it2)).3.1 = me and sum (((((first it2.3).1 where R in it3.0.0.0 and it3.0.0.1 = ' + emisor + ') each 2) where first it3.0 = first it2.5) each 1) >= 1)';
/** Gastar una unidad de R de `emisor` de la primera reserva de la conversación que me nombra y tiene cupo: liberarla (vuelve a su titular). */
const gastarUna = (emisor, lado) => 'release 1 R.(' + emisor + ') from first ((' + paraMi(emisor, lado) + ') each 3) exit first ((' + paraMi(emisor, lado) + ') each 5)';
/** Bloquear `cuanto` de R de `emisor` en mi reserva para `para`. */
const bloquear = (cuanto, emisor, para) => 'lock ' + cuanto + ' R.(' + emisor + ') from me exit ' + miReserva(para);

/** Las líneas del 4 de «message in» y «message in from an agent». */
export function cuatroDelMensajeQueEntra() {
  return [
    '=' + tPersonaMe + ' and (count memo.1.5 = 0 and put 1 at me.1.(R.(me)).1 and ' + bloquear('1', 'me', tAG) + ' or count memo.1.5 > 0 and first memo.1.5 > 0 and put first memo.1.5 at me.1.(R.(me)).1 and ' + bloquear('first memo.1.5', 'me', tAG) + ')',
    '=not ' + tPersonaMe + ' and ' + gastarUna(tDAG, [tAG, tDAG]),
    '=not ' + tPersonaMe + ' and (count memo.1.5 = 0 and ' + bloquear('1', 'first (first me.6).3', tAG) + ' or count memo.1.5 > 0 and first memo.1.5 > 0 and ' + bloquear('first memo.1.5', 'first (first me.6).3', tAG) + ')',
  ];
}

/** Las líneas del 4 de «message out». */
export function cuatroDelMensajeQueSale() {
  return [
    '=' + tPersonaINT + ' and ' + gastarUna(tINT, [tINT, tDINT]) + ' or not ' + tPersonaINT + ' and ' + gastarUna(tDINT, [tINT, tDINT]),
    '=count memo.1.5 > 0 and first memo.1.5 > 0 and (me = ' + tDAG + ' and put first memo.1.5 at me.1.(R.(me)).1 or me != ' + tDAG + ') and ' + bloquear('first memo.1.5', tDAG, tINT),
  ];
}

/** Una reserva mía colgada de la conversación, como expresión a la profundidad d (su where da el elemento el(d)). */
const unaMia = (d) => 'first (((down it) where first ' + el(d) + '.3 = me and "' + RESERVA + '" in (payload(' + el(d) + ')).4) each 5)';

/**
 * El 4 de «archive a conversation»: si quien archiva reservó en la conversación, el mismo registro retira lo que quede en
 * su primera reserva (lo que tiene bloqueado con esa salida, de la primera serie que lo tenga); el resto, a mano.
 */
export function cuatroDelArchivo() {
  const serie = 'first ((me.1 where count (it2.2 where first it3.0 = ' + unaMia(3) + ') > 0) each 0)';
  const cuanto = 'sum ((((me.1 where count (it2.2 where first it3.0 = ' + unaMia(3) + ') > 0) each 2) where first it2.0 = ' + unaMia(2) + ') each 1)';
  return ['=count ((down it) where first it2.3 = me and "' + RESERVA + '" in (payload(it2)).4) > 0 and release (' + cuanto + ') (' + serie + ') from me exit ' + unaMia(1)];
}

/**
 * La lectura «conversation quota» (it = la conversación): el cupo que le queda a su agente, lo bloqueado de la R de la
 * persona del otro lado con la salida en una reserva colgada de la conversación, escrita por quien lo tiene bloqueado, que
 * nombra al agente. Quien lo tiene: el interlocutor (una persona, u otro agente con R de su dueño) o, si el interlocutor es
 * una cosa, también quien escribió su alta (el servicio).
 */
export function formulaDelCupo() {
  const R = S('first it2.0');
  const de = (H, emisor) => 'sum (((((' + H + ').1 where R in it2.0.0.0 and it2.0.0.1 = ' + emisor + ') each 2) where first ' + R + '.5 = ' + R + ' and "' + RESERVA + '" in ' + dice(R, 4)
    + ' and first ' + R + '.3 = ' + H + ' and first ' + dice(R, '3.1') + ' = ' + tAG + ' and first ' + R + '.6.5 = first it.5) each 1)';
  return '=count (epoch where ' + tPersonaINT + ') * ' + de(tINT, tINT) + ' + count (epoch where not ' + tPersonaINT + ') * (' + de(tINT, tDINT) + ' + ' + de(tDINT, tDINT) + ')';
}

export const ARCHIVOS = Object.freeze({
  quienEscribe: join(AQUI, 'reglas', 'who-writes-a-message.json'),
  cupo: join(AQUI, 'reglas', 'conversation-quota.json'),
  entra: join(AQUI, 'plantillas', 'message-in.json'),
  entraDeAgente: join(AQUI, 'plantillas', 'message-in-from-an-agent.json'),
  sale: join(AQUI, 'plantillas', 'message-out.json'),
  archivo: join(AQUI, 'plantillas', 'archive-a-conversation.json'),
});

// node datos/epocas/state/ayuda.mjs --escribir: pone las fórmulas en las reglas y en el 4 de las plantillas.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--escribir')) {
  const poner = (archivo, cambiar) => {
    const registro = JSON.parse(readFileSync(archivo, 'utf8'));
    cambiar(registro);
    writeFileSync(archivo + '.nuevo', formatear(registro) + '\n');
    renameSync(archivo + '.nuevo', archivo);
    console.log('escrito ' + archivo);
  };
  poner(ARCHIVOS.quienEscribe, (r) => { r[2] = [formulaDeQuienEscribe()]; });
  poner(ARCHIVOS.cupo, (r) => { r[2] = [formulaDelCupo()]; });
  poner(ARCHIVOS.entra, (p) => { p[4] = cuatroDelMensajeQueEntra(); });
  poner(ARCHIVOS.entraDeAgente, (p) => { p[4] = cuatroDelMensajeQueEntra(); });
  poner(ARCHIVOS.sale, (p) => { p[4] = cuatroDelMensajeQueSale(); });
  poner(ARCHIVOS.archivo, (p) => { p[4] = cuatroDelArchivo(); });
}
