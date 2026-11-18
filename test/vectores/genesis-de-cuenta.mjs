// Los vectores del génesis de cuenta por la app, para Core StateArk (Carril F, 18-11; agram-equipo/LIBRO_DE_CUENTA_ALOJADO.md
// §6 y §9, stateark/RESPUESTA_LIBRO_DE_CUENTA.md §4): el canónico EXACTO que la carta propone a la app al crear la cuenta
// emparejada, su id y el id de la época de cuenta que nombra. Dos casos: con `eje` y `next` (el permiso de «emparejada»
// vivo: la carta pidió las claves) y sin ellos (una app que no da permiso, o caducado).
//
// Se genera por el mismo camino que la carta (carta/cuentas.js crearCuenta con un guardián): un guardián de prueba que da
// la pública de una privada INVENTADA, guarda lo que se le propone y firma con ella. Todas las entradas son inventadas y
// fijas; nada es real. Solo se escribe el génesis (sin idioma, ajustes ni página inicial, que van detrás como registros
// corrientes). Uso: node test/vectores/genesis-de-cuenta.mjs (escribe genesis-de-cuenta.json a su lado);
// test/epoca-cuenta.test.js comprueba que el archivo está al día.

import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { schnorr } from '../../src/vendor/noble-secp256k1.js';
import { publicaDe } from '../../src/autoridad.js';
import { ID_EPOCA_DE_CUENTA } from '../../src/epoca-cuenta.js';
import * as Q from '../../carta/cuentas.js';

export const ARCHIVO = fileURLToPath(new URL('./genesis-de-cuenta.json', import.meta.url));

/** Las entradas: inventadas y fijas. */
export const ENTRADAS = Object.freeze({
  privada: '0c'.repeat(32), // de PRUEBA: la de la cuenta, que en la vida real nunca sale de la app
  nombre: 'Ana Inventada',
  t: '2026-11-18T10:00:00Z',
  eje: 'e1'.repeat(32),
  next: 'f2'.repeat(32),
});

const bytes = (h) => Uint8Array.from(h.match(/.{2}/g), (x) => parseInt(x, 16));
const hexDe = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

/** El génesis propuesto en un caso: { canonico, id } tal como le llegan al guardián. */
async function propuesto({ conClaves }) {
  const publica = publicaDe(ENTRADAS.privada);
  const vistos = [];
  const guardian = {
    crearCuenta: async () => ({ publica }),
    firmar: async ({ canonico, id }) => {
      vistos.push({ canonico, id });
      return { id, firma: hexDe(schnorr.sign(bytes(id), bytes(ENTRADAS.privada), new Uint8Array(32))) };
    },
  };
  const r = await Q.crearCuenta({
    nombre: ENTRADAS.nombre, t: ENTRADAS.t, guardian,
    epoca: { base: ID_EPOCA_DE_CUENTA, cambios: [] },
    ...(conClaves ? { contexto: { eje: ENTRADAS.eje, next: ENTRADAS.next } } : {}),
  });
  if (vistos.length !== 1 || vistos[0].id !== r.eje.genesisId) throw new Error('se esperaba una sola propuesta: el génesis');
  return { publica, identidad: r.cuenta.identidad, ...vistos[0] };
}

/** Los vectores: { entradas, epoca, casos: [{ caso, contexto, publica, identidad, canonico, id }] }. */
export async function vectores() {
  if (!ID_EPOCA_DE_CUENTA) throw new Error('la época de cuenta no carga: npm run epoca:cuenta');
  const casos = [];
  for (const conClaves of [true, false]) {
    const p = await propuesto({ conClaves });
    casos.push({ caso: conClaves ? 'con eje y next (permiso vivo)' : 'sin eje ni next (sin permiso)', contexto: conClaves ? { eje: ENTRADAS.eje, next: ENTRADAS.next } : {}, ...p });
  }
  return { nota: 'Vectores INVENTADOS del génesis de cuenta por la app (Carril F, 18-11). Generados por test/vectores/genesis-de-cuenta.mjs; nada es real.', entradas: { ...ENTRADAS }, epoca: ID_EPOCA_DE_CUENTA, casos };
}

/** El texto del archivo. */
export const texto = async () => JSON.stringify(await vectores(), null, 2) + '\n';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) writeFileSync(ARCHIVO, await texto());
