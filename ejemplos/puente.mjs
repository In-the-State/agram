// Ejemplo con datos inventados: el puente entre libros (encargo A15; agram-equipo/DISENO_PUENTE.md; docs/notas/PUENTE.md).
// Dos libros enlazados, padre e hijo:
//   - el grande, de ana, con un elemento «sala»; ana abre allí el libro pequeño («open a private book here», con sus claves
//     de línea);
//   - el pequeño, de bea, que cuelga de la sala («this book hangs from», con las claves de línea del grande).
// Cada libro lo sella su línea: una cabecera de nivel 1 firmada por la clave de su casa y una de nivel 4 firmada por el
// sellador, con un sellador simulado (ejemplos/ikisai/sellos.mjs, como los ejemplos de firmeza: claves inventadas).
// Luego:
//   1. ana escribe «menú» en la sala y emite 5 E atadas a él; bea lo trae al pequeño («bring a record from another book»);
//   2. ana envía 3 E a bea («send to another book»: quedan bloqueadas en el grande con la salida en el enlace); bea trae el
//      envío y lo recibe («receive from another book»): tiene 3 de la serie forastera, atada al menú traído;
//   3. bea devuelve 1 a ana: lo bloquea en el pequeño, ana trae ese envío al grande y lo recibe: se le suelta 1 de lo
//      bloqueado (no se crea nada);
//   4. bea declara su saldo de la serie forastera en el pequeño («declare a balance») y ana lo trae al grande.
// Identidades con clave: cada registro va firmado. Nada real.
//
//   node ejemplos/puente.mjs

import { pathToFileURL } from 'node:url';
import { Eje } from '../src/eje.js';
import * as A from '../src/acciones.js';
import { generarClaves, firmar } from '../src/autoridad.js';
import { selloEnCascada } from './ikisai/sellos.mjs';
import { PLANTILLAS_DEL_PUENTE as P, ENLACES, registroComoDecupla, leerTraido } from '../datos/epocas/puente.mjs';

/** Calendario inventado: el martes 17 de noviembre de 2026 (UTC). */
export const T0 = '2026-11-17T09:00:00Z';

/**
 * Los dos libros enlazados, sin nada del puente todavía: { grande, pequeno, sala, claves, lanza, intenta, sellar, traer, t }.
 * `claves`: ana y bea (sus identidades), casaG y casaP (las claves de línea de nivel 1 de cada libro) y sellador (la de nivel 4,
 * la misma para los dos, como un padre que sella a varios). `sellar(libro, id, opciones)` da la décupla de sello en cascada de un
 * registro de ese libro; `traer(destino, origen, registro, opciones)` lo trae.
 */
export async function dosLibros({ clavesDelGrande = true, clavesDelPequeno = true } = {}) {
  const claves = { ana: await generarClaves(), bea: await generarClaves(), casaG: await generarClaves(), casaP: await generarClaves(), sellador: await generarClaves() };
  let s = 0;
  const t = () => new Date(Date.parse(T0) + (++s) * 60_000).toISOString().replace('.000Z', 'Z');
  const firmarDe = (ev) => firmar(ev, (ev.autor === 'ana' ? claves.ana : claves.bea).privada);
  const grande = await Eje.genesis({ identidad: 'ana', foco: ['el libro grande'], t: T0, clave: claves.ana.publica, privada: claves.ana.privada, emision: [{ token: 'R', cantidad: 10 }] });
  const pequeno = await Eje.genesis({ identidad: 'bea', foco: ['el libro pequeño'], t: T0, clave: claves.bea.publica, privada: claves.bea.privada, emision: [{ token: 'R', cantidad: 10 }] });
  const intenta = (eje, cual, params, yo, opciones = {}) => A.transaccion(eje, cual, params, yo, { t: t(), firmar: firmarDe, ...opciones });
  const lanza = async (eje, cual, params, yo, opciones) => {
    const r = await intenta(eje, cual, params, yo, opciones);
    if (!r.ok) throw new Error(cual + ' de ' + yo + ': ' + r.motivos.map((x) => x.mensaje).join('; '));
    return eje.anadir(r.evento);
  };
  const sala = await lanza(grande, 'anchor here', { X: grande.genesisId, title: 'sala', content: 'la sala del libro grande' }, 'ana');
  const lineas = (casa) => [[1, casa.publica], [4, claves.sellador.publica]];
  const abre = await lanza(grande, ENLACES.abrir, { X: sala.id, book: pequeno.genesisId, 'line keys': clavesDelPequeno ? lineas(claves.casaP) : 0 }, 'ana');
  const cuelga = await lanza(pequeno, ENLACES.cuelga, { X: pequeno.genesisId, book: grande.genesisId, element: sala.id, 'line keys': clavesDelGrande ? lineas(claves.casaG) : 0 }, 'bea');
  // El sello en cascada de un registro de `libro`: su casa (nivel 1) y el sellador (nivel 4), las cabeceras con ese libro.
  const sellar = async (libro, id, { nivel1 = libro === grande ? claves.casaG : claves.casaP, arriba = 4, libroDeCabecera = libro.genesisId, observador = claves.sellador } = {}) => (await selloEnCascada(id, {
    observador, capas: [{ nivel: 1, grado: 0, claves: nivel1, libro: libroDeCabecera }, { nivel: arriba, grado: 2, red: 0, libro: libroDeCabecera }],
  })).decupla;
  const enlaceEn = (destino) => (destino === grande ? abre : cuelga);
  const traerCon = (destino, origen, registro, { proof, record, link, quien = destino === grande ? 'ana' : 'bea' } = {}) => intenta(destino, P.traer, { X: link ?? enlaceEn(destino).id, record: record ?? registroComoDecupla(registro), proof }, quien);
  const traer = async (destino, origen, registro, opciones = {}) => {
    const proof = opciones.proof ?? (await sellar(origen, registro.id));
    const r = await traerCon(destino, origen, registro, { ...opciones, proof });
    if (!r.ok) throw new Error('traer: ' + r.motivos.map((x) => x.mensaje).join('; '));
    return destino.anadir(r.evento);
  };
  return { grande, pequeno, sala, abre, cuelga, claves, lanza, intenta, sellar, traer, traerCon, t };
}

