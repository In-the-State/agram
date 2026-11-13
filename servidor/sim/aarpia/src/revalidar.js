// Revalidar el libro entero con otro núcleo antes de cambiar de commit (contrato §7,
// punto 4, [A] con Core AGRAM): se vuelve a juzgar cada evento en su orden de llegada y se
// compara con lo que se decidió entonces. Si un solo veredicto cambia (aceptado ↔
// rechazado), NO se cambia de núcleo: se dice cuál y se avisa a Core AGRAM. Si solo cambia
// el texto de un rechazo, es un aviso, no un bloqueo.
//
// Lo decidido entonces sale del archivo del relé: un 7700 es un aceptado, y un 7703 es un
// rechazo con sus `reason` y el evento dentro. Un núcleo nuevo no reescribe la historia.

import { valores } from './nostr.js';
import { KIND_EVENTO, KIND_RECHAZO, juzgadosAceptados } from './rele.js';
import { causas } from './recibo.js';

/** Lo decidido, por eje y en orden de llegada: [{ eje, evento, aceptado, reason }]. */
export function decisiones(eventosEnOrden) {
  const lista = [];
  const aceptados = juzgadosAceptados(eventosEnOrden); // un 7700 sin recibo de la autoridad no es una decisión
  for (const ev of eventosEnOrden) {
    if (ev.kind === KIND_EVENTO && aceptados.has(ev.id)) lista.push({ eje: valores(ev, 'h')[0], evento: JSON.parse(ev.content), aceptado: true, reason: [] });
    else if (ev.kind === KIND_RECHAZO) {
      const r = JSON.parse(ev.content);
      const evento = r.evento;
      const reason = causas(r);
      lista.push({ eje: valores(ev, 'h')[0], evento, aceptado: false, reason });
    }
  }
  return lista;
}

/**
 * @param {object} o
 * @param {object[]} o.eventos   el archivo del relé en orden de llegada (rele.enOrden())
 * @param {Function} o.Eje        la clase Eje del núcleo que se quiere probar
 * @returns {Promise<{ ejes, juzgados, diferencias, avisos }>} diferencias vacío = se puede cambiar
 */
export async function revalidar({ eventos, Eje, exigirFirmas = true }) {
  const porEje = new Map();
  for (const d of decisiones(eventos)) {
    if (!porEje.has(d.eje)) porEje.set(d.eje, []);
    porEje.get(d.eje).push(d);
  }
  const diferencias = [];
  const avisos = [];
  let juzgados = 0;
  for (const [eje, lista] of porEje) {
    let libro = null;
    for (const d of lista) {
      let ahora;
      try {
        if (!libro) {
          if (!d.aceptado) ahora = (await Eje.desde([d.evento], { exigirFirmas }).then(() => [], (e) => [e.message]));
          else {
            libro = await Eje.desde([d.evento], { exigirFirmas });
            ahora = [];
          }
        } else ahora = await libro.validar(d.evento);
      } catch (e) {
        ahora = [String(e.message)];
      }
      juzgados++;
      const aceptadoAhora = ahora.length === 0;
      if (aceptadoAhora !== d.aceptado) {
        diferencias.push({ eje, id: d.evento.id, antes: d.aceptado ? 'aceptado' : d.reason, ahora: aceptadoAhora ? 'aceptado' : ahora });
        break; // lo que viene detrás de este eje ya no se juzgaría sobre el mismo estado
      }
      if (!d.aceptado && JSON.stringify(ahora) !== JSON.stringify(d.reason)) avisos.push({ eje, id: d.evento.id, antes: d.reason, ahora });
      if (d.aceptado && libro && d.evento.id !== libro.genesisId) await libro.anadir(d.evento);
    }
  }
  return { ejes: porEje.size, juzgados, diferencias, avisos };
}
