// El ensayo de la aceptación (encargo «retoques 3»): un libro de verdad, el roadmap volcado de una tabla, servido por el
// servidor de retoques como libro compartido bajo /ensayo/… (un solo origen: el túnel enseña un solo nombre). Lo usa
// retoques/servidor.mjs con --ensayo <carpeta> --tabla <ruta> --claves <ruta>, las tres FUERA del repositorio.
//
//   el libro compartido   el contrato de servidor/supabase/funciones/eventos/api.js sobre el almacén de
//                         servidor/prueba/servidor.mjs (almacenEnMemoria), guardado en <carpeta>/compartido.json, sin
//                         abrir otro puerto. Crear ejes solo desde dentro, con un secreto aleatorio de cada arranque.
//   el volcado            con el almacén vacío: un eje nuevo (la cuenta de la dueña, como la crea la carta, con «sync url»
//                         y «sync ledger») y la tabla volcada con ejemplos/volcado/volcar.mjs (las casas como personas
//                         invitadas por la dueña, cada una con su T del día: VG 17-11; correspondencia-roadmap.json) en
//                         pasadas de días seguidos si a alguna casa no le alcanza su T de un día (normalmente basta una),
//                         la última hoy. Un libro ya volcado con las casas como cosas no se migra: se niega con el remedio; luego se carga en el libro
//                         compartido registro a registro con la sincronía de src/sincronia.js (la misma puerta que la
//                         carta). En los arranques siguientes, solo si la tabla cambió (su SHA-256) y solo sus filas
//                         cambiadas: la pantalla manda en las demás.
//   la guía de ensayo     el SEGUNDO libro, de la misma dueña y con su misma clave, con la época hija del libro de la guía:
//                         una guía con tres pasos sobre el roadmap y cuatro zonas en su cara (retoques/guia-ensayo.mjs).
//                         Se crea la primera vez y se sirve en /ensayo/guia/…, con su propio almacén (<carpeta>/guia.json)
//                         y su propia clave de lectura. Después se carga tal cual: nunca se reescribe solo. Si su época no
//                         es la que trae el código, se niega con el remedio (apartar guia.json), nunca se borra.
//   la cuenta de la dueña cuenta(): la copia de sus DOS libros que la carta sabe restaurar (carta/cuentas.js exportarTodos,
//                         una copia por libro) con una frase aleatoria de este arranque. No se guarda en ningún sitio.
//
// En <carpeta> (fuera del repositorio): compartido.json (el almacén), guia.json (el de la guía) y ensayo.json ({ eje,
// claveLectura, tabla, filas, guia: { claveLectura } }: las claves de lectura de los ejes y las huellas de la tabla y de
// cada fila volcada). Las claves, en el archivo de --claves
// (el formato de volcar.mjs); si no existe, se crea con claves nuevas. Nada de esto sale por la consola.

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { almacenEnMemoria } from '../servidor/prueba/servidor.mjs';
import * as criptoNucleo from '../servidor/prueba/cripto-nucleo.mjs';
import { crearApi, hashDeClave, ORIGENES } from '../servidor/supabase/funciones/eventos/api.js';
import { crearArchivos } from '../servidor/supabase/funciones/archivos/api.js';
import { generarClaves, publicaDe } from '../src/autoridad.js';
import { sincronia, salida } from '../src/index.js';
import { volcar, correspondenciaDe, comprobarTabla } from '../ejemplos/volcado/volcar.mjs';
import * as cuentas from '../carta/cuentas.js';
import { preferencias } from '../carta/carta.js';
import { epocaGuiaLibro } from '../datos/epocas/guia-libro/generar.mjs';
import { EJE_GUIA, escribirGuiaDeEnsayo, caraDeLaGuia, idDeLaEpocaDeLaGuia, leerGuiaDeEnsayo } from './guia-ensayo.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
/** El nombre del eje compartido del ensayo. */
export const EJE = 'roadmap';
/** La correspondencia del roadmap (qué columna es cada cosa): la del volcado, al lado de volcar.mjs. */
export const CORRESPONDENCIA = join(AQUI, '..', 'ejemplos', 'volcado', 'correspondencia-roadmap.json');
/** Cuántas pasadas (días seguidos) como mucho en el primer volcado. */
export const TOPE_DE_PASADAS = 10;
/** La identidad de la dueña si el archivo de claves no dice otra (la misma que volcar.mjs). */
export const DUENA = 'duena';
const DIA = 86_400_000;
const BASE_INTERNA = 'http://ensayo.interno/ensayo';

