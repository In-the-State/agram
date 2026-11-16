// Genera la época de la clase `state` (state-0.btml.json y state-0.ids.json) desde su fuente, en esta carpeta:
// state-0.raiz.json, reglas/*.json, plantillas/*.json y textos/{es,en}.json. Mismo molde que la SIP 0 de StateArk
// (stateark/sip/generar.mjs) y que datos/epocas/generar.mjs:
//
// - cada regla y cada plantilla de transacción es su propio registro, y su id es el hash de su cuerpo canónico;
// - la época HEREDA de la época 0 de este repositorio (docs/CONTRATO.md §5 bis): su 6 es [[procedencia…], ["hereda"],
//   [id de la 0]] y cada posición que no fija lleva la marca { ref: <id de la 0> } («lo de la 0 en esta misma
//   dirección»; en la raíz, la hoja "<hereda>"). El id de la 0 sale de EPOCA_0_BTML.id: si la 0 cambia, esta época
//   cambia de id (la prueba test/epoca-state.test.js lo vigila);
// - el 2 son las referencias a las reglas de reglas/ ("<reglas>"); una con el mismo 0 que una de la 0 la sustituye;
// - el 9.6.1 son las referencias a las plantillas de plantillas/ ("<plantillas>"), en el orden de su 8;
// - el 9.4 lleva, detrás de los de la 0, un registro de textos por idioma ("<textos es>", "<textos en>").
//
// Pasa por el analizador del BQL mínimo todas las fórmulas (las de las reglas, las estaciones del 4.3, las validaciones
// de las plantillas de datos del 9.2 y, de cada plantilla de transacción, su 2, su 4, su 5 y la validación y los
// defectos de cada parámetro), por validarPayload la raíz y cada registro, y carga la época resuelta. Sale con 1 si algo
// no pasa.
//
// La época NO viaja con el núcleo (#115): src/ no la importa. Se escribe en el libro del eje del nodo al nacer
// (Eje.genesis({ epoca }) o node be.mjs epoca --publicar datos/epocas/state/state-0.btml.json).
//
// Uso: npm run epoca:state  (o node datos/epocas/state/generar.mjs [--comprobar]: sin escribir, sale con 1 si los
// archivos no están al día).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analizar } from '../../../src/bqlm.js';
import { validarPayload } from '../../../src/btml.js';
import { EPOCA_0_BTML, cargarEpocaEscrita, idDeRegistro } from '../../../src/epocas.js';
import { kebab } from '../generar.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const ARCHIVO = join(AQUI, 'state-0.btml.json');
export const ARCHIVO_IDS = join(AQUI, 'state-0.ids.json');
const HEREDA = '<hereda>';

const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));
const esFormula = (x) => typeof x === 'string' && x.startsWith('=') && !x.startsWith('==');

function registrosDe(carpeta) {
  return readdirSync(join(AQUI, carpeta))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((archivo) => {
      const registro = leer(join(AQUI, carpeta, archivo));
      if (archivo !== kebab(registro[0][0]) + '.json') throw new Error(`${carpeta}/${archivo}: se llama como su 0 en kebab (${kebab(registro[0][0])}.json)`);
      return { archivo, nombre: registro[0][0], registro, id: idDeRegistro(registro) };
    });
}

/** Una plantilla por su 8, [punto de vista, orden], como número para ordenar. */
const llave = (registro) => {
  const [pv, n] = (registro[8] ?? []).map(Number);
  if (!Number.isInteger(pv) || pv < 0 || pv > 9 || !Number.isInteger(n) || n < 1) throw new Error(`plantillas: el 8 de «${registro[0][0]}» es [punto de vista, orden]`);
  return pv * 1000 + n;
};

/**
 * La época de la clase `state`, generada desde su fuente (sin escribir nada): { raiz, registros, id, hereda, reglas,
 * plantillas, informe, fallos }. `fallos` cuenta lo que no pasa (fórmulas que el BQL mínimo no analiza, registros que no
 * son BTML válido, 8 repetidos, una época que no carga).
 */
