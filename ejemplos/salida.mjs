// Ejemplo con datos inventados: la salida con saldos (tramo 4, parte B; agram-equipo/DISENO_TRAMO_4.md §4;
// docs/notas/PUENTE.md §11). Quien no acepta un cambio, o a quien una regla deja sin escribir, se va con lo suyo.
//
//   - El libro viejo es de ana (de demostración, sin claves de identidad), con bea y cris dentro. bea da R propia, escribe
//     una nota y emite tres «pan» atados a ella: tiene R, P y E.
//   - ana (que tiene el P que hace falta para los dos tercios) pone en vigor un cambio de gobierno con una regla que deja a
//     bea sin escribir («not bea»).
//   - bea se va: planDeSalida dice los pasos y este recorrido los firma en orden, volviendo a pedir el plan tras cada uno:
//     declara cada serie en el libro viejo (la declaración es suelo: ninguna regla añadida la alcanza), abre su libro con
//     la época del viejo de antes del cambio, escribe en él de qué libro cuelga (con sus claves de línea) y trae sus
//     declaraciones con su prueba de sello.
//   - El libro viejo lo sella su línea, con un sellador simulado como el de ejemplos/puente.mjs: una cabecera de nivel 1
//     firmada por la clave de su casa y una de nivel 4 firmada por el sellador (claves inventadas).
//
// Nada real.
//
//   node ejemplos/salida.mjs

import { pathToFileURL } from 'node:url';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { EPOCA_0_BTML, idDeRegistro } from '../src/epocas.js';
import { generarClaves } from '../src/autoridad.js';
import { selloEnCascada } from './ikisai/sellos.mjs';
import { planDeSalida, saldosDe, leerTraido } from '../datos/epocas/puente.mjs';

/** Calendario inventado: el martes 17 de noviembre de 2026 (UTC). */
export const T0 = '2026-11-17T08:00:00Z';

/** La regla que deja a bea sin escribir (como en test/revision-suelo.test.js, S6). */
export const VETO = [['not bea'], [0], ['=first ev.3 != "bea"'], ['ev.3'], ['mint', 'transfer', 'lock', 'release', 'burn'], ['*'], ['ejemplo de la salida'], ['epoch 0'], ['after at most a year ahead'], ['not bea: bea does not write here any more']];

/**
 * El libro viejo, de ana, con `invitados` dentro: una época hija de la 0 que solo baja a 0 los niveles de firmeza del
 * gobierno (como test/revision-suelo.test.js), para poner un cambio en vigor sin sello. → { viejo, reloj, intenta,
 * recorrer, claves, lineas, sellar }: `lineas`, las claves de línea del viejo ([[1, casa], [4, sellador]]); `sellar(id)`,
 * la prueba de sello en cascada de un registro del viejo.
 */
export async function libroViejo({ invitados = ['bea', 'cris'] } = {}) {
  const M0 = { ref: EPOCA_0_BTML.id };
  const raiz = [['la salida'], M0, M0, M0, M0, M0, [['hija de ejemplo'], ['hereda'], [EPOCA_0_BTML.id]], [M0, M0, M0, M0, M0, M0, M0, M0, M0, [M0, M0, M0, [0], [0]]]];
  const viejo = await Eje.genesis({ identidad: 'ana', foco: ['el libro viejo'], t: T0, demostracion: true, epoca: { raiz, registros: [] } });
  let s = 0;
  const reloj = () => new Date(Date.parse(T0) + ++s * 1000).toISOString().replace('.000Z', 'Z');
  for (const n of invitados) await viejo.aceptar(await viejo.invitar({ autor: 'ana', invitado: n, t: reloj() }), {}, { t: reloj() });
  /** Una plantilla en `eje`: el registro asentado o { motivos }. */
  const intenta = async (eje, cual, params, yo) => {
    const r = await A.transaccion(eje, cual, params, yo, { t: reloj() });
    if (!r.ok) return { motivos: r.motivos };
    return { ev: await eje.anadir(r.evento) };
  };
  /** Un cambio de gobierno en el viejo: propone, apoya ana con todo su P, aprueba, retira el apoyo y pone en vigor. */
  const recorrer = async (titulo, propias, registros) => {
    const m = { ref: viejo.epoca().id };
    const cambio = Array.from({ length: 7 }, (_, i) => (i === 0 ? [titulo] : propias[i] ?? (i === 6 ? [['propuesto en el ejemplo'], ['hereda'], [viejo.epoca().id]] : m)));
    const propuesta = await intenta(viejo, 'propose a change', { X: viejo.genesisId, title: titulo, explanation: 'ejemplo', change: cambio, records: registros, class: 'governance' }, 'ana');
    await intenta(viejo, 'support a change', { X: propuesta.ev.id }, 'ana');
    const aprobacion = await intenta(viejo, 'enact a change', { X: propuesta.ev.id }, 'ana');
    await intenta(viejo, 'withdraw support', { X: propuesta.ev.id }, 'ana');
    return intenta(viejo, 'put a change in force', { X: aprobacion.ev.id }, 'ana');
  };
  const claves = { casa: await generarClaves(), sellador: await generarClaves() };
  const lineas = [[1, claves.casa.publica], [4, claves.sellador.publica]];
  const sellar = async (id) => (await selloEnCascada(id, {
    observador: claves.sellador, capas: [{ nivel: 1, grado: 0, claves: claves.casa, libro: viejo.genesisId }, { nivel: 4, grado: 2, red: 0, libro: viejo.genesisId }],
  })).decupla;
  return { viejo, reloj, intenta, recorrer, claves, lineas, sellar };
}

