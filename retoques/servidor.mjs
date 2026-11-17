// El servidor local de retoques: sirve la carta con recarga automática, recibe las opiniones y pasa lo que VG escribe
// en el PV9 («Core») a un agente de Claude Code sin terminal dedicado a la carta (retoques/agente.mjs). Node sin
// dependencias. Cómo se usa y lo comprobado: retoques/LEEME.md.
//
//   node retoques/servidor.mjs [--puerto 8790] [--rama <rama de retoques>] [--modelo <modelo>] [--publico <host>]
//                              [--clave-api <ruta>] [--ensayo <carpeta> --tabla <ruta> --claves <ruta>]
//
// --ensayo (con --tabla y --claves, las tres FUERA del repositorio): el libro del roadmap volcado de la tabla, servido como
// libro compartido bajo /ensayo/… y la cuenta de la dueña en GET /retoques/ensayo/cuenta (retoques/ensayo.mjs).
//
// --clave-api: un archivo FUERA del repositorio con la clave de API de VG (su primera línea, o el campo `anthropic_api_key`
// si es el JSON de secretos que ya la guarda: así no se duplica); Core gasta de ella y no de la
// cuenta de Claude Code de este equipo (retoques/agente.mjs). Dentro de la raíz servida, el servidor no arranca.
//
// Seguridad (cualquier página abierta en el mismo navegador puede llamar a localhost):
//   · escucha SOLO en 127.0.0.1; sin caché; sin atravesar carpetas; lo que la beta no publica, aquí tampoco se sirve;
//   · una llave aleatoria (32 bytes) por arranque, que solo se escribe en la consola (en el fragmento de la dirección):
//     todo lo que no sea servir archivos la pide en la cabecera x-retoques-llave, comparada en tiempo constante;
//   · Host (localhost:<puerto>, 127.0.0.1:<puerto> o el de --publico) y, si viene, Origin (el mismo); cuerpo pequeño y
//     un límite de llamadas por minuto;
//   · con --publico (detrás de un túnel con HTTPS), lo que llega con ese Host no recibe nada sin la llave, ni los
//     archivos: solo una página mínima para pegarla. Al acertar, una cookie de sesión propia (HttpOnly, Secure,
//     SameSite=Strict; no es la llave) y desde ahí se sirve como en local; las llamadas siguen pidiendo la cabecera.
//     Intentos por minuto limitados y, tras varios fallos seguidos, una espera creciente.

import http from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, watch } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Agente, leerClave } from './agente.mjs';
import { montarEnsayo } from './ensayo.mjs';
import { resumenDelFondo, conMensaje, entradasDe, leerTexto, leerSesiones, guardarSesiones, sesionesSinCrecer } from './fondo.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const RAIZ = resolve(AQUI, '..');
/** Lo que la beta no publica (beta/publicar.mjs, EXCLUIR) y además esta carpeta; y todo lo que empiece por punto. */
export const EXCLUIR = new Set(['.git', 'node_modules', 'test', 'bench', '.github', 'servidor', 'beta', '.playwright-mcp', '.wrangler', 'retoques']);
export const CABECERA_LLAVE = 'x-retoques-llave';
export const COOKIE = 'retoques_sesion';
export const RAMAS_PROHIBIDAS = new Set(['beta', 'main', 'master']);
export const LIMITES = Object.freeze({
  cuerpo: 64 * 1024, // bytes de un cuerpo
  llamadasPorMinuto: 120, // las de /retoques/…
  entrarPorMinuto: 10, // intentos de llave en la cara pública
  fallosSinEspera: 3, // fallos seguidos antes de esperar
  esperaMaxima: 60_000, // ms
  sesion: 12 * 3600_000, // ms de una cookie de sesión
  latido: 20_000, // ms entre latidos del canal de avisos
  ensayoPorMinuto: 600, // llamadas a /ensayo/… por minuto: una carta nueva baja unos cientos de registros y pide su recibo uno a uno
  ensayoCuerpo: 256 * 1024, // bytes de un cuerpo en /ensayo/… (el tope del contrato del libro compartido)
});
const ETIQUETA = '<script src="./retoques/cliente.js"></script>';

