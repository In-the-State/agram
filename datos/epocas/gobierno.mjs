// El gobierno del cambio de reglas en la época 0 (encargo A21, tramo 2, paso 1; agram-equipo/DISENO_GOBIERNO_Y_MOTOR.md
// §3 y §4; docs/notas/GOBIERNO.md). De aquí sale la fórmula larga de la regla «a change comes into force with its proof»
// (reglas/a-change-comes-into-force-with-its-proof.json), como sealed.json sale de sello.formulaDeSellado(): una prueba
// (test/gobierno.test.js) comprueba que el archivo lleva exactamente formulaDePonerEnVigor(). Si cambia la forma del sello
// (src/sello.js, POSICIONES_DEL_SELLO) o esta fórmula, se reescribe con
//
//   node datos/epocas/gobierno.mjs --escribir    (y luego npm run epocas)
//
// Las demás reglas, lecturas y plantillas del gobierno son JSON escritos a mano, como todas las de la época.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formulaDeSelloDelDato } from '../../src/sello.js';
import { formatear } from './generar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Los nombres de las seis plantillas del gobierno (lo que dice el 4 de cada registro que escriben). */
export const PLANTILLAS_DE_GOBIERNO = Object.freeze({
  proponer: 'propose a change',
  apoyar: 'support a change',
  retirarApoyo: 'withdraw support',
  aprobar: 'enact a change',
  poner: 'put a change in force',
  retirar: 'withdraw a change',
});

/** El ancla de las propuestas en el génesis del libro: su 9.7, «changes». */
export const ANCLA_DE_PROPUESTAS = '9700000000';

/** Dónde trae «put a change in force» la décupla de sello del «enact a change»: su payload 1.1. */
export const SELLO_EN_EL_PAYLOAD = '(first (payload(ev)).1.1)';

/** La propuesta de la que cuelga el «enact a change» sobre el que se escribe la candidata (el foco de su foco). */
const PROPUESTA = '(first (first (first ev.6.5).6).5)';
/** La clase que declara esa propuesta (su 2). */
const CLASE = 'first (payload(' + PROPUESTA + ')).2';

/**
 * El nivel que pide la clase de la propuesta (epoch.7.9.3 si es «ordinary», epoch.7.9.4 si es «governance»), como una
 * expresión BQL; con otra clase, 0 (la regla exige además que sea una de las dos).
 */
export const NIVEL_PEDIDO = '(count (epoch where ' + CLASE + ' = "governance") * first epoch.7.9.4 + count (epoch where ' + CLASE + ' = "ordinary") * first epoch.7.9.3)';

/**
 * La fórmula del 2 de «a change comes into force with its proof»: un registro que dice «put a change in force» en su 4
 * solo vale anclado en un «enact a change» que aún no está en vigor, de una propuesta de clase «ordinary» o «governance»,
 * y, si el nivel que pide su clase no es 0, con la prueba de sello del «enact a change» en su payload 1.1 que lo cubre
 * (sello.formulaDeSelloDelDato: «sealed» entero, o la cadena de «firm» hasta ese nivel con la clave de la cabecera
 * declarada en before.8.9 o before.8.6).
 */
export function formulaDePonerEnVigor() {
  const P = PLANTILLAS_DE_GOBIERNO;
  const prueba = formulaDeSelloDelDato({ sello: SELLO_EN_EL_PAYLOAD, hoja: 'ev.6.5', nivel: NIVEL_PEDIDO });
  return '=not ("' + P.poner + '" in ev.4) or "' + P.aprobar + '" in (payload(first ev.6.5)).4'
    + ' and count (down (first ev.6.5) where "' + P.poner + '" in (payload(it)).4) = 0'
    + ' and (' + CLASE + ' = "ordinary" or ' + CLASE + ' = "governance")'
    + ' and (' + NIVEL_PEDIDO + ' = 0 or ' + prueba + ')';
}

/** El archivo de la regla. */
export const ARCHIVO_DE_LA_REGLA = join(AQUI, 'reglas', 'a-change-comes-into-force-with-its-proof.json');

// node datos/epocas/gobierno.mjs --escribir: pone la fórmula en el 2 de la regla (el resto del archivo no cambia).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--escribir')) {
  const regla = JSON.parse(readFileSync(ARCHIVO_DE_LA_REGLA, 'utf8'));
  regla[2] = [formulaDePonerEnVigor()];
  writeFileSync(ARCHIVO_DE_LA_REGLA + '.nuevo', formatear(regla) + '\n');
  const { renameSync } = await import('node:fs');
  renameSync(ARCHIVO_DE_LA_REGLA + '.nuevo', ARCHIVO_DE_LA_REGLA);
  console.log('escrita la fórmula de ' + ARCHIVO_DE_LA_REGLA);
}
