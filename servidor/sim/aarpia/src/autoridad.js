// AARPIA como AUTORIDAD del libro (contrato §7, [A] con Core AGRAM, 12-11):
// acepta o rechaza cada evento con el núcleo de AGRAM como librería; aquí es el
// propio núcleo de este repo (src/eje.js), no una copia fijada por commit.
//
//   - Cada eje se reconstruye con `Eje.desde` y `eje.anadir`, en el orden de llegada.
//   - Un evento se juzga con `eje.validar`: los mismos `reason` canónicos de la época
//     que ve la carta. La época es la que el evento referencia, resuelta en el libro.
//   - Al aceptar: el recibo 7701 lleva ["nucleo", <commit>] y ["epoca", <id>].
//   - Al rechazar: HTTP 422 { id, reason, nucleo, epoca, rechazo } y un evento 7703,
//     firmado por la autoridad, con la causa y el evento rechazado dentro (lección #53).
//     El evento rechazado no entra en el libro y no se borra.

import { Eje } from '../../../../src/eje.js';
import { firmar, generarClaves, publicaDe } from './nostr.js';
import { KIND_RECHAZO, KIND_EVENTO, juzgadosAceptados } from './rele.js';
import { aceptacion, rechazo as reciboDeRechazo, causas } from './recibo.js';

export { KIND_RECHAZO };
// En el original, el commit del núcleo copiado (vendor/agram/NUCLEO.json). Aquí el núcleo es el del repo, sin commit fijo:
// la marca que lleva el 7701 (`nucleo`) es esta etiqueta.
export const NUCLEO = { commit: 'agram-repo' };

export class Autoridad {
  /**
   * @param {object} o
   * @param {string} [o.privada]       la clave de autoridad de AARPIA (firma los 7703)
   * @param {boolean} [o.exigirFirmas] como la carta: todo autor con clave y firma (por defecto sí)
   */
  constructor({ privada = generarClaves().privada, exigirFirmas = true } = {}) {
    this.privada = privada;
    this.publica = publicaDe(privada);
    this.exigirFirmas = exigirFirmas;
    this.nucleo = NUCLEO.commit;
    this.ejes = new Map(); // nombre → Eje
    this.rechazos = new Map(); // id AGRAM → { id, reason, nucleo, epoca, evento }
  }

  /** La época que rige `evento` en `nombre`: la que referencia, o la del génesis del eje. */
  epocaDe(nombre, evento) {
    const propia = evento?.contexto?.epoca;
    if (propia) return propia;
    const eje = this.ejes.get(nombre);
    return eje ? eje.obtener(eje.genesisId)?.contexto?.epoca ?? null : null;
  }

  /** Juzga sin escribir: { ok: true } o { ok: false, reason: [...] }. */
  async juzgar(nombre, evento) {
    const eje = this.ejes.get(nombre);
    try {
      if (!eje) {
        await Eje.desde([evento], { exigirFirmas: this.exigirFirmas }); // un génesis: que el núcleo lo admita
        return { ok: true };
      }
      const reason = await eje.validar(evento);
      return reason.length ? { ok: false, reason } : { ok: true };
    } catch (e) {
      return { ok: false, reason: [String(e.message).replace(/^(génesis|evento) rechazado: /, '')] };
    }
  }

  /** Aplica en el libro de la autoridad un evento ya juzgado admisible. */
  async aplicar(nombre, evento) {
    const eje = this.ejes.get(nombre);
    if (!eje) this.ejes.set(nombre, await Eje.desde([evento], { exigirFirmas: this.exigirFirmas }));
    else await eje.anadir(evento);
  }

  /** Rehace el libro y los rechazos desde el archivo del relé (en orden de llegada), sin volver a juzgar. */
  async restaurar(eventosEnOrden) {
    const aceptados = juzgadosAceptados(eventosEnOrden); // solo lo que aceptó la autoridad (recibo con `nucleo`)
    for (const ev of eventosEnOrden) {
      const eje = ev.tags.find((t) => t[0] === 'h')?.[1];
      if (ev.kind === KIND_EVENTO && aceptados.has(ev.id)) await this.aplicar(eje, JSON.parse(ev.content));
      else if (ev.kind === KIND_RECHAZO) {
        const r = JSON.parse(ev.content);
        const evento = r.evento;
        const reason = causas(r);
        const tag = (n) => ev.tags.find((t) => t[0] === n)?.[1] ?? null;
        this.rechazos.set(evento.id, { id: evento.id, reason, nucleo: tag('nucleo'), epoca: tag('epoca'), rechazo: ev.id });
      }
    }
  }

  /** El recibo único de aceptación que va en el content del 7701: lo firma la autoridad, con núcleo y época. */
  contenidoDeAceptacion(sobre, instante, rele) {
    const tag = (n) => sobre.tags.find((t) => t[0] === n)?.[1];
    const eje = tag('h');
    return aceptacion({ idAgram: tag('g'), idNostr: sobre.id, eje, instante: instante.toISOString(), rele, nucleo: this.nucleo, epoca: this.epocaDe(eje, JSON.parse(sobre.content)) ?? undefined }, this.privada);
  }

  /** Las etiquetas que la aceptación añade al recibo 7701. */
  etiquetasDeAceptacion(nombre, evento) {
    return [['nucleo', this.nucleo], ['epoca', this.epocaDe(nombre, evento) ?? '']];
  }

  /** El evento de rechazo 7703, firmado por la autoridad, con la causa dentro. */
  async rechazo({ nombre, evento, reason, claveAutor, ahora = new Date() }) {
    const epoca = this.epocaDe(nombre, evento);
    const tags = [['g', evento.id], ['h', nombre]];
    if (claveAutor) tags.push(['p', claveAutor]);
    tags.push(['nucleo', this.nucleo], ['epoca', epoca ?? '']);
    const recibo = await reciboDeRechazo({ idAgram: evento.id, eje: nombre, instante: ahora.toISOString(), reason, nucleo: this.nucleo, epoca: epoca ?? undefined, universo: 'autoridad AARPIA ' + this.publica }, this.privada);
    // El content es el recibo único; el evento rechazado va al lado, fuera del hash (ya lo firmó su autor).
    const ev = await firmar({ kind: KIND_RECHAZO, created_at: Math.floor(ahora.getTime() / 1000), tags, content: JSON.stringify({ ...recibo, evento }) }, this.privada);
    this.rechazos.set(evento.id, { id: evento.id, reason, nucleo: this.nucleo, epoca, rechazo: ev.id });
    return ev;
  }
}
