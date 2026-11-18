// Un relé Nostr en memoria, con lo que el contrato AGRAM ↔ AARPIA pide (§1, §2):
//
//   - guarda eventos verificados (id y firma) y responde como NIP-01: OK true/false con motivo;
//   - filtra por ids, authors, kinds, etiquetas de una letra (#g, #s, #p, #h, #u…), since, until y limit;
//   - suscripciones vivas: lo que entra después del EOSE llega al suscriptor;
//   - por cada evento AGRAM (kind 7700) que acepta, publica un RECIBO DE LLEGADA (kind 7701)
//     firmado con la clave del relé: el reloj X.6.8.1 de AGRAM.
//
// El orden de llegada (`llegada`) es interno del relé; NIP-01 no lo expone. Lo usa el
// servicio HTTP para dar el `orden` de la función `eventos` de AGRAM.
//
// Con `archivo` el relé es también el ARCHIVO que nunca purga (contrato §1): cada evento que
// guarda se añade como una línea JSON, en orden de llegada, y al arrancar se vuelve a leer
// (verificando cada firma). Es lo que permite reconstruir el libro y revalidarlo entero.
//
// La llegada encadenada (SIP 0; docs/notas/ORDEN_FIRMADO.md): el recibo de cada 7700 lleva su
// «orden» en la cadena de su eje (etiqueta h; desde 0, en texto decimal) y su «anterior» (el id del
// recibo de orden − 1; falta solo en el 0). Una cadena por eje: `cadenas` guarda el último eslabón
// de cada uno y, al abrir el archivo, se rehace leyendo los 7701 guardados (los que no traen
// «orden», de antes de la cadena, no cuentan). Un 7703 no entra en la cadena.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { firmar, verificar, publicaDe, generarClaves, valores } from './nostr.js';
import { llegada } from './recibo.js';

export const KIND_EVENTO = 7700;
export const KIND_RECIBO = 7701;
export const KIND_RECHAZO = 7703;

/** ¿Pasa `ev` el filtro NIP-01 `f`? */
export function pasaFiltro(ev, f) {
  if (f.ids && !f.ids.includes(ev.id)) return false;
  if (f.authors && !f.authors.includes(ev.pubkey)) return false;
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.since !== undefined && ev.created_at < f.since) return false;
  if (f.until !== undefined && ev.created_at > f.until) return false;
  for (const [k, lista] of Object.entries(f)) {
    if (!/^#[a-zA-Z]$/.test(k)) continue;
    const tiene = valores(ev, k.slice(1));
    if (!lista.some((v) => tiene.includes(v))) return false;
  }
  return true;
}

/**
 * Los ids de los 7700 que la AUTORIDAD aceptó: los que tienen un recibo 7701 con la marca
 * `nucleo` (solo la pone la autoridad al aceptar). Lo que entrara por otro camino no cuenta.
 */
export function juzgadosAceptados(eventos) {
  const ids = new Set();
  for (const ev of eventos) if (ev.kind === KIND_RECIBO && ev.tags.some((t) => t[0] === 'nucleo' && t[1])) for (const t of ev.tags) if (t[0] === 'e') ids.add(t[1]);
  return ids;
}

/** La marca de tanda (CONTRATO_TANDA de AGRAM: contexto.tanda = { n, de, anterior }) del registro AGRAM de un 7700, o null. */
function marcaDeTanda(ev) {
  if (ev.kind !== KIND_EVENTO) return null;
  try {
    const cuerpo = JSON.parse(ev.content);
    return cuerpo?.contexto?.tanda ? { id: cuerpo.id, ...cuerpo.contexto.tanda } : null;
  } catch { return null; }
}

/**
 * Los ids Nostr que no se cargan al reabrir: los de una tanda cortada AL FINAL del archivo, y sus recibos. Una tanda se
 * escribe en una sola escritura (guardarVarios: miembro, recibo, miembro, recibo…), así que solo la última puede quedar a
 * medias, y siempre por el final. Se mira solo esa cola: desde el último miembro 1 que no tiene detrás nada ajeno a la
 * tanda. Completa: `de` miembros con n = 1…de, cada «anterior» el id del de antes, y cada uno con su recibo. Lo anterior
 * del archivo nunca se descarta, declare lo que declare un registro.
 */