/** Lo que tiene alguien de una serie: disponible y bloqueado. */
export const saldoDe = (eje, quien, serie) => ({ libre: eje.saldo(quien, serie), bloqueado: eje.bloqueado(quien, serie) });

/** Construye el ejemplo entero: los dos libros y cada paso del puente. */
export async function ejemploPuente() {
  const m = await dosLibros();
  const { grande, pequeno, sala, abre, cuelga, claves, lanza, traer } = m;
  // 1. El menú y su E, en el grande; el menú cruza al pequeño.
  const menu = await lanza(grande, 'anchor here', { X: sala.id, title: 'menú', content: 'el menú del sábado' }, 'ana');
  await lanza(grande, 'issue E tied to X', { X: menu.id, denomination: 'plato', quantity: 5 }, 'ana');
  const serie = 'E:ana/plato@' + menu.id;
  const menuTraido = await traer(pequeno, grande, menu);
  // 2. ana envía 3 a bea; bea trae el envío y lo recibe.
  const envio = await lanza(grande, P.enviar, { X: abre.id, series: serie, quantity: 3, to: claves.bea.publica }, 'ana');
  const envioTraido = await traer(pequeno, grande, envio);
  const recibo = await lanza(pequeno, P.recibir, { X: envioTraido.id }, 'bea');
  const forastera = 'E:' + grande.genesisId + ':ana/plato@' + menuTraido.id;
  // 3. bea devuelve 1 a ana.
  const vuelta = await lanza(pequeno, P.enviar, { X: cuelga.id, series: forastera, quantity: 1, to: claves.ana.publica }, 'bea');
  const vueltaTraida = await traer(grande, pequeno, vuelta);
  const reciboDeVuelta = await lanza(grande, P.recibir, { X: vueltaTraida.id }, 'ana');
  // 4. bea declara su saldo de la serie forastera y ana lo trae al grande.
  const saldo = await lanza(pequeno, P.declarar, { X: pequeno.alta('bea').id, series: forastera }, 'bea');
  const saldoTraido = await traer(grande, pequeno, saldo);
  return { ...m, menu, serie, menuTraido, envio, envioTraido, recibo, forastera, vuelta, vueltaTraida, reciboDeVuelta, saldo, saldoTraido };
}

/** Lo que el ejemplo deja, en llano. */
export function resumen(e) {
  return {
    'ana en el grande': saldoDe(e.grande, 'ana', e.serie),
    'bea en el pequeño': saldoDe(e.pequeno, 'bea', e.forastera),
    'el menú, traído': (({ autor, t, firme, origen }) => ({ autor, t, firme, origen }))(leerTraido(e.pequeno, e.menuTraido.id)),
    'el saldo de bea, traído': leerTraido(e.grande, e.saldoTraido.id).payload[1],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const e = await ejemploPuente();
  console.log(JSON.stringify(resumen(e), null, 2));
}