/** El service worker que se da de baja (el mismo que publica la beta): sw.js en disco no se toca. */
export const SW_BAJA = `// Service worker de los retoques: se da de baja y borra las cachés de la carta, para que cada recarga vaya a la red.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
`;

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.lottie': 'application/zip', '.wasm': 'application/wasm',
};

// ---------- piezas puras (se prueban sin red) ----------

/**
 * Los segmentos de una ruta pedida, o null si intenta salirse: «..» o «.», barra invertida, codificaciones de punto,
 * barra o barra invertida, NUL, dos puntos (unidades y flujos de Windows) y segmentos que acaban en punto o espacio
 * (Windows los quita).
 */
export function segmentosDe(cruda) {
  const solo = String(cruda ?? '').split('?')[0].split('#')[0];
  if (!solo.startsWith('/') || solo.includes('\\') || solo.includes('\0') || /%(2e|2f|5c|00)/i.test(solo)) return null;
  let dec;
  try { dec = decodeURIComponent(solo); } catch { return null; }
  if (dec.includes('\\') || dec.includes('\0')) return null;
  const seg = dec.split('/').filter(Boolean);
  if (seg.some((s) => s === '.' || s === '..' || s.includes(':') || /[. ]$/.test(s))) return null;
  return seg;
}

/** ¿Está fuera de lo que se sirve? El primer segmento en EXCLUIR (sin mirar mayúsculas) o cualquiera que empiece por punto. */
export const excluido = (seg) => seg.length > 0 && (EXCLUIR.has(seg[0].toLowerCase()) || seg.some((s) => s.startsWith('.')));

/** index.html con el guion del cliente de retoques justo antes de </head> (el archivo en disco no cambia). */
export const inyectar = (html) => (html.includes('</head>') ? html.replace('</head>', ETIQUETA + '\n</head>') : ETIQUETA + '\n' + html);

/** El aviso de unos archivos cambiados: solo CSS se aplica sin recargar; cualquier otro, recarga. */
export const avisoDe = (rutas) => ({ tipo: rutas.length && rutas.every((r) => r.toLowerCase().endsWith('.css')) ? 'css' : 'recargar', rutas });