export function generar() {
  const base = EPOCA_0_BTML.id;
  const informe = [];
  let fallos = 0;
  const falla = (que) => {
    fallos++;
    informe.push('NO: ' + que);
  };

  const reglas = registrosDe('reglas');
  const plantillas = registrosDe('plantillas').sort((a, b) => llave(a.registro) - llave(b.registro));

  // Las reglas: o sustituyen una de la 0 (el mismo 0) o van detrás de una que existe («after <nombre>» en su 8).
  const nombresBase = new Set((EPOCA_0_BTML.reglasConId ?? []).map((x) => x.regla[0][0]));
  for (const r of reglas) {
    const tras = String(r.registro[8]?.[0] ?? '');
    if (!nombresBase.has(r.nombre) && !(tras.startsWith('after ') && (nombresBase.has(tras.slice(6)) || reglas.some((o) => o.nombre === tras.slice(6))))) falla(`la regla «${r.nombre}» ni sustituye una de la 0 ni va detrás de una que existe (su 8: «${tras}»)`);
  }

  // Las plantillas: ningún 8 repetido, ni entre ellas ni con una de la 0 de otro nombre (una del mismo nombre la sustituye).
  const vistos = new Map();
  for (const p of plantillas) {
    const k = llave(p.registro);
    if (vistos.has(k)) falla(`«${p.nombre}» y «${vistos.get(k)}» tienen el mismo 8`);
    vistos.set(k, p.nombre);
  }
  for (const { plantilla: b } of EPOCA_0_BTML.transacciones) {
    const otra = vistos.get(llave(b));
    if (otra && otra !== b[0][0]) falla(`el 8 ${JSON.stringify(b[8])} de «${otra}» es el de «${b[0][0]}» de la época 0`);
  }

  // La raíz: las marcas de herencia, las referencias y los textos.
  const textos = { '<textos es>': leer(join(AQUI, 'textos', 'es.json')), '<textos en>': leer(join(AQUI, 'textos', 'en.json')) };
  const sustituir = (x) => {
    if (x === HEREDA) return { ref: base };
    if (!Array.isArray(x)) return x;
    if (x.length === 1 && x[0] === '<reglas>') return reglas.map((r) => ({ ref: r.id }));
    if (x.length === 1 && x[0] === '<plantillas>') return plantillas.map((p) => ({ ref: p.id }));
    if (x.length === 1 && Object.hasOwn(textos, x[0])) return [...textos[x[0]]];
    return x.map(sustituir);
  };
  const raiz = sustituir(leer(join(AQUI, 'state-0.raiz.json')));
  if (!Array.isArray(raiz[6]) || raiz[6][1]?.[0] !== 'hereda') throw new Error('el 6 de la raíz es [[procedencia…], ["hereda"], [id de la 0]]');
  raiz[6][2] = [base];
  const registros = [...reglas.map((r) => r.registro), ...plantillas.map((p) => p.registro)];
  const id = idDeRegistro(raiz);

  // BTML.
  const btml = (payload, que) => {
    const { ok, errores } = validarPayload(payload);
    if (!ok) falla(`${que}: BTML no válido: ${errores.join('; ')}`);
  };
  btml(raiz, 'la raíz');
  for (const r of reglas) btml(r.registro, `la regla «${r.nombre}»`);
  for (const p of plantillas) btml(p.registro, `la plantilla «${p.nombre}»`);

  // El analizador del BQL mínimo.
  const analiza = (formula, sujeto, que) => {
    try {
      analizar(formula, { sujeto });
    } catch (e) {
      falla(`${que}: ${e.message ?? e}`);
    }
  };
  for (const r of reglas) {
    const lectura = r.registro[4].includes('read');
    analiza(r.registro[2][r.registro[2].length - 1], lectura, `la regla «${r.nombre}»`);
  }
  for (const fila of raiz[4][3]) {
    if (!Array.isArray(fila) || !Array.isArray(fila[0])) continue;
    const f = fila[1][fila[1].length - 1];
    if (esFormula(f)) analiza(f, true, `la estación «${fila[0][0]}»`);
  }
  for (const tipo of raiz[9][2]) {
    if (!Array.isArray(tipo) || !Array.isArray(tipo[0])) continue;
    for (const d of tipo) if (Array.isArray(d) && Array.isArray(d[2]) && esFormula(d[2][0])) analiza(d[2][0], true, `la plantilla de datos «${tipo[0][0][0]}»`);
  }
  for (const p of plantillas) {
    const formulas = [];
    for (const i of [2, 4, 5]) for (const f of p.registro[i]) if (esFormula(f)) formulas.push([String(i), f]);
    for (const par of p.registro[1]) {
      for (const f of par[2]) if (esFormula(f)) formulas.push([`1 «${par[0][0]}» validación`, f]);
      for (const f of par[9]) if (esFormula(f)) formulas.push([`1 «${par[0][0]}» defecto`, f]);
    }
    for (const [donde, f] of formulas) analiza(f, true, `la plantilla «${p.nombre}», ${donde}`);
  }

  // Que cargue: la época escrita, resuelta sobre la 0.
  let cargada = null;
  try {
    cargada = cargarEpocaEscrita({ raiz, registros });
    if (cargada.id !== id) falla('el id de la época cargada no es el de su raíz');
  } catch (e) {
    falla('la época no carga: ' + e.message);
  }

  informe.unshift(
    `época ${raiz[0][1]} · id ${id}`,
    `hereda de la época 0 · ${base}`,
    `${reglas.length} reglas (${reglas.map((r) => r.nombre).join(', ')}) y ${plantillas.length} plantillas de transacción`,
    `registros al publicarla en un eje vacío: el génesis, la raíz y ${registros.length} registros = ${2 + registros.length}`,
    cargada ? `cargada: ${cargada.transacciones.length} plantillas de transacción, ${cargada.reglasConId.length} reglas en el 2` : 'no carga',
  );
  return {
    raiz,
    registros,
    id,
    hereda: base,
    reglas: reglas.map(({ nombre, archivo, id: i }) => ({ nombre, archivo, id: i })),
    plantillas: plantillas.map(({ nombre, archivo, id: i, registro }) => ({ nombre, archivo, id: i, ocho: registro[8] })),
    informe,
    fallos,
  };
}

