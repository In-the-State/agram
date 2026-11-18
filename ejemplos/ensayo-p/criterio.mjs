// Ejemplo con datos inventados: el criterio de una persona sobre un registro (época de ensayo de P, VG 18-11;
// datos/epocas/ensayo-p/; encargos P-4 y P-5). Es el libro de test/ensayo-p-criterio.test.js llevado a la carta:
//   - ana escribe X («poner un huerto en la azotea») y reparte su P entre dos puntos de vista de X (2 = 0,4 · 5 = 0,6);
//   - bea, cai y dani cuelgan una nota de X y la respaldan con «I back this with my criterion» (lecturas «distance» 0, 1 y 0,6);
//   - erin cuelga su nota y NO la respalda: su P sobre la nota está sin gastar (en el punto de vista 2 se le ofrece la acción);
//   - ana pone una decisión D sobre X que cuenta con la plantilla «distance from the author» (2,64 de apoyo y 1,76 de crítica).
// El libro nace con la época de ensayo, cargada de su copia importable (el navegador no lee JSON ni los módulos de Node).
// Nada de esto es real.

import { Eje } from '../../src/eje.js';
import * as A from '../../src/acciones.js';
import { firmar } from '../../src/autoridad.js';
import { EPOCA_DE_ENSAYO_P_DATOS } from '../../datos/epocas/ensayo-p/ensayo-p-0.js';
import { entrarPorInvitacion } from '../ikisai/altas.mjs';
import { pagaElCoste, escribirPagando } from '../ikisai/coste.mjs';

export const T = '2026-11-18T10:00:00Z';
export const GENTE = Object.freeze(['bea', 'cai', 'dani', 'erin']);
export const APOYA = 'I back this with my criterion';

/** Un reparto de diez cantidades desde {punto de vista: cantidad}. */
const reparto = (o) => Array.from({ length: 10 }, (_, d) => o[d] ?? 0);
/** Lo que sale de la P de cada nota (lo que llega al punto de vista es 1,1 veces más). erin no reparte: no se usa. */
export const REPARTOS = Object.freeze({
  bea: Object.freeze(reparto({ 2: 0.8, 5: 1.2 })),
  cai: Object.freeze(reparto({ 7: 1 })),
  dani: Object.freeze(reparto({ 2: 0.5, 7: 0.5 })),
});

export const TEXTOS = Object.freeze({
  X: 'poner un huerto en la azotea',
  D: '¿Ponemos el huerto en la azotea?',
  notas: Object.freeze({
    bea: 'me parece bien: la azotea tiene sol todo el día',
    cai: 'prefiero el patio; en la azotea no cabe casi nada',
    dani: 'bien, pero con un toldo y un grifo cerca',
    erin: 'tengo dudas: quién lo regaría en verano',
  }),
});

/**
 * Construye el eje. `claves` ({ ana, bea, cai, dani, erin }: { publica, privada }) son las de quienes firman (opcionales).
 * Devuelve { eje, foco, ids } con ids = { X, D, notas: { bea, cai, dani, erin } }; el foco es X.
 */
export async function ejemploCriterio({ claves = {} } = {}) {
  const priv = (id) => claves[id]?.privada;
  const firmarCon = (id) => (priv(id) ? (ev) => firmar(ev, priv(id)) : undefined);
  const eje = await Eje.genesis({
    demostracion: true,
    identidad: 'ana',
    foco: 'huerto de la azotea',
    t: T,
    clave: claves.ana?.publica,
    privada: priv('ana'),
    epoca: EPOCA_DE_ENSAYO_P_DATOS,
  });
  for (const q of GENTE) await entrarPorInvitacion(eje, { por: 'ana', quien: q, t: T, grupo: 3, clave: claves[q], privadaDe: priv });

  const escribir = (autor, sobre, payload) => escribirPagando(eje, { autor, sobre, t: T, payload, movimientos: [pagaElCoste(autor)] }, priv(autor));
  const X = await escribir('ana', eje.genesisId, TEXTOS.X);

  // ana reparte su P entre dos puntos de vista de X: quema y acuña una décima más (bajar un paso).
  const baja = (registro, quemado, d, acunado) => escribirPagando(eje, {
    autor: 'ana', sobre: registro.id, t: T, payload: 'paso',
    movimientos: [pagaElCoste('ana'), { token: 'P', ambito: registro.id, cantidad: quemado, de: 'ana', a: null }, { token: 'P', ambito: registro.id + '.' + d, cantidad: acunado, de: null, a: 'ana' }],
  }, priv('ana'));
  await baja(X, 0.4, 2, 0.44);
  await baja(X, 0.6, 5, 0.66);

  const notas = {};
  for (const q of GENTE) {
    notas[q] = await escribir(q, X.id, TEXTOS.notas[q]);
    if (q === 'erin') continue; // erin no respalda su nota: su P queda sin gastar
    const r = await A.transaccion(eje, APOYA, { X: notas[q].id, split: [...REPARTOS[q]] }, q, { t: T, firmar: firmarCon(q) });
    if (!r.ok) throw new Error(APOYA + ' (' + q + '): ' + r.motivos.map((m) => m.mensaje).join('; '));
    await eje.anadir(r.evento);
  }

  // La decisión D sobre X: decidir, umbral 1, con la plantilla de recuento «distance from the author», votan las cuatro.
  const criterio = [['decidir'], [1], ['distance from the author'], [...GENTE]];
  const D = await escribir('ana', X.id, [TEXTOS.D, ['x'], criterio]);

  return { eje, foco: X.id, ids: { X: X.id, D: D.id, notas: Object.fromEntries(Object.entries(notas).map(([q, n]) => [q, n.id])) } };
}
