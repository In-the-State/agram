// Ejemplo con datos inventados: el gobierno del cambio de reglas (encargo A21; agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md;
// docs/notas/GOBIERNO.md). Un libro de ana (la dueña) que nace con una época hija de prueba de la 0: nombra a ana y a bea
// en su 7.9.5 (quién cuenta, las dos con la presión máxima) y pide el nivel 0 a un cambio corriente (7.9.3; el de gobierno
// sigue en el 4 de la 0). Bea entra invitada por ana. Luego:
//   - una propuesta corriente («más margen»): ana y bea la apoyan con todo su P, se aprueba y se pone en vigor sin prueba
//     (nivel 0); en vigor, las dos retiran su apoyo (ya no cambia nada) y recuperan su P;
//   - una propuesta de gobierno («nombrar a cris»): solo ana la apoya; la mitad de la presión no llega a los dos tercios y
//     no se aprueba.
// Con el motor de versiones (A23, docs/notas/VERSIONES.md), poner en vigor «más margen» abre una versión nueva de la época
// del libro: eje.epoca() lleva el margen de 900 s; eje.epocaDe(id) da la de cada registro; eje.versiones(), la lista.
//
//   node ejemplos/gobierno.mjs

import { pathToFileURL } from 'node:url';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { evaluar } from '../src/bqlm.js';
import { ContextoEje } from '../src/contexto-eje.js';
import { EPOCA_0_BTML } from '../src/epocas.js';

/** Calendario inventado: el martes 17 de noviembre de 2026 (UTC). */
export const T0 = '2026-11-17T09:00:00Z';

/** La marca «lo de la base aquí» de una época hija de la 0. */
const M = { ref: EPOCA_0_BTML.id };

/** La raíz de la época hija de prueba: hereda de la 0 y fija en su 7.9 el nivel del cambio corriente (0) y los nombres. */
export const EPOCA_DEL_EJEMPLO = Object.freeze({
  raiz: [['gobierno de ejemplo'], M, M, M, M, M, [['una época hija de prueba de la 0: ana y bea cuentan en el gobierno, y un cambio corriente no pide firmeza'], ['hereda'], [EPOCA_0_BTML.id]], [M, M, M, M, M, M, M, M, M, [M, M, M, [0], M, ['ana', 'bea']]]],
  registros: [],
});

/** Un cambio: una raíz de época hija de la del libro con una sola posición propia (lo demás, la marca). */
const cambio = (eje, titulo, siete) => [[titulo], ...Array.from({ length: 5 }, () => ({ ref: eje.epoca().id })), [['propuesto en el ejemplo'], ['hereda'], [eje.epoca().id]], siete];

/** Construye el libro del ejemplo: { eje, corriente, gobierno, aprobacion, enVigor, leer }. */
export async function ejemploGobierno() {
  let s = 0;
  const t = () => new Date(Date.parse(T0) + (++s) * 60_000).toISOString().replace('.000Z', 'Z');
  const eje = await Eje.genesis({ identidad: 'ana', foco: ['el libro de ana'], t: T0, demostracion: true, epoca: EPOCA_DEL_EJEMPLO });
  const inv = await eje.invitar({ autor: 'ana', invitado: 'bea', t: t() });
  await eje.aceptar(inv, {}, { t: t() });
  const lanza = async (cual, params, yo) => {
    const r = await A.transaccion(eje, cual, params, yo, { t: t() });
    if (!r.ok) throw new Error(cual + ' de ' + yo + ': ' + r.motivos.map((x) => x.mensaje).join('; '));
    return eje.anadir(r.evento);
  };
  const leer = (expr, id) => evaluar(expr, new ContextoEje(eje, { epoch: eje.epoca() }), { sujeto: id }).valor?.[0];

  // Una propuesta corriente: el margen del reloj del libro (7.3.0) pasa de 10 a 15 minutos.
  const corriente = await lanza('propose a change', { X: eje.genesisId, title: 'más margen', explanation: 'el reloj del libro puede ir hasta 15 minutos por delante del de Nostr', change: cambio(eje, 'más margen', [M, M, M, [[900], [7200]]]), class: 'ordinary' }, 'ana');
  await lanza('support a change', { X: corriente.id }, 'ana');
  await lanza('support a change', { X: corriente.id }, 'bea');
  const aprobacion = await lanza('enact a change', { X: corriente.id }, 'bea');
  const enVigor = await lanza('put a change in force', { X: aprobacion.id }, 'ana');
  // Ya en vigor, retirar el apoyo no cambia nada: ana y bea recuperan su P.
  await lanza('withdraw support', { X: corriente.id }, 'ana');
  await lanza('withdraw support', { X: corriente.id }, 'bea');

  // Una propuesta de gobierno: nombrar a cris en 7.9.5 (toca una pieza de gobierno). Solo la apoya ana.
  const gobierno = await lanza('propose a change', { X: eje.genesisId, title: 'nombrar a cris', explanation: 'que cris cuente también en el gobierno del libro', change: cambio(eje, 'nombrar a cris', [M, M, M, M, M, M, M, M, M, [M, M, M, M, M, ['ana', 'bea', 'cris']]]), class: 'governance' }, 'ana');
  await lanza('support a change', { X: gobierno.id }, 'ana');
  return { eje, corriente, gobierno, aprobacion, enVigor, leer };
}

/** Lo que dice el libro de cada propuesta: su clase, su apoyo, lo que le falta, si está aprobada y lo que la decidió. */
export function resumen({ eje, leer }) {
  const propuestas = evaluar('=down (first before.5) where "propose a change" in (payload(it2)).4', new ContextoEje(eje, { epoch: eje.epoca() }), { sujeto: eje.genesisId }).valor.map((x) => x.id ?? x);
  return propuestas.map((id) => ({
    titulo: leer('=first (payload(it)).0', id),
    clase: leer('=first (payload(it)).2', id),
    apoyo: Math.round(leer('=first (first it.2).6', id) * 1000) / 1000,
    falta: Math.round(leer('=first (first it.2).7', id) * 1000) / 1000,
    aprobada: leer('=first (first it.2).8', id),
    estado: leer('=first (payload(first (first it.2).9)).4', id),
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const e = await ejemploGobierno();
  for (const p of resumen(e)) console.log(p.titulo.padEnd(15), p.clase.padEnd(11), 'apoyo', String(p.apoyo).padEnd(6), 'falta', String(p.falta).padEnd(6), p.aprobada ? 'aprobada ' : 'no aprobada', '·', p.estado);
}