export function tandaCortadaAlFinal(eventos) {
  const fuera = new Set();
  let inicio = -1;
  for (let i = eventos.length - 1; i >= 0; i--) {
    const ev = eventos[i];
    const m = marcaDeTanda(ev);
    if (m?.n === 1) { inicio = i; break; }
    if (!m && ev.kind !== KIND_RECIBO) return fuera; // algo suelto detrás: la última escritura no fue una tanda
  }
  if (inicio < 0) return fuera;
  const cola = eventos.slice(inicio);
  const miembros = cola.filter((ev) => ev.kind === KIND_EVENTO);
  const conRecibo = new Set(cola.filter((ev) => ev.kind === KIND_RECIBO).flatMap((ev) => valores(ev, 'e')));
  const marcas = miembros.map(marcaDeTanda);
  const de = marcas[0].de;
  const completa = miembros.length === de && marcas.every((m, k) => m && m.de === de && m.n === k + 1 && (k === 0 || m.anterior === marcas[k - 1].id)) && miembros.every((ev) => conRecibo.has(ev.id));
  if (!completa) for (const ev of miembros) fuera.add(ev.id);
  return fuera;
}

/** Más reciente primero; a igual created_at, por id (como hacen los relés). */
const masReciente = (a, b) => b.ev.created_at - a.ev.created_at || (a.ev.id < b.ev.id ? -1 : 1);

export class Rele {
  /**
   * @param {object} o
   * @param {string} [o.privada]  clave del relé (hex); si falta, una nueva
   * @param {() => Date} [o.ahora] el reloj del relé (inyectable en las pruebas)
   * @param {number[]} [o.kinds]   kinds admitidos (por defecto 7700, 7701 y 7703)
   * @param {(ev) => string[][]} [o.etiquetasRecibo]  etiquetas extra del recibo de un 7700 (la autoridad pone nucleo y epoca)
   * @param {(ev, instante: Date, rele: string, cadena?: { orden: number, anterior?: string }) => Promise<object>} [o.contenidoRecibo]  el recibo único (stateark.recibo@1) que va en el content del 7701, con el eslabón `cadena` de su eje; por defecto, uno de «llegada» firmado por el relé
   * @param {string[]} [o.firmantesDeRechazo]  claves que pueden publicar un 7703 (la de la autoridad)
   * @param {string[]|null} [o.firmantesDeEvento]  si se da, solo esas claves publican un 7700 (con autoridad: la de transporte, que solo publica lo ya juzgado)
   * @param {string} [o.archivo]   ruta del archivo JSONL donde se guarda todo, en orden de llegada (se carga con `abrir`)
   */
  constructor({ privada, ahora = () => new Date(), kinds = [KIND_EVENTO, KIND_RECIBO, KIND_RECHAZO], etiquetasRecibo = () => [], contenidoRecibo = null, firmantesDeRechazo = [], firmantesDeEvento = null, archivo, alGuardar = null } = {}) {
    this.privada = privada ?? generarClaves().privada;
    this.publica = publicaDe(this.privada);
    this.ahora = ahora;
    this.kinds = kinds;
    this.etiquetasRecibo = etiquetasRecibo;
    this.contenidoRecibo = contenidoRecibo ?? ((ev, instante, _rele, cadena) => llegada({ idAgram: valores(ev, 'g')[0] ?? '—', idNostr: ev.id, eje: valores(ev, 'h')[0] ?? '—', instante: instante.toISOString(), rele: this.publica, ...(cadena ?? {}) }, this.privada));
    this.cadenas = new Map(); // eje → { orden, id }: el último recibo encadenado de cada eje
    this.eventos = new Map(); // id → { ev, llegada }
    this.siguiente = 1;
    this.subs = new Set();
    this.archivo = archivo;
    this.firmantesDeRechazo = firmantesDeRechazo;
    this.firmantesDeEvento = firmantesDeEvento;
    this.alGuardar = alGuardar;
  }