const sha = (x) => createHash('sha256').update(x).digest('hex');
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
/** La huella de una fila: su JSON con las claves en orden (el mismo contenido da la misma huella). */
export const huellaDeFila = (fila) => sha(JSON.stringify(fila, Object.keys(fila ?? {}).sort()));

/**
 * Los instantes de las pasadas del primer volcado, en días seguidos y la última hoy: `pasos` es cuántos registros escribe
 * cada pasada (medido en un libro de prueba), `ms` el ahora. Las de días anteriores empiezan al minuto de su día (UTC,
 * el día civil del T); la de hoy, lo justo antes de ahora para que ningún registro quede con fecha futura (uno por
 * segundo). → [ms de cada pasada]; el génesis va al segundo del primer día. Lanza si la de hoy no cabe (el día acaba de
 * empezar).
 */
export function instantesDePasadas(pasos, ms) {
  const n = Math.max(1, pasos.length);
  const hoy = Math.floor(ms / DIA) * DIA;
  return Array.from({ length: n }, (_, k) => {
    const dia = hoy - (n - 1 - k) * DIA;
    if (k < n - 1) return dia + 60_000;
    const t = Math.floor(ms / 1000) * 1000 - ((pasos[k] ?? 0) + 10) * 1000;
    if (t < dia + 5000) throw new Error('ensayo: el día (UTC) acaba de empezar y la última pasada no cabe hoy: vuelve a arrancar en unos minutos');
    return t;
  });
}

function escribirJson(ruta, datos) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta + '.nuevo', JSON.stringify(datos, null, 1) + '\n', { mode: 0o600 });
  renameSync(ruta + '.nuevo', ruta);
}

/**
 * Las claves del volcado (el formato de volcar.mjs): las del archivo o, si no existe, nuevas; con las de las cosas que
 * pida la tabla y aún no tengan (se añaden al archivo). → { claves, identidad }.
 */
export async function clavesDelEnsayo(ruta, tabla, corr) {
  let claves = existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : null;
  let cambia = !claves;
  claves ??= {};
  if (!claves.duena?.privada) { const k = await generarClaves(); claves.duena = { identidad: claves.duena?.identidad ?? DUENA, privada: k.privada }; cambia = true; }
  claves.duena.identidad ??= DUENA;
  claves.cosas ??= {};
  for (const f of Array.isArray(tabla) ? tabla : []) {
    const bruto = f?.[corr.columnas.cosa];
    if (bruto === undefined || bruto === null || String(bruto).trim() === '') continue;
    const c = String(corr.nombres[bruto] ?? bruto);
    if (c === corr.duena) continue; // la casa de la dueña firma con la clave de la dueña
    if (!claves.cosas[c]?.privada) { claves.cosas[c] = await generarClaves(); cambia = true; }
  }
  if (cambia) escribirJson(ruta, claves);
  for (const [c, k] of Object.entries(claves.cosas)) if (k?.privada && !k.publica) claves.cosas[c] = { ...k, publica: publicaDe(k.privada) };
  return { claves, identidad: claves.duena.identidad };
}

/** El manejador del libro compartido (eventos, recibo de prueba y archivos) sobre un almacén, como servidor/prueba/servidor.mjs. */
function manejadorDe({ almacen, api, archivos }) {
  const responder = (estado, cuerpo) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const recibo = async (request) => {
    if (request.method !== 'GET') return responder(405, { error: 'solo GET' });
    const url = new URL(request.url);
    const fila = await almacen.eje(url.searchParams.get('eje') ?? '');
    const clave = request.headers.get('x-clave-lectura');
    const hash = clave ? await hashDeClave(clave) : null;
    if (!fila || !hash || hash !== fila.clave_lectura_hash) return responder(401, { error: 'clave de lectura ausente o incorrecta' });
    const r = await almacen.recibo(fila.eje, url.searchParams.get('id') ?? '');
    return r ? responder(200, r) : responder(404, { error: 'sin recibo para ese id en ese eje' });
  };
  return (request) => {
    const camino = new URL(request.url).pathname.replace(/\/+$/, '');
    if (camino.endsWith('/eventos/recibo') && request.method !== 'OPTIONS') return recibo(request);
    if (/\/archivos(\/[^/]+)?$/.test(camino)) return archivos(request);
    return api(request);
  };
}

