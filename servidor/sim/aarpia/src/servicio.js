// El servicio HTTP fino: la MISMA API que la función `eventos` de AGRAM
// (servidor/supabase/funciones/eventos/api.js, la de AGRAM, importada sin tocar), con el almacén cambiado:
// en vez de Postgres, el relé Nostr (en memoria aquí; uno real mañana).
//
//   POST /eventos/ejes · POST /eventos · GET /eventos?eje&desde&cuantos   → idénticos a AGRAM
//   GET  /eventos/recibo?eje=…&id=<id AGRAM>                            → el reloj X.6.8.1 (nuevo, no rompe nada)
//        errores con { error, codigo }: 401 clave (también eje que no existe: misma respuesta, #106) · 404 sin-recibo · 405 metodo (los textos no cambian)
//
// Diferencias con la función de Supabase, todas internas:
//   - `recibido` es el instante del recibo 7701 que firma el relé (no la hora de Postgres);
//   - cada evento se publica como 7700 firmado con la CLAVE DE TRANSPORTE del servicio
//     (la carta no manda su clave privada; cuando publique ella misma, firmará el autor: contrato §1);
//   - `orden` es el orden de llegada al relé dentro del eje.
//
// Con `autoridad` (src/autoridad.js; sprint 2, contrato §7) el servicio además JUZGA cada
// evento con el núcleo de AGRAM antes de aceptarlo: 7701 con nucleo y epoca si pasa;
// 422 { error, id, reason, nucleo, epoca, rechazo } y un 7703 firmado si no. Sin ella,
// solo transporta (sprint 1).
//
// Con `sellador` (la forma de stateark/sim: sellar(ids), prueba(id), verificar(id, prueba)) cada
// recibo 7701 se sella por lotes de `lote` (contrato §3 aplicado a §2: el tercer reloj vigila el
// reloj del relé; y como el 7701 lleva nucleo y epoca, queda anclado CON QUÉ se juzgó cada evento):
//   GET /eventos/sello?eje=…&id=<id AGRAM>  → { recibo, prueba, verificacion } (minar es cosa del sellador)

import { crearApi, hashDeClave } from '../../../supabase/funciones/eventos/api.js';
import * as verificar from '../../../supabase/funciones/eventos/verificar.js';
import { Rele, relojDeRecibo, KIND_EVENTO, juzgadosAceptados } from './rele.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { envolver, desenvolver } from './sobre.js';
import { generarClaves, valores, publicaDe } from './nostr.js';
import { crearArchivos } from '../../../supabase/funciones/archivos/api.js';
import { crearBlossom } from './blossom.js';
import { almacenArchivos } from './archivos.js';
import { crearEspejo } from './espejo.js';

/**
 * El almacén que espera api.js, sobre un relé. Los ejes (nombre y hash de la
 * clave de lectura) viven aquí: un relé no sabe de ejes; solo los etiqueta (h).
 */
export function almacenRele({ rele, privadaTransporte, ahora = () => new Date(), antesDePublicar = async () => {}, alCrearEje = () => {}, soloJuzgados = false }) {
  const ejes = new Map(); // nombre → { eje, clave_lectura_hash, creado }
  const indices = new Map(); // eje → [{ orden, id, nostr, recibido }] por llegada
  const lista = (eje) => indices.get(eje) ?? [];
  const eventoDe = (fila) => desenvolver(rele.consultar({ ids: [fila.nostr] })[0]);

  const almacen = {
    async crearEje(eje, claveHash) {
      if (ejes.has(eje)) return null;
      const fila = { eje, clave_lectura_hash: claveHash, creado: ahora().toISOString() };
      ejes.set(eje, fila);
      indices.set(eje, []);
      alCrearEje([...ejes.values()]);
      return { creado: fila.creado };
    },
    async eje(eje) {
      return ejes.has(eje) ? { ...ejes.get(eje) } : null;
    },
    async vacio(eje) {
      return lista(eje).length === 0;
    },
    async claveDe(eje, autor) {
      // El alta: el primer evento del eje que declara la clave del autor en contexto.claves.
      for (const fila of lista(eje)) {
        const ev = eventoDe(fila);
        if (Object.hasOwn(ev?.contexto?.claves ?? {}, autor)) return ev.contexto.claves[autor];
      }
      return undefined;
    },
    async obtener(eje, id) {
      const f = lista(eje).find((x) => x.id === id);
      return f ? { orden: f.orden, recibido: f.recibido } : null;
    },
    async insertar(eje, { id, cuerpo }) {
      if (lista(eje).some((x) => x.id === id)) return null;
      await antesDePublicar(eje, cuerpo);
      const sobre = await envolver({ evento: cuerpo, eje, privada: privadaTransporte, claveDe: (n) => almacen.claveDe(eje, n), ahora: ahora() });
      const r = await rele.publicar(sobre);
      if (!r.ok) throw new Error('el relé no aceptó el evento: ' + r.motivo);
      const fila = { orden: lista(eje).length + 1, id, nostr: sobre.id, recibido: relojDeRecibo(r.recibo).instante };
      indices.get(eje).push(fila);
      return { orden: fila.orden, recibido: fila.recibido };
    },
    async listar(eje, desde, cuantos) {
      return lista(eje).filter((f) => f.orden > desde).slice(0, cuantos).map((f) => ({ orden: f.orden, recibido: f.recibido, cuerpo: eventoDe(f) }));
    },
    /** Rehace la tabla de ejes y los índices desde lo guardado: los ejes y el archivo del relé. */
    restaurar(filasDeEjes, eventosEnOrden) {
      for (const f of filasDeEjes) {
        ejes.set(f.eje, f);
        if (!indices.has(f.eje)) indices.set(f.eje, []);
      }
      const aceptados = soloJuzgados ? juzgadosAceptados(eventosEnOrden) : null;
      for (const ev of eventosEnOrden) {
        if (ev.kind !== KIND_EVENTO) continue;
        if (aceptados && !aceptados.has(ev.id)) continue; // con autoridad, solo lo juzgado y aceptado
        const eje = valores(ev, 'h')[0];
        if (!indices.has(eje)) continue;
        const recibo = rele.reciboDe(ev.id);
        indices.get(eje).push({ orden: indices.get(eje).length + 1, id: valores(ev, 'g')[0], nostr: ev.id, recibido: recibo ? relojDeRecibo(recibo).instante : null });
      }
    },
    /** El reloj X.6.8.1 de un evento AGRAM del eje, o null. */
    async recibo(eje, id) {
      const f = lista(eje).find((x) => x.id === id);
      const recibo = f && rele.reciboDe(f.nostr);
      return recibo ? relojDeRecibo(recibo) : null;
    },
  };
  return almacen;
}