  /** Carga el archivo (si lo hay), verificando cada evento. Devuelve cuántos cargó. */
  async abrir() {
    if (!this.archivo || !existsSync(this.archivo)) return 0;
    let n = 0;
    const lineas = readFileSync(this.archivo, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    const leidos = [];
    for (const [i, linea] of lineas.entries()) {
      let ev;
      // Un corte a mitad de escribir deja la ÚLTIMA línea truncada: se descarta (lo de antes ya estaba entero).
      try { ev = JSON.parse(linea); } catch (e) { if (i === lineas.length - 1) break; throw e; }
      leidos.push(ev);
    }
    // Una tanda se escribe de una vez (guardarVarios): solo la ÚLTIMA escritura puede quedar a medias. Si es una tanda
    // incompleta, no se carga (ni sus 7700 ni sus 7701). Nada de antes se descarta por lo que declaren los registros.
    const fuera = tandaCortadaAlFinal(leidos);
    for (const ev of leidos) {
      if (fuera.has(ev.id) || (ev.kind === KIND_RECIBO && valores(ev, 'e').some((e) => fuera.has(e)))) continue;
      if (this.eventos.has(ev.id)) continue;
      if (!(await verificar(ev))) throw new Error('el archivo del relé tiene un evento que no verifica: ' + ev.id);
      this.eventos.set(ev.id, { ev, llegada: this.siguiente++ });
      if (ev.kind === KIND_RECIBO) this.anotarEslabon(ev);
      n++;
    }
    return n;
  }

  /** Apunta el recibo 7701 `recibo` como último eslabón de la cadena de su eje, si trae «orden» (los de antes de la cadena, no). */
  anotarEslabon(recibo) {
    const eje = valores(recibo, 'h')[0];
    let r = null;
    try { r = JSON.parse(recibo.content); } catch { /* sin recibo único: no encadena */ }
    const k = Array.isArray(r?.recibo?.[2]) ? r.recibo[2].indexOf('orden') : -1;
    if (eje === undefined || k < 0 || !/^(0|[1-9][0-9]*)$/.test(r.recibo[3]?.[k] ?? '')) return;
    this.cadenas.set(eje, { orden: Number(r.recibo[3][k]), id: r.id });
  }

  /** El último recibo encadenado del eje `eje`: { orden, id } (id: el del recibo único), o null. */
  ultimoEslabon(eje) {
    return this.cadenas.get(eje) ?? null;
  }

  /** Todos los eventos guardados, en orden de llegada. */
  enOrden() {
    return [...this.eventos.values()].sort((a, b) => a.llegada - b.llegada).map((x) => x.ev);
  }

  /**
   * Varios 7700 de una vez, todos o ninguno (una tanda, CONTRATO_TANDA de AGRAM). Comprueba todos antes de guardar nada;
   * firma sus recibos en orden (órdenes seguidos de la cadena del eje); escribe los 2N en el archivo de una sola vez y solo
   * después avisa (espejo, suscripciones): nadie ve la tanda a medias. Si un recibo no llega a firmarse, no se guarda nada
   * y la cadena vuelve a donde estaba (lanza). → { ok, motivo?, recibos }.
   */
  async publicarVarios(evs) {
    if (!Array.isArray(evs) || !evs.length) return { ok: false, motivo: 'invalid: sin eventos' };
    if (evs.some((ev) => this.eventos.has(ev?.id))) return { ok: false, motivo: 'duplicate: alguno ya estaba' };
    if (new Set(evs.map((ev) => ev?.id)).size !== evs.length) return { ok: false, motivo: 'invalid: ids repetidos' };
    for (const ev of evs) {
      if (ev?.kind !== KIND_EVENTO) return { ok: false, motivo: 'blocked: en una tanda solo van 7700' };
      if (this.firmantesDeEvento && !this.firmantesDeEvento.includes(ev.pubkey)) return { ok: false, motivo: 'blocked: con autoridad, un 7700 solo entra por el servicio, ya juzgado' };
      if (!(await verificar(ev))) return { ok: false, motivo: 'invalid: id o firma' };
    }
    const instante = this.ahora();
    const ejes = new Set(evs.map((ev) => valores(ev, 'h')[0]).filter((e) => e !== undefined));
    const cadenas = new Map([...ejes].map((e) => [e, this.cadenas.get(e)]));
    const recibos = [];
    try {
      for (const ev of evs) recibos.push(await this.emitirRecibo(ev, instante));
    } catch (e) {
      for (const [eje, eslabon] of cadenas) if (eslabon === undefined) this.cadenas.delete(eje); else this.cadenas.set(eje, eslabon);
      throw e;
    }
    this.guardarVarios(evs.flatMap((ev, i) => [ev, recibos[i]]));
    return { ok: true, motivo: '', recibos };
  }

  /** NIP-01 ["EVENT", ev] → { ok, motivo, recibo? }. Idempotente por id. */
  async publicar(ev) {
    if (this.eventos.has(ev?.id)) return { ok: true, motivo: 'duplicate: ya estaba', duplicado: true, recibo: this.reciboDe(ev.id) };
    if (!this.kinds.includes(ev?.kind)) return { ok: false, motivo: 'blocked: kind no admitido' };
    if (ev.kind === KIND_RECIBO) return { ok: false, motivo: 'blocked: los recibos 7701 solo los emite el relé' };
    if (marcaDeTanda(ev)) return { ok: false, motivo: 'blocked: un miembro de una tanda solo entra con la tanda entera (publicarVarios)' };
    if (ev.kind === KIND_EVENTO && this.firmantesDeEvento && !this.firmantesDeEvento.includes(ev.pubkey)) return { ok: false, motivo: 'blocked: con autoridad, un 7700 solo entra por el servicio, ya juzgado' };
    if (ev.kind === KIND_RECHAZO && !this.firmantesDeRechazo.includes(ev.pubkey)) return { ok: false, motivo: 'blocked: los rechazos 7703 solo los firma la autoridad' };
    if (!(await verificar(ev))) return { ok: false, motivo: 'invalid: id o firma' };
    const instante = this.ahora();
    this.guardar(ev);
    let recibo;
    if (ev.kind === KIND_EVENTO) {
      recibo = await this.emitirRecibo(ev, instante);
      this.guardar(recibo);
    }
    return { ok: true, motivo: '', recibo };
  }

  /** El recibo de llegada de un evento: firmado por el relé, created_at = instante de llegada. */
  async emitirRecibo(ev, instante) {
    const tags = [['e', ev.id], ['ms', instante.toISOString()]];
    for (const n of ['g', 'h']) for (const v of valores(ev, n)) tags.push([n, v]);
    tags.push(...this.etiquetasRecibo(ev));
    // El eslabón: el siguiente orden de la cadena de su eje y, si no es el 0, el id del recibo anterior.
    const eje = valores(ev, 'h')[0];
    const previo = eje === undefined ? null : this.cadenas.get(eje);
    const cadena = eje === undefined ? undefined : previo ? { orden: previo.orden + 1, anterior: previo.id } : { orden: 0 };
    const content = JSON.stringify(await this.contenidoRecibo(ev, instante, this.publica, cadena));
    const recibo = await firmar({ kind: KIND_RECIBO, created_at: Math.floor(instante.getTime() / 1000), tags, content }, this.privada);
    this.anotarEslabon(recibo);
    return recibo;
  }

  guardar(ev) {
    this.guardarVarios([ev]);
  }

  /** Guarda en orden, escribe en el archivo de una sola vez y, después de todo, avisa (de forma síncrona, sin cortes). */
  guardarVarios(evs) {
    for (const ev of evs) this.eventos.set(ev.id, { ev, llegada: this.siguiente++ });
    if (this.archivo) appendFileSync(this.archivo, evs.map((ev) => JSON.stringify(ev) + '\n').join(''));
    for (const ev of evs) {
      if (this.alGuardar) this.alGuardar(ev); // p. ej. el espejo hacia los relés de la casa (src/espejo.js)
      for (const s of this.subs) if (s.filtros.some((f) => pasaFiltro(ev, f))) s.alLlegar(ev);
    }
  }

  /** NIP-01 ["REQ", …filtros] sin suscripción: los eventos guardados que pasan algún filtro. */
  consultar(...filtros) {
    const fs = filtros.length ? filtros : [{}];
    const vistos = new Map();
    for (const f of fs) {
      let filas = [...this.eventos.values()].filter((x) => pasaFiltro(x.ev, f)).sort(masReciente);
      if (f.limit !== undefined) filas = filas.slice(0, f.limit);
      for (const x of filas) vistos.set(x.ev.id, x);
    }
    return [...vistos.values()].sort(masReciente).map((x) => x.ev);
  }

  /**
   * NIP-01 ["REQ", sub, …filtros]: entrega lo guardado (alLlegar por cada uno), luego
   * alEose(), y después cada evento nuevo que pase. Devuelve cerrar() (["CLOSE", sub]).
   */
  suscribir(filtros, alLlegar, alEose = () => {}) {
    for (const ev of this.consultar(...filtros)) alLlegar(ev);
    alEose();
    const s = { filtros, alLlegar };
    this.subs.add(s);
    return () => this.subs.delete(s);
  }

  /** El orden de llegada de un evento en este relé (no es NIP-01). */
  llegada(id) {
    return this.eventos.get(id)?.llegada;
  }

  /** El recibo 7701 de un evento, si lo hay. */
  reciboDe(id) {
    // Nadie de fuera puede publicar un 7701 (ver publicar): todo recibo guardado es del relé,
    // también los firmados con una clave anterior suya y cargados del archivo.
    return this.consultar({ kinds: [KIND_RECIBO], '#e': [id] })[0];
  }
}

/**
 * El reloj X.6.8.1 a partir de un recibo: { instante, rele, firma, recibo }.
 * `instante` es el de la etiqueta `ms` si cuadra con created_at (mismo segundo); si no, el de created_at.
 */
export function relojDeRecibo(recibo) {
  const segundos = new Date(recibo.created_at * 1000);
  const ms = valores(recibo, 'ms')[0];
  const fino = ms && Math.floor(Date.parse(ms) / 1000) === recibo.created_at ? new Date(ms) : segundos;
  return { instante: fino.toISOString(), rele: recibo.pubkey, firma: recibo.sig, recibo: recibo.id };
}