/** ¿Está `ruta` dentro de `raiz` (o es ella)? Sin mirar mayúsculas en Windows. */
export function dentroDe(raiz, ruta) {
  const norm = (x) => (process.platform === 'win32' ? x.toLowerCase() : x);
  const rel = relative(norm(resolve(raiz)), norm(resolve(ruta)));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const resumen = (s) => createHash('sha256').update(String(s)).digest();
/** Comparación en tiempo constante (por el resumen: misma longitud siempre). */
export const igual = (a, b) => typeof a === 'string' && typeof b === 'string' && timingSafeEqual(resumen(a), resumen(b));

// ---------- el servidor ----------

function git(raiz, args) {
  const r = spawnSync('git', args, { cwd: raiz, encoding: 'utf8', windowsHide: true });
  return { ok: r.status === 0, salida: (r.stdout ?? '').trim(), error: (r.stderr ?? '').trim() || String(r.error?.message ?? '') };
}

const PAGINA_LLAVE = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AGRAM · retoques</title>
<style>body{font:16px/1.4 system-ui,sans-serif;margin:24px auto;max-width:28rem;padding:0 16px;background:#faf7f1;color:#2b2620}input{width:100%;font:inherit;padding:8px;box-sizing:border-box}button{font:inherit;margin-top:8px;padding:6px 14px}</style>
</head><body>
<h1 style="font-size:18px">AGRAM · retoques</h1>
<form id="f"><label for="l">Pega la llave de retoques</label><input id="l" autocomplete="off" spellcheck="false" autocapitalize="off"><button>entrar</button><p id="m" role="status"></p></form>
<script>
const f = document.getElementById('f'), l = document.getElementById('l'), m = document.getElementById('m');
async function entrar(v) {
  let r;
  try { r = await fetch('/retoques/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ llave: v }), credentials: 'same-origin', cache: 'no-store' }); }
  catch { m.textContent = 'sin conexión con el servidor de retoques'; return; }
  if (r.status === 204) { try { sessionStorage.setItem('agram.retoques.llave', v); } catch {} location.replace('/'); return; }
  m.textContent = r.status === 429 ? 'demasiados intentos: espera un poco' : 'esa llave no vale';
}
f.addEventListener('submit', (e) => { e.preventDefault(); entrar(l.value.trim()); });
const h = /llave=([0-9a-f]{64})/.exec(location.hash);
if (h) { history.replaceState(null, '', location.pathname); l.value = h[1]; entrar(h[1]); }
</script>
</body></html>
`;

/**
 * Crea el servidor. `raiz`: lo que se sirve y donde se trabaja (la raíz del worktree); `puerto` (0: uno libre);
 * `rama`: la de retoques (la única en que «guardar» hace commit); `modelo`; `publico`: el host del túnel; `agente`: uno
 * ya hecho (si no, new Agente); `orden`: el ejecutable del agente (pruebas); `llave` (pruebas; si no, aleatoria).
 * → { escuchar(): Promise<puerto>, cerrar(): Promise, llave, agente, servidor, puerto() }.
 */
export function crearServidor({ raiz = RAIZ, puerto = 8790, rama = null, modelo = null, publico = null, agente = null, orden = null, llave = null, vigilar = true, claveApi = null, ensayo = null, decir = console.log } = {}) {
  raiz = resolve(raiz);
  const raizReal = realpathSync.native(raiz);
  if (claveApi) {
    claveApi = resolve(String(claveApi));
    if (dentroDe(raiz, claveApi) || dentroDe(raizReal, claveApi) || (existsSync(claveApi) && dentroDe(raizReal, realpathSync.native(claveApi)))) {
      throw new Error('--clave-api: el archivo de la clave tiene que estar FUERA del repositorio (' + raiz + ')');
    }
  }
  if (rama && RAMAS_PROHIBIDAS.has(rama)) throw new Error('--rama no puede ser ' + rama + ': los retoques se guardan en su propia rama');
  const host = publico ? String(publico).toLowerCase().trim() : null;
  if (host && !/^[a-z0-9.-]+$/.test(host)) throw new Error('--publico: un nombre de host sin puerto ni esquema');
  const LLAVE = llave ?? randomBytes(32).toString('hex');
  const datos = join(raiz, 'retoques', '.datos');
  // El ensayo: la carpeta, la tabla y las claves, fuera del repositorio (el contenido es real y vive solo en este equipo).
  if (ensayo) {
    for (const [opcion, ruta] of [['--ensayo', ensayo.carpeta], ['--tabla', ensayo.tabla], ['--claves', ensayo.claves]]) {
      if (!ruta) throw new Error(opcion + ': falta (--ensayo va con --tabla y --claves)');
      const abs = resolve(String(ruta));
      if (dentroDe(raiz, abs) || dentroDe(raizReal, abs) || (existsSync(abs) && dentroDe(raizReal, realpathSync.native(abs)))) throw new Error(opcion + ': tiene que estar FUERA del repositorio (' + raiz + ')');
    }
    ensayo = { carpeta: resolve(String(ensayo.carpeta)), tabla: resolve(String(ensayo.tabla)), claves: resolve(String(ensayo.claves)) };
  }
  let elEnsayo = null; // el montado (retoques/ensayo.mjs), al escuchar
  const llamadasEnsayo = [];
  const core = agente ?? new Agente({ raiz, datos, modelo, orden, claveApi });
  // El fondo y las sesiones (retoques/fondo.mjs): esta sesión empieza con lo que hay ahora en la lista.
  const rutaFondo = join(datos, 'fondo.md');
  const rutaSesiones = join(datos, 'sesiones.json');
  const totalDelFondo = () => entradasDe(leerTexto(rutaFondo)).length;
  const sesion = { inicio: new Date().toISOString(), fondoAlEmpezar: totalDelFondo() };
  const apuntarMensaje = () => {
    try { guardarSesiones(rutaSesiones, conMensaje(leerSesiones(rutaSesiones), { ...sesion, fondoAhora: totalDelFondo() })); } catch (e) { console.error('retoques: no se guardan las sesiones:', e?.message ?? e); }
  };
  const sesiones = new Map(); // resumen hex de la cookie → caduca (ms)
  const llamadas = []; // instantes de las llamadas del último minuto
  const entrar = { intentos: [], fallos: 0, hasta: 0 };
  const avisos = new Set(); // respuestas abiertas del canal de avisos
  const retenidos = new Set(); // cambios vistos mientras Core trabaja: se avisan al acabar
  let pendientes = new Set();
  let temporizador = null;
  let vigia = null;
  let puertoReal = puerto;

  // ---- avisos de cambios ----
  const emitir = (aviso) => {
    const linea = 'data: ' + JSON.stringify(aviso) + '\n\n';
    for (const r of avisos) { try { r.write(linea); } catch { /* cerrada */ } }
  };
  const soltar = () => {
    const rutas = [...pendientes];
    pendientes = new Set();
    if (!rutas.length) return;
    if (core.ocupado) { for (const r of rutas) retenidos.add(r); return; }
    emitir(avisoDe(rutas));
  };
  const soltarRetenidos = () => {
    for (const r of retenidos) pendientes.add(r);
    retenidos.clear();
    clearTimeout(temporizador);
    temporizador = setTimeout(soltar, 150);
  };
  const cambio = (nombre) => {
    if (!nombre) return;
    const rel = String(nombre).split(sep).join('/');
    const seg = rel.split('/').filter(Boolean);
    if (!seg.length || excluido(seg)) return;
    pendientes.add(rel);
    clearTimeout(temporizador);
    temporizador = setTimeout(soltar, 150);
  };

  // ---- comprobaciones ----
  /** 'local', 'publica' o null (Host u Origin ajenos). */
  const caraDe = (req) => {
    const h = String(req.headers.host ?? '').toLowerCase();
    const cara = h === 'localhost:' + puertoReal || h === '127.0.0.1:' + puertoReal ? 'local' : host && h === host ? 'publica' : null;
    if (!cara) return null;
    const origen = req.headers.origin;
    if (origen === undefined) return cara;
    const validos = cara === 'local' ? ['http://localhost:' + puertoReal, 'http://127.0.0.1:' + puertoReal] : ['https://' + host];
    return validos.includes(String(origen).toLowerCase()) ? cara : null;
  };
  const conSesion = (req) => {
    const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([0-9a-f]{64})(?:;|$)').exec(String(req.headers.cookie ?? ''));
    if (!m) return false;
    const k = resumen(m[1]).toString('hex');
    const caduca = sesiones.get(k);
    if (!caduca) return false;
    if (caduca < Date.now()) { sesiones.delete(k); return false; }
    return true;
  };
  const dentroDelLimite = () => {
    const ahora = Date.now();
    while (llamadas.length && llamadas[0] < ahora - 60_000) llamadas.shift();
    if (llamadas.length >= LIMITES.llamadasPorMinuto) return false;
    llamadas.push(ahora);
    return true;
  };

  // ---- respuestas ----
  const cabecerasBase = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  const vacia = (res, estado, extra = {}) => { res.writeHead(estado, { ...cabecerasBase, ...extra }); res.end(); };
  const json = (res, estado, datos) => { res.writeHead(estado, { ...cabecerasBase, 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(datos)); };

  const leerCuerpo = (req) => new Promise((ok) => {
    if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) { req.resume(); ok({ estado: 415 }); return; }
    if (Number(req.headers['content-length'] ?? 0) > LIMITES.cuerpo) { req.resume(); ok({ estado: 413 }); return; }
    const trozos = [];
    let total = 0;
    let fuera = false;
    req.on('data', (d) => {
      if (fuera) return;
      total += d.length;
      if (total > LIMITES.cuerpo) { fuera = true; ok({ estado: 413 }); return; }
      trozos.push(d);
    });
    req.on('end', () => {
      if (fuera) return;
      try {
        const v = JSON.parse(Buffer.concat(trozos).toString('utf8') || 'null');
        ok(v && typeof v === 'object' && !Array.isArray(v) ? { datos: v } : { estado: 400 });
      } catch { ok({ estado: 400 }); }
    });
    req.on('error', () => { if (!fuera) { fuera = true; ok({ estado: 400 }); } });
  });

  // ---- archivos ----
  const servirArchivo = (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return vacia(res, 405);
    const seg = segmentosDe(req.url);
    if (!seg) return vacia(res, 400);
    if (seg.length === 1 && seg[0] === 'sitio.json' && !existsSync(join(raiz, 'sitio.json')) && existsSync(join(datos, 'sitio.json'))) {
      // Las cuentas nuevas del ensayo, apuntadas a su puerta sin tocar el repositorio (lo único de .datos que se sirve).
      let cuerpo;
      try { cuerpo = readFileSync(join(datos, 'sitio.json')); } catch { return vacia(res, 404); }
      res.writeHead(200, { ...cabecerasBase, 'content-type': TIPOS['.json'] });
      return res.end(req.method === 'HEAD' ? undefined : cuerpo);
    }
    if (seg.length === 1 && seg[0] === 'sw.js') {
      res.writeHead(200, { ...cabecerasBase, 'content-type': TIPOS['.js'] });
      return res.end(req.method === 'HEAD' ? undefined : SW_BAJA);
    }
    const pedido = seg.length ? seg : ['index.html'];
    if (excluido(pedido)) return vacia(res, 404);
    let real;
    try {
      real = realpathSync.native(join(raiz, ...pedido));
      if (!statSync(real).isFile()) return vacia(res, 404);
    } catch { return vacia(res, 404); }
    // Lo resuelto de verdad (enlaces, nombres cortos, mayúsculas) tiene que seguir dentro y fuera de lo excluido.
    const rel = relative(raizReal, real);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || excluido(rel.split(sep))) return vacia(res, 404);
    const esIndice = rel.toLowerCase() === 'index.html';
    let cuerpo;
    try { cuerpo = readFileSync(real); } catch { return vacia(res, 404); }
    if (esIndice) cuerpo = Buffer.from(inyectar(cuerpo.toString('utf8')), 'utf8');
    res.writeHead(200, { ...cabecerasBase, 'content-type': TIPOS[extname(real).toLowerCase()] ?? 'application/octet-stream', 'content-length': cuerpo.length });
    res.end(req.method === 'HEAD' ? undefined : cuerpo);
  };

  // ---- llamadas ----
  const ramaActual = () => git(raiz, ['rev-parse', '--abbrev-ref', 'HEAD']).salida || null;
  const sinGuardar = () => {
    const r = git(raiz, ['status', '--porcelain', '--untracked-files=all', '--', 'carta', 'index.html']);
    return r.ok ? r.salida.split('\n').filter(Boolean).length : null;
  };

  async function guardar(res, cuerpo) {
    if (!rama) return json(res, 409, { ok: false, motivo: 'el servidor arrancó sin --rama: no guarda' });
    const actual = ramaActual();
    if (!actual || RAMAS_PROHIBIDAS.has(actual) || actual !== rama) return json(res, 409, { ok: false, motivo: 'la rama actual es «' + (actual ?? '?') + '», no la de retoques («' + rama + '»): no se guarda' });
    if (core.ocupado) return json(res, 409, { ok: false, ocupado: true, motivo: 'Core está trabajando: espera a que acabe' });
    const mensaje = String(cuerpo.mensaje ?? '').replace(/\r/g, '').trim().slice(0, 500) || 'Retoques de la carta';
    const add = git(raiz, ['add', '-A', '--', 'carta', 'index.html']);
    if (!add.ok) return json(res, 500, { ok: false, motivo: add.error });
    if (git(raiz, ['diff', '--cached', '--quiet', '--', 'carta', 'index.html']).ok) return json(res, 409, { ok: false, motivo: 'no hay nada que guardar' });
    const c = git(raiz, ['commit', '-m', mensaje, '--', 'carta', 'index.html']);
    if (!c.ok) return json(res, 500, { ok: false, motivo: c.error || c.salida });
    const commit = git(raiz, ['rev-parse', 'HEAD']).salida;
    const archivos = git(raiz, ['show', '--name-only', '--format=', 'HEAD']).salida.split('\n').filter(Boolean);
    return json(res, 200, { ok: true, commit, archivos });
  }

  async function llamada(req, res, ruta) {
    if (!dentroDelLimite()) return vacia(res, 429);
    if (!igual(req.headers[CABECERA_LLAVE], LLAVE)) return vacia(res, 401);
    const m = req.method;
    if (ruta === '/retoques/estado' && m === 'GET') {
      const sesiones = leerSesiones(rutaSesiones);
      return json(res, 200, { agente: core.vivo, ocupado: core.ocupado, conversacion: Boolean(core.sesion), rama: ramaActual(), ramaDeRetoques: rama, sinGuardar: sinGuardar(), modelo: modelo ?? null, claveApi: Boolean(claveApi), fondo: totalDelFondo(), sesionesSinCrecer: sesionesSinCrecer(sesiones), ensayo: Boolean(ensayo), ensayoAlta: elEnsayo?.alta ?? null });
    }
    if (ruta === '/retoques/ensayo/cuenta' && m === 'GET') {
      if (!elEnsayo) return vacia(res, ensayo ? 503 : 404);
      return json(res, 200, await elEnsayo.cuenta());
    }
    if (ruta === '/retoques/fondo' && m === 'GET') return json(res, 200, resumenDelFondo(leerTexto(rutaFondo), leerSesiones(rutaSesiones)));
    if (ruta === '/retoques/eventos' && m === 'GET') {
      res.writeHead(200, { ...cabecerasBase, 'content-type': 'text/event-stream; charset=utf-8', connection: 'keep-alive' });
      res.write(': hola\n\n');
      avisos.add(res);
      const latido = setInterval(() => { try { res.write(': .\n\n'); } catch { /* cerrada */ } }, LIMITES.latido);
      const fin = () => { clearInterval(latido); avisos.delete(res); };
      req.on('close', fin);
      res.on('close', fin);
      return;
    }
    if (m !== 'POST') return vacia(res, 404);
    const rutas = ['/retoques/opinion', '/retoques/core', '/retoques/core/nueva', '/retoques/guardar'];
    if (!rutas.includes(ruta)) return vacia(res, 404);
    const c = await leerCuerpo(req);
    if (c.estado) return vacia(res, c.estado);
    const cuerpo = c.datos;
    if (ruta === '/retoques/opinion') {
      try {
        mkdirSync(datos, { recursive: true });
        appendFileSync(join(datos, 'opiniones.jsonl'), JSON.stringify({ recibida: new Date().toISOString(), ...cuerpo }) + '\n');
      } catch (e) { return json(res, 500, { ok: false, motivo: String(e?.message ?? e) }); }
      return json(res, 200, { ok: true });
    }
    if (ruta === '/retoques/core/nueva') {
      return core.nueva() ? json(res, 200, { ok: true }) : json(res, 409, { ok: false, ocupado: true, motivo: 'Core está con otro mensaje' });
    }
    if (ruta === '/retoques/guardar') return guardar(res, cuerpo);
    // /retoques/core
    const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim() : '';
    if (!texto) return json(res, 400, { ok: false, motivo: 'falta lo que pides' });
    if (core.ocupado) return json(res, 409, { ok: false, ocupado: true, motivo: 'Core está con otro mensaje: espera a que acabe' });
    const entrada = {
      texto: texto.slice(0, 8000),
      contexto: typeof cuerpo.contexto === 'string' ? cuerpo.contexto.slice(0, 40_000) : '',
      senalado: Array.isArray(cuerpo.senalado) ? cuerpo.senalado.slice(0, 10) : [],
    };
    res.writeHead(200, { ...cabecerasBase, 'content-type': 'application/x-ndjson; charset=utf-8' });
    const escribir = (trozo) => { try { res.write(JSON.stringify(trozo) + '\n'); } catch { /* la pestaña se fue: Core sigue */ } };
    await core.enviar(entrada, escribir);
    apuntarMensaje();
    res.end();
    soltarRetenidos();
  }

  async function entrarPublico(req, res) {
    const ahora = Date.now();
    while (entrar.intentos.length && entrar.intentos[0] < ahora - 60_000) entrar.intentos.shift();
    if (ahora < entrar.hasta || entrar.intentos.length >= LIMITES.entrarPorMinuto) { req.resume(); return vacia(res, 429); }
    entrar.intentos.push(ahora);
    const c = await leerCuerpo(req);
    if (c.estado) return vacia(res, c.estado);
    if (!igual(c.datos.llave, LLAVE)) {
      entrar.fallos++;
      if (entrar.fallos >= LIMITES.fallosSinEspera) entrar.hasta = Date.now() + Math.min(LIMITES.esperaMaxima, 1000 * 2 ** (entrar.fallos - LIMITES.fallosSinEspera));
      return vacia(res, 401);
    }
    entrar.fallos = 0;
    entrar.hasta = 0;
    const valor = randomBytes(32).toString('hex');
    sesiones.set(resumen(valor).toString('hex'), Date.now() + LIMITES.sesion);
    return vacia(res, 204, { 'set-cookie': `${COOKIE}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(LIMITES.sesion / 1000)}` });
  }

  /** /ensayo/…: el libro compartido del ensayo (el contrato de siempre); crear ejes, nunca desde fuera. */
  async function libroDelEnsayo(req, res, ruta) {
    if (!elEnsayo) { req.resume(); return vacia(res, 503); }
    const ahora = Date.now();
    while (llamadasEnsayo.length && llamadasEnsayo[0] < ahora - 60_000) llamadasEnsayo.shift();
    if (llamadasEnsayo.length >= LIMITES.ensayoPorMinuto) { req.resume(); return vacia(res, 429); }
    llamadasEnsayo.push(ahora);
    if (/\/ejes\/?$/.test(ruta) || !['GET', 'POST', 'OPTIONS'].includes(req.method)) { req.resume(); return vacia(res, 404); }
    if (Number(req.headers['content-length'] ?? 0) > LIMITES.ensayoCuerpo) { req.resume(); return vacia(res, 413); }
    const trozos = [];
    let total = 0;
    for await (const t of req) {
      total += t.length;
      if (total > LIMITES.ensayoCuerpo) return vacia(res, 413);
      trozos.push(t);
    }
    const cabeceras = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') cabeceras.set(k, v);
    const peticion = new Request('http://' + String(req.headers.host) + req.url, { method: req.method, headers: cabeceras, body: req.method === 'POST' ? Buffer.concat(trozos) : undefined });
    const r = await elEnsayo.manejar(peticion);
    res.writeHead(r.status, { ...Object.fromEntries(r.headers.entries()), ...cabecerasBase });
    res.end(r.status === 204 ? undefined : Buffer.from(await r.arrayBuffer()));
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      const cara = caraDe(req);
      if (!cara) return vacia(res, 403);
      const ruta = String(req.url ?? '').split('?')[0];
      if (cara === 'publica' && !conSesion(req)) {
        if (ruta === '/retoques/entrar' && req.method === 'POST') return entrarPublico(req, res);
        req.resume();
        if (req.method !== 'GET') return vacia(res, 401);
        res.writeHead(401, { ...cabecerasBase, 'content-type': 'text/html; charset=utf-8' });
        return res.end(PAGINA_LLAVE);
      }
      if (ruta === '/retoques/cliente.js' && (req.method === 'GET' || req.method === 'HEAD')) {
        res.writeHead(200, { ...cabecerasBase, 'content-type': TIPOS['.js'] });
        return res.end(req.method === 'HEAD' ? undefined : readFileSync(join(AQUI, 'cliente.js')));
      }
      if (ruta === '/retoques' || ruta.startsWith('/retoques/') || /^\/retoques%/i.test(ruta)) return await llamada(req, res, ruta);
      if (ensayo && (ruta === '/ensayo' || ruta.startsWith('/ensayo/'))) return await libroDelEnsayo(req, res, ruta);
      return servirArchivo(req, res);
    } catch (e) {
      if (!res.headersSent) vacia(res, 500);
      else res.end();
      console.error('retoques:', e?.message ?? e);
    }
  });

  return {
    llave: LLAVE,
    agente: core,
    servidor,
    puerto: () => puertoReal,
    emitir,
    escuchar() {
      return new Promise((ok, mal) => {
        servidor.once('error', mal);
        servidor.listen(puerto, '127.0.0.1', () => {
          puertoReal = servidor.address().port;
          if (vigilar) {
            try {
              vigia = watch(raiz, { recursive: true }, (_, nombre) => cambio(nombre));
              vigia.on('error', () => { /* una carpeta borrada: se sigue */ });
            } catch (e) { console.error('retoques: sin vigilar los archivos:', e?.message ?? e); }
          }
          if (!ensayo) { ok(puertoReal); return; }
          const url = host ? 'https://' + host + '/ensayo' : 'http://localhost:' + puertoReal + '/ensayo';
          montarEnsayo({ ...ensayo, url, origenes: host ? ['https://' + host] : [], decir })
            .then((e) => { elEnsayo = e; ok(puertoReal); })
            .catch((e) => { servidor.close(); mal(e); });
        });
      });
    },
    ensayo: () => elEnsayo,
    async cerrar() {
      clearTimeout(temporizador);
      vigia?.close();
      for (const r of avisos) { try { r.end(); } catch { /* nada */ } }
      avisos.clear();
      await Promise.all([core.cerrar(), new Promise((ok) => { servidor.close(() => ok()); servidor.closeAllConnections?.(); })]);
    },
  };
}

// ---------- desde la consola ----------

function opciones(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--puerto') { o.puerto = Number(v); i++; }
    else if (a === '--rama') { o.rama = v; i++; }
    else if (a === '--modelo') { o.modelo = v; i++; }
    else if (a === '--publico') { o.publico = v; i++; }
    else if (a === '--clave-api') { o.claveApi = v; i++; }
    else if (a === '--ensayo' || a === '--tabla' || a === '--claves') { o.ensayo ??= {}; o.ensayo[{ '--ensayo': 'carpeta', '--tabla': 'tabla', '--claves': 'claves' }[a]] = v; i++; }
    else throw new Error('no conozco «' + a + '». Uso: node retoques/servidor.mjs [--puerto 8790] [--rama <rama>] [--modelo <modelo>] [--publico <host>] [--clave-api <ruta>] [--ensayo <carpeta> --tabla <ruta> --claves <ruta>]');
  }
  if (o.ensayo && !(o.ensayo.carpeta && o.ensayo.tabla && o.ensayo.claves)) throw new Error('--ensayo, --tabla y --claves van juntas');
  if (o.puerto !== undefined && !(Number.isInteger(o.puerto) && o.puerto > 0 && o.puerto < 65536)) throw new Error('--puerto: un número entre 1 y 65535');
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let s;
  try {
    s = crearServidor(opciones(process.argv.slice(2)));
    const puerto = await s.escuchar();
    const o = opciones(process.argv.slice(2));
    console.log('Retoques de la carta, solo en 127.0.0.1:' + puerto);
    console.log('Abre: http://localhost:' + puerto + '/#llave=' + s.llave);
    if (o.publico) console.log('Detrás del túnel: https://' + o.publico + '/#llave=' + s.llave);
    console.log(o.rama ? '«guardar» hace commit solo en la rama ' + o.rama + '.' : 'Sin --rama: «guardar» no hace commit.');
    if (!o.claveApi) console.log('Aviso: sin --clave-api, Core gasta de la cuenta de Claude Code de este equipo.');
    else console.log(leerClave(resolve(o.claveApi)) ? 'Core gasta de la clave de API de VG (--clave-api).' : 'Aviso: el archivo de --clave-api falta o está vacío: Core no arrancará hasta que esté.');
    if (o.ensayo) console.log('Ensayo: el libro del roadmap en /ensayo; la dueña entra desde el PV9 («Core»).');
    console.log('Ctrl+C para parar (Core se cierra con él).');
  } catch (e) {
    console.error('retoques:', e?.message ?? e);
    process.exit(1);
  }
  const parar = () => { s.cerrar().finally(() => process.exit(0)); };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
}