/** Lo que se escribe: la época escrita ({ id, hereda, raiz, registros }: la forma de be.mjs epoca --publicar) y sus ids. */
export function archivos(g = generar()) {
  return {
    [ARCHIVO]: JSON.stringify({ id: g.id, hereda: g.hereda, raiz: g.raiz, registros: g.registros }, null, 2) + '\n',
    [ARCHIVO_IDS]: JSON.stringify({ epoca: g.id, hereda: g.hereda, registrosAlPublicar: 2 + g.registros.length, reglas: g.reglas, plantillas: g.plantillas }, null, 2) + '\n',
  };
}

/** La época escrita tal como está en state-0.btml.json: { raiz, registros } para Eje.genesis({ epoca }). */
export function epocaState() {
  const { raiz, registros } = leer(ARCHIVO);
  return { raiz, registros };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const g = generar();
  for (const linea of g.informe) console.log(linea);
  const fuera = archivos(g);
  if (process.argv.includes('--comprobar')) {
    const viejos = Object.entries(fuera).filter(([ruta, texto]) => { try { return readFileSync(ruta, 'utf8') !== texto; } catch { return true; } });
    if (viejos.length) console.log('NO al día: ' + viejos.map(([r]) => r).join(', '));
    process.exitCode = g.fallos || viejos.length ? 1 : 0;
  } else if (g.fallos) {
    console.log(`\n${g.fallos} cosas no pasan: no se escribe nada`);
    process.exitCode = 1;
  } else {
    for (const [ruta, texto] of Object.entries(fuera)) writeFileSync(ruta, texto);
    console.log('\nTodo aceptado: escritos state-0.btml.json y state-0.ids.json');
  }
}