/** bea con lo suyo en el viejo: da R propia, escribe una nota y emite tres «pan» atados a ella. → { nota, serieE }. */
export async function beaConLoSuyo(m) {
  const { viejo, intenta } = m;
  await intenta(viejo, 'give own R', { X: viejo.alta('ana').id, quantity: 1 }, 'bea');
  const nota = (await intenta(viejo, 'anchor here', { X: viejo.alta('bea').id, title: 'pan', content: 'el pan de bea' }, 'bea')).ev;
  await intenta(viejo, 'issue E tied to X', { X: nota.id, denomination: 'pan', quantity: 3 }, 'bea');
  return { nota, serieE: 'E:bea/pan@' + nota.id };
}

/** El cambio de gobierno que deja a bea sin escribir, puesto en vigor: el registro que lo puso. */
export async function silenciarABea(m) {
  const r = await m.recorrer('fuera bea', { 2: [{ ref: idDeRegistro(VETO) }] }, [VETO]);
  if (!r.ev) throw new Error('el cambio no entra: ' + JSON.stringify(r.motivos));
  return r.ev;
}

/**
 * La salida de `quien`, paso a paso: pide el plan, firma el primer paso «listo» en su libro y vuelve a pedirlo, hasta que
 * no queda ninguno listo. Con `sellar` (por defecto), quien guarda el viejo sella cada declaración firmada; sin él,
 * el plan se queda esperando el sello. → { plan (el último), nuevo (el eje del libro nuevo), sellos }.
 */
export async function salir(m, quien, { punto = 'vigente', sellar = true, claves = m.lineas } = {}) {
  const { viejo, reloj } = m;
  let nuevo = null;
  const sellos = new Map();
  for (;;) {
    const plan = planDeSalida(viejo, quien, { punto, claves, nuevo, sellos });
    const p = plan.pasos.find((x) => x.estado === 'listo');
    // Quien guarda el viejo sella lo que se escribe en él: aquí, cada declaración ya firmada que aún no tiene su sello.
    const sinSello = sellar && plan.pasos.find((x) => x.que === 'declarar' && x.estado === 'hecho' && !sellos.has(x.id));
    if (sinSello) {
      sellos.set(sinSello.id, await m.sellar(sinSello.id));
      continue;
    }
    if (!p) return { plan, nuevo, sellos };
    if (p.que === 'genesis') {
      nuevo = await Eje.genesis({ ...p.params, t: reloj(), demostracion: true });
      continue;
    }
    const eje = p.libro === 'viejo' ? viejo : nuevo;
    const r = await A.transaccion(eje, p.plantilla, p.params, p.quien, { t: reloj() });
    if (!r.ok) throw new Error('paso ' + p.n + ' (' + p.que + '): ' + r.motivos.map((x) => x.regla + ': ' + x.mensaje).join('; '));
    await eje.anadir(r.evento);
  }
}

/** Construye el ejemplo entero: el libro viejo, lo de bea, el cambio que la silencia y su salida. */
export async function ejemploSalida() {
  const m = await libroViejo();
  const suyo = await beaConLoSuyo(m);
  const puesta = await silenciarABea(m);
  const saldos = saldosDe(m.viejo, 'bea');
  const { plan, nuevo } = await salir(m, 'bea', { punto: 'antes' });
  return { ...m, ...suyo, puesta, saldos, plan, nuevo };
}

/** Una serie, corta para leerla. */
const corta = (k) => (k.length > 26 ? k.slice(0, 24) + '…' : k);

/** ¿Lleva la época vigente de `eje` la regla `nombre`? */
export const conRegla = (eje, nombre) => eje.epoca().reglasConId.some((x) => x.regla[0][0] === nombre);

/** Lo que el ejemplo deja, en llano. */
export function resumen(e) {
  const traidos = e.plan.pasos.filter((p) => p.que === 'traer').map((p) => leerTraido(e.nuevo, p.id));
  return {
    'lo que bea puede declarar': e.saldos.map(({ serie, cantidad, declarable, causa }) => corta(serie) + ': ' + (declarable ? cantidad : causa)),
    'los pasos': e.plan.pasos.map((p) => p.n + '. ' + p.que + (p.serie ? ' ' + corta(p.serie) : '') + ', en el libro ' + p.libro + ': ' + p.estado),
    'lo que no se lleva': e.plan.noSeLleva.map(({ serie, cantidad, causa }) => corta(serie) + ' (' + cantidad + '): ' + causa),
    'el libro nuevo nace con la época': { 'el id de la del viejo': e.nuevo.epoca().id === e.viejo.epoca().id, 'con «not bea»': conRegla(e.nuevo, 'not bea'), 'el viejo, con «not bea»': conRegla(e.viejo, 'not bea') },
    'lo traído, leído': traidos.map((t) => corta(t.payload[1][0][0]) + ': ' + t.payload[1][1][0] + (t.fiable ? ', fiable' : ', no fiable') + ', firme ' + t.firme),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const e = await ejemploSalida();
  console.log(JSON.stringify(resumen(e), null, 2));
}