/**
 * El manejador (Request) → Response. Devuelve { manejar, rele, almacen, transporte }.
 * `crearEjes` como en AGRAM: { secreto } (cabecera X-Crear-Ejes) o { servicio } (Bearer).
 */
export function crearServicio({
  autoridad = null,
  espejos = [], // relés Nostr de verdad a los que se replica todo lo guardado (src/espejo.js), p. ej. el strfry de la casa
  archivo = null, // con él, el libro persiste: el relé en `archivo` (JSONL) y los ejes en `archivo`.ejes.json; llamar a abrir()
  privadaTransporte = generarClaves().privada,
  rele = new Rele({ archivo: archivo ?? undefined, alGuardar: espejos.length ? crearEspejo({ urls: espejos, aviso: (m) => console.error('[espejo] ' + m) }).enviar : null, firmantesDeRechazo: autoridad ? [autoridad.publica] : [], firmantesDeEvento: autoridad ? [publicaDe(privadaTransporte)] : null, contenidoRecibo: autoridad ? (sobre, instante, rele) => autoridad.contenidoDeAceptacion(sobre, instante, rele) : null, etiquetasRecibo: autoridad ? (sobre) => autoridad.etiquetasDeAceptacion(valores(sobre, 'h')[0], JSON.parse(sobre.content)) : undefined }),
  crearEjes = { secreto: 'prueba' },
  ahora = () => new Date(),
  blossom = crearBlossom({ ahora }),
  sellador = null,
  lote = 10,
  ...opciones
} = {}) {
  const archivoEjes = archivo ? archivo + '.ejes.json' : null;
  const almacen = almacenRele({
    rele, privadaTransporte, ahora, soloJuzgados: Boolean(autoridad),
    antesDePublicar: autoridad ? (eje, ev) => autoridad.aplicar(eje, ev) : undefined,
    alCrearEje: archivoEjes ? (filas) => writeFileSync(archivoEjes, JSON.stringify(filas)) : undefined,
  });
  // El sellado de los recibos 7701 por lotes.
  let porSellar = [];
  async function sellarPendientes() {
    if (!sellador || !porSellar.length) return null;
    const ids = porSellar;
    porSellar = [];
    return sellador.sellar(ids);
  }
  if (sellador) {
    let vivos = false;
    rele.suscribir([{ kinds: [7701] }], (ev) => {
      if (!vivos) return; // lo ya guardado al arrancar no se vuelve a sellar aquí
      porSellar.push(ev.id);
      if (porSellar.length >= lote) sellarPendientes();
    }, () => { vivos = true; });
  }

  /** Con `archivo`: carga el relé, los ejes y el libro de la autoridad. Devuelve cuántos eventos cargó. */
  async function abrir() {
    const n = await rele.abrir();
    const eventos = rele.enOrden();
    almacen.restaurar(archivoEjes && existsSync(archivoEjes) ? JSON.parse(readFileSync(archivoEjes, 'utf8')) : [], eventos);
    if (autoridad) await autoridad.restaurar(eventos);
    return n;
  }
  let ejeEnCurso = null; // el eje del POST que se está atendiendo (los POST van de uno en uno)
  const cripto = !autoridad ? verificar : {
    ...verificar,
    async comprobar(evento, contexto) {
      const r = await verificar.comprobar(evento, contexto);
      if (!r.ok) return r; // mala forma, id, firma o alta: 400/403 como en AGRAM, sin 7703
      const juicio = await autoridad.juzgar(ejeEnCurso, r.evento);
      if (juicio.ok) return r;
      if (!autoridad.rechazos.has(r.evento.id)) {
        const claveAutor = r.evento.contexto?.claves?.[r.evento.autor] ?? (await almacen.claveDe(ejeEnCurso, r.evento.autor));
        const ev = await autoridad.rechazo({ nombre: ejeEnCurso, evento: r.evento, reason: juicio.reason, claveAutor, ahora: ahora() });
        await rele.publicar(ev);
      }
      return { ok: false, estado: 422, error: 'evento rechazado: ' + juicio.reason.join('; ') };
    },
  };
  const api = crearApi({ almacen, cripto, crearEjes, ahora, ...opciones });
  let cola = Promise.resolve(); // POST /eventos de uno en uno: juzgar y aplicar contra el mismo estado
  const enCola = (f) => {
    const r = cola.then(f, f);
    cola = r.catch(() => {});
    return r;
  };
  const archivos = almacenArchivos({ blossom, privadaTransporte, eje: (n) => almacen.eje(n), ahora });
  const apiArchivos = crearArchivos({ almacen: archivos, ahora });

  async function manejar(request) {
    const url = new URL(request.url);
    // La función `archivos` de AGRAM: …/archivos y …/archivos/<id>.
    if (/\/archivos(\/[^/]+)?\/?$/.test(url.pathname)) return apiArchivos(request);
    // El Blossom mismo, para verlo desde fuera: /blossom/<sha256>, /blossom/upload.
    if (url.pathname.startsWith('/blossom/')) {
      const dentro = new URL(url);
      dentro.pathname = url.pathname.slice('/blossom'.length);
      return blossom(new Request(dentro, request));
    }
    if (/\/(recibo|sello)\/?$/.test(url.pathname) && request.method !== 'OPTIONS') {
      const responder = (estado, cuerpo) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      if (request.method !== 'GET') return responder(405, { error: 'solo GET', codigo: 'metodo' });
      // La misma autorización que GET /eventos: la clave de lectura del eje.
      const nombre = url.searchParams.get('eje') ?? '';
      // Eje inexistente y clave mala: la misma respuesta (401), como abrirEje de AGRAM (#106): no se revela qué ejes existen.
      const fila = await almacen.eje(nombre);
      const clave = request.headers.get('x-clave-lectura');
      const hash = clave ? await hashDeClave(clave) : null;
      if (!fila || !hash || hash !== fila.clave_lectura_hash) return responder(401, { error: 'clave de lectura ausente o incorrecta', codigo: 'clave' });
      const reloj = await almacen.recibo(nombre, url.searchParams.get('id') ?? '');
      if (!reloj) return responder(404, { error: 'sin recibo para ese id en ese eje', codigo: 'sin-recibo' });
      if (!/\/sello\/?$/.test(url.pathname)) return responder(200, reloj);
      if (!sellador) return responder(404, { error: 'este servicio no sella los recibos', codigo: 'sin-sellador' });
      const prueba = await sellador.prueba(reloj.recibo);
      if (!prueba) return responder(404, { error: 'el recibo aún no se ha mandado a sellar', codigo: 'sin-sellar' });
      const verificacion = prueba.pendiente ? { ok: false, motivo: 'pendiente: el lote aún no está en un bloque' } : await sellador.verificar(reloj.recibo, prueba);
      return responder(200, { recibo: reloj.recibo, prueba, verificacion });
    }
    if (autoridad && request.method === 'POST' && !url.pathname.replace(/\/+$/, '').endsWith('/ejes')) {
      return enCola(async () => {
        const texto = await request.clone().text();
        let datos = null;
        try { datos = JSON.parse(texto); } catch { /* api.js responde 400 */ }
        ejeEnCurso = datos?.eje ?? null;
        const respuesta = await api(request);
        if (respuesta.status !== 422) return respuesta;
        const detalle = autoridad.rechazos.get(datos?.evento?.id);
        const cuerpo = { ...(await respuesta.json()), ...detalle };
        return new Response(JSON.stringify(cuerpo), { status: 422, headers: respuesta.headers });
      });
    }
    return api(request);
  }
  return { manejar, abrir, sellarPendientes, rele, almacen, archivos, blossom, autoridad, transporte: privadaTransporte };
}