/**
 * Monta el ensayo. `carpeta`, `tabla`, `claves`: rutas (fuera del repositorio; lo comprueba el servidor). `url`: la
 * «sync url» que lleva el libro (la de --publico o la local). `origenes`: los que admite el CORS además de los de siempre.
 * `ahora` (pruebas), `decir` (la línea de cada volcado), `tope` (pasadas). → { manejar(request), cuenta(), alta,
 * identidad, ultimo (el informe del volcado de este arranque, sin texto de filas) }.
 */
export async function montarEnsayo({ carpeta, tabla: rutaTabla, claves: rutaClaves, url, origenes = [], ahora = () => new Date(), decir = console.log, tope = TOPE_DE_PASADAS, iteraciones } = {}) {
  mkdirSync(carpeta, { recursive: true });
  const textoTabla = readFileSync(rutaTabla, 'utf8');
  const tabla = JSON.parse(textoTabla);
  if (!Array.isArray(tabla)) throw new Error('--tabla: ha de ser una lista de filas (JSON)');
  const correspondencia = JSON.parse(readFileSync(CORRESPONDENCIA, 'utf8'));
  const corr = correspondenciaDe(correspondencia);
  const { claves, identidad } = await clavesDelEnsayo(rutaClaves, tabla, corr);
  const privada = claves.duena.privada;
  const publica = publicaDe(privada);

  const almacen = almacenEnMemoria({ archivo: join(carpeta, 'compartido.json'), ahora });
  const secreto = randomBytes(32).toString('hex'); // crear ejes: solo desde dentro, y solo en este arranque
  const archivos = crearArchivos({ almacen, ahora });
  // Dentro (el volcado), sin tope de escrituras por minuto; fuera, el de siempre (60 por minuto y eje) y sin crear ejes.
  const dentro = manejadorDe({ almacen, archivos, api: crearApi({ almacen, cripto: criptoNucleo, crearEjes: { secreto }, escriturasPorMinuto: Number.MAX_SAFE_INTEGER, ahora }) });
  const fuera = manejadorDe({ almacen, archivos, api: crearApi({ almacen, cripto: criptoNucleo, crearEjes: {}, origenes: [...ORIGENES, ...origenes], ahora }) });
  const fetchDentro = async (u, opciones = {}) => dentro(new Request(u, opciones));
  const rutaEstado = join(carpeta, 'ensayo.json');
  const estado = existsSync(rutaEstado) ? JSON.parse(readFileSync(rutaEstado, 'utf8')) : {};
  const guardar = () => escribirJson(rutaEstado, estado);
  const nueva = () => new sincronia.Sincronia({ url: BASE_INTERNA, eje: EJE, claveLectura: estado.claveLectura, fetch: fetchDentro, ahora: () => ahora().getTime() });
  const opcionesVolcado = (t, extra = {}) => ({ duena: identidad, claves, correspondencia, t, ...extra });
  const subir = async (S, eje) => {
    const inf = await S.sincronizar(eje);
    if (inf.errores?.length || inf.pendientes?.length) throw new Error('ensayo: el libro compartido no aceptó todo (' + (inf.errores?.length ?? 0) + ' errores, ' + (inf.pendientes?.length ?? 0) + ' pendientes)');
    return inf;
  };
  const filasDe = (inf) => new Set([...inf.noPuede].map((x) => x.paso?.fila).filter(Boolean).map(String));
  const idDe = (f) => f?.[corr.columnas.id];

  let eje;
  let S;
  let ultimo;
  const yaHay = Boolean(await almacen.eje(EJE)) && !(await almacen.vacio(EJE));
  // Las comprobaciones de la tabla (dependencias y topes del detalle, VG 17-11): si fallan, no se vuelca nada.
  const errores = comprobarTabla(tabla, corr);
  if (!yaHay) {
    if (errores.length) throw new Error('ensayo: la tabla no se vuelca: ' + errores.join('; '));
    if ((await almacen.eje(EJE)) && !estado.claveLectura) throw new Error('ensayo: el almacén tiene el eje sin su clave de lectura: borra compartido.json de la carpeta del ensayo');
    if (!(await almacen.eje(EJE))) {
      const r = await dentro(new Request(BASE_INTERNA + '/ejes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Crear-Ejes': secreto }, body: JSON.stringify({ eje: EJE }) }));
      if (r.status !== 201) throw new Error('ensayo: no se pudo crear el eje compartido (' + r.status + ')');
      estado.eje = EJE;
      estado.claveLectura = (await r.json()).claveLectura;
      estado.tabla = null;
      estado.filas = {};
      guardar();
    }
    // El primer volcado: cuántas pasadas hacen falta, medido en un libro de prueba; luego, de verdad, la última hoy.
    const ms = ahora().getTime();
    const hoy = Math.floor(ms / DIA) * DIA;
    const libroNuevo = async (dia0) => (await cuentas.crearCuenta({ nombre: identidad, identidad, idioma: 'es', ajustes: { 'sync url': url, 'sync ledger': EJE }, t: iso(dia0 + 1000), conClave: { publica, privada } })).eje;
    const prueba = await libroNuevo(hoy - (tope - 1) * DIA);
    const pasos = [];
    for (let k = 0; k < tope; k++) {
      const inf = await volcar(prueba, tabla, opcionesVolcado(iso(hoy - (tope - 1 - k) * DIA + 60_000)));
      if (!inf.escritos.length) break;
      pasos.push(inf.escritos.length + inf.noPuede.length);
    }
    const instantes = instantesDePasadas(pasos, ms);
    const n = instantes.length;
    eje = await libroNuevo(hoy - (n - 1) * DIA);
    const escritos = [];
    const avisos = new Set();
    let inf = null;
    for (const t of instantes) {
      inf = await volcar(eje, tabla, opcionesVolcado(iso(t)));
      escritos.push(...inf.escritos);
      for (const a of inf.avisos) avisos.add(a);
    }
    // Lo que la carta acepta hoy: ningún registro con fecha futura.
    const futuro = eje.orden.filter((id) => Date.parse(eje.obtener(id).t) > ahora().getTime());
    if (futuro.length) throw new Error('ensayo: ' + futuro.length + ' registros quedarían con fecha futura');
    S = nueva();
    await subir(S, eje);
    const pendientes = filasDe(inf);
    estado.filas = Object.fromEntries(tabla.filter((f) => idDe(f) !== undefined && !pendientes.has(String(idDe(f)))).map((f) => [String(idDe(f)), huellaDeFila(f)]));
    estado.tabla = pendientes.size ? null : sha(textoTabla);
    guardar();
    ultimo = { pasadas: n, escritos: escritos.length, avisos: avisos.size + inf.noPuede.length, filas: [...new Set(escritos.map((e) => e.fila).filter(Boolean))] };
    decir('ensayo: volcado en ' + n + (n === 1 ? ' pasada' : ' pasadas') + ': ' + escritos.length + ' registros escritos, ' + ultimo.avisos + ' avisos');
  } else {
    if (!estado.claveLectura) throw new Error('ensayo: falta la clave de lectura del eje en ensayo.json');
    S = nueva();
    const inf = await S.sincronizar(null, { exigirFirmas: false });
    if (!inf.eje) throw new Error('ensayo: no se pudo leer el libro compartido');
    eje = inf.eje;
    if (eje.alta(identidad)?.id !== eje.genesisId) throw new Error('ensayo: el libro compartido no es de la dueña de --claves');
    // Un libro volcado antes con las casas como cosas DE LA DUEÑA no se migra a casas personas (VG 17-11): se niega y
    // dice el remedio (apartarlo y volcar de nuevo). Un alta de cosa de otro con el nombre de una casa no es eso: se
    // salta con un aviso (el volcado no vuelca esas filas).
    if (corr.como === 'personas') {
      const casas = [...new Set(tabla.map((f) => f?.[corr.columnas.cosa]).filter((x) => x !== undefined && x !== null).map((x) => String(corr.nombres[x] ?? x)))].filter((c) => eje.alta(c) && !eje.esPersona(c));
      const deLaDuena = casas.filter((c) => eje.alta(c).autor === identidad);
      if (deLaDuena.length) throw new Error('ensayo: el libro compartido es de la disposición anterior (' + deLaDuena.length + ' casas como cosas de la dueña) y la correspondencia las quiere personas: no se migra; aparta la carpeta del ensayo (compartido.json y ensayo.json) a otro sitio y arranca otra vez para volcar de nuevo');
      for (const c of casas) if (!deLaDuena.includes(c)) decir('ensayo: aviso: «' + c + '» ya tiene alta como cosa de otro; sus filas no se vuelcan');
    }
    // La «sync url» del libro: la de este arranque (local o la de --publico).
    if (sincronia.destino(eje, identidad)?.url !== url.replace(/\/+$/, '')) {
      const p = preferencias(eje, identidad, { 'sync url': url, 'sync ledger': EJE });
      if (p) await salida.escribirDesde(eje, { modo: 'sequenced', autor: identidad, sobre: p.sobre, en: p.en, payload: p.payload, t: iso(Math.floor(ahora().getTime() / 1000) * 1000 - 1000) }, privada);
      await subir(S, eje);
    }
    ultimo = { pasadas: 0, escritos: 0, avisos: 0, filas: [] };
    if (errores.length) decir('ensayo: la tabla no se vuelca (' + errores.length + ' errores): ' + errores.join('; ') + '; el libro sigue como estaba');
    else if (estado.tabla !== sha(textoTabla)) {
      const cambiadas = tabla.map((f) => idDe(f)).filter((id) => id !== undefined && id !== null).map(String)
        .filter((id) => estado.filas?.[id] !== huellaDeFila(tabla.find((f) => String(idDe(f)) === id)));
      // Las filas que dependen de una cambiada: su nota de detalle copia el texto de aquella (VG 17-11).
      if (corr.columnas.depende) for (const f of tabla) if (idDe(f) !== undefined && !cambiadas.includes(String(idDe(f))) && [].concat(f?.[corr.columnas.depende] ?? []).some((d) => cambiadas.includes(String(d)))) cambiadas.push(String(idDe(f)));
      if (cambiadas.length) {
        const sim = await volcar(eje, tabla, opcionesVolcado(iso(ahora().getTime()), { filas: cambiadas, simular: true }));
        const t = Math.floor(ahora().getTime() / 1000) * 1000 - (sim.escritos.length + sim.noPuede.length + 10) * 1000;
        const r = await volcar(eje, tabla, opcionesVolcado(iso(t), { filas: cambiadas }));
        await subir(S, eje);
        const pendientes = filasDe(r);
        for (const id of cambiadas) if (!pendientes.has(id)) estado.filas[id] = huellaDeFila(tabla.find((f) => String(idDe(f)) === id));
        estado.tabla = pendientes.size ? estado.tabla : sha(textoTabla);
        ultimo = { pasadas: 1, escritos: r.escritos.length, avisos: r.avisos.length + r.noPuede.length, filas: [...new Set(r.escritos.map((e) => e.fila).filter(Boolean))] };
        decir('ensayo: volcado de ' + cambiadas.length + ' filas cambiadas: ' + r.escritos.length + ' registros escritos, ' + ultimo.avisos + ' avisos');
      } else estado.tabla = sha(textoTabla);
      guardar();
    }
  }
  // ---- la guía de ensayo: el segundo libro, en su propio almacén y bajo /ensayo/guia/… ----
  const almacenGuia = almacenEnMemoria({ archivo: join(carpeta, 'guia.json'), ahora });
  const archivosGuia = crearArchivos({ almacen: almacenGuia, ahora });
  const dentroGuia = manejadorDe({ almacen: almacenGuia, archivos: archivosGuia, api: crearApi({ almacen: almacenGuia, cripto: criptoNucleo, crearEjes: { secreto }, escriturasPorMinuto: Number.MAX_SAFE_INTEGER, ahora }) });
  const fueraGuia = manejadorDe({ almacen: almacenGuia, archivos: archivosGuia, api: crearApi({ almacen: almacenGuia, cripto: criptoNucleo, crearEjes: {}, origenes: [...ORIGENES, ...origenes], ahora }) });
  const fetchGuia = async (u, opciones = {}) => dentroGuia(new Request(u, opciones));
  const urlGuia = url.replace(/\/+$/, '') + '/guia';
  estado.guia ??= {};
  const nuevaGuia = () => new sincronia.Sincronia({ url: BASE_INTERNA + '/guia', eje: EJE_GUIA, claveLectura: estado.guia.claveLectura, fetch: fetchGuia, ahora: () => ahora().getTime() });
  const apartaLaGuia = 'aparta guia.json de la carpeta del ensayo a otro sitio y arranca otra vez (la guía de ensayo se crea de nuevo; nada se borra)';
  let ejeGuia;
  let SG;
  if (!((await almacenGuia.eje(EJE_GUIA)) && !(await almacenGuia.vacio(EJE_GUIA)))) {
    if ((await almacenGuia.eje(EJE_GUIA)) && !estado.guia.claveLectura) throw new Error('ensayo: el almacén de la guía tiene el eje sin su clave de lectura: ' + apartaLaGuia);
    if (!(await almacenGuia.eje(EJE_GUIA))) {
      const r = await dentroGuia(new Request(BASE_INTERNA + '/guia/ejes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Crear-Ejes': secreto }, body: JSON.stringify({ eje: EJE_GUIA }) }));
      if (r.status !== 201) throw new Error('ensayo: no se pudo crear el eje de la guía (' + r.status + ')');
      estado.guia = { claveLectura: (await r.json()).claveLectura };
      guardar();
    }
    const t0 = Math.floor(ahora().getTime() / 1000) * 1000 - 60_000;
    ejeGuia = (await cuentas.crearCuenta({ nombre: identidad, identidad, idioma: 'es', ajustes: { 'sync url': urlGuia, 'sync ledger': EJE_GUIA }, t: iso(t0), conClave: { publica, privada }, epoca: epocaGuiaLibro() })).eje;
    const g = await escribirGuiaDeEnsayo(ejeGuia, { roadmap: eje, identidad, privada, corr, t0: t0 + 1000 });
    SG = nuevaGuia();
    await subir(SG, ejeGuia);
    decir('ensayo: guía de ensayo creada: ' + g.pasos.length + ' pasos y ' + g.zonas.length + ' zonas');
  } else {
    if (!estado.guia.claveLectura) throw new Error('ensayo: falta la clave de lectura de la guía en ensayo.json: ' + apartaLaGuia);
    SG = nuevaGuia();
    const inf = await SG.sincronizar(null, { exigirFirmas: false });
    if (!inf.eje) throw new Error('ensayo: no se pudo leer la guía de ensayo: ' + apartaLaGuia);
    ejeGuia = inf.eje;
    if (ejeGuia.alta(identidad)?.id !== ejeGuia.genesisId) throw new Error('ensayo: la guía de ensayo no es de la dueña de --claves: ' + apartaLaGuia);
    const suya = ejeGuia.epoca()?.id;
    if (suya !== idDeLaEpocaDeLaGuia()) throw new Error('ensayo: la guía de ensayo es de otra época (' + String(suya).slice(0, 8) + ', y este código trae la ' + idDeLaEpocaDeLaGuia().slice(0, 8) + '): no se reescribe; ' + apartaLaGuia);
    // La «sync url» de la guía, como la del roadmap: la de este arranque (solo esa preferencia; el contenido no se toca).
    if (sincronia.destino(ejeGuia, identidad)?.url !== urlGuia) {
      const p = preferencias(ejeGuia, identidad, { 'sync url': urlGuia, 'sync ledger': EJE_GUIA });
      if (p) await salida.escribirDesde(ejeGuia, { modo: 'sequenced', autor: identidad, sobre: p.sobre, en: p.en, payload: p.payload, t: iso(Math.floor(ahora().getTime() / 1000) * 1000 - 1000) }, privada);
      await subir(SG, ejeGuia);
    }
  }
  // La cara: el html de la guía vive en los archivos del almacén de la guía, que son de memoria: se pone en cada arranque.
  const cara = caraDeLaGuia();
  await almacenGuia.guardar(EJE_GUIA, cara.id, cara.tipo, cara.bytes);

  const alta = eje.alta(identidad).id;
  const altaGuia = ejeGuia.alta(identidad).id;
  const frase = randomBytes(18).toString('base64url');
  return {
    /** /ensayo/guia/… va a la guía de ensayo; todo lo demás de /ensayo/…, al roadmap. */
    manejar: (request) => {
      const camino = new URL(request.url).pathname;
      return camino === '/ensayo/guia' || camino.startsWith('/ensayo/guia/') ? fueraGuia(request) : fuera(request);
    },
    alta,
    altaGuia,
    identidad,
    ultimo,
    /** Lo que se lee de la guía de ensayo ahora: { guia, pasos, zonas } (para comprobarla). */
    guia: () => leerGuiaDeEnsayo(ejeGuia, identidad),
    /**
     * La copia de los DOS libros de la dueña (el roadmap y la guía de ensayo; carta/cuentas.js exportarTodos), con los
     * libros al día, y la frase de este arranque. Nunca se guarda.
     */
    async cuenta() {
      await S.sincronizar(eje);
      await SG.sincronizar(ejeGuia);
      const cuenta = { nombre: identidad, idioma: 'es', identidad, alta, publica };
      const cuentaGuia = { nombre: identidad, idioma: 'es', identidad, alta: altaGuia, publica };
      const copia = await cuentas.exportarTodos([
        { cuenta, eje, privada, claveLectura: estado.claveLectura },
        { cuenta: cuentaGuia, eje: ejeGuia, privada, claveLectura: estado.guia.claveLectura },
      ], frase, iteraciones ? { iteraciones } : {});
      return { copia, frase };
    },
  };
}
