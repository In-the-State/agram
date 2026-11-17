// El agente de la carta: Claude Code sin terminal, dedicado a retocar la carta, con la conversación conservada.
//
// Un proceso vivo con entrada y salida en stream-json (más rápido que arrancar uno por mensaje). Si muere, el siguiente
// mensaje lo vuelve a arrancar con --resume y el id de sesión guardado en retoques/.datos/sesion.json. Los permisos, muy
// acotados (comprobados de verdad: retoques/LEEME.md):
//   --restricted            sin herramientas que ejecuten órdenes ni WebFetch; sin ajustes de usuario ni de proyecto;
//                           las herramientas de archivos, encerradas en la carpeta de trabajo (la raíz del worktree)
//   --strict-mcp-config     sin servidores MCP
//   --tools                 solo Read, Edit, Write, Glob y Grep
//   --permission-mode dontAsk y --permission-prompts none: lo que no está permitido de antemano se rechaza solo
//   --settings permisos.json: escribir solo en carta/**, index.html y retoques/.datos/fondo.md
// Nunca --dangerously-skip-permissions ni bypassPermissions.
//
// La clave de API de VG (--clave-api <ruta> del servidor): se lee del archivo al arrancar cada proceso y va SOLO en el
// entorno del hijo (ANTHROPIC_API_KEY, sin las otras credenciales del entorno). No se guarda en el agente, no sale en
// ningún trozo: lo que se enseña del hijo pasa por un filtro que la tacha. Si el archivo falta o está vacío, el mensaje
// acaba en error y el hijo no arranca (nunca se cae en silencio a la cuenta de Claude Code del equipo); si el «init» del
// hijo dice que la clave no viene del entorno, se le mata: «Core no está usando la clave de VG».
//
// Lo que sale hacia el servidor son «trozos»: { tipo: 'texto', texto } según llega, { tipo: 'archivo', ruta, herramienta }
// cuando toca un archivo, { tipo: 'rechazo', ruta, herramienta, motivo } si una herramienta se lo niega, y al final
// { tipo: 'fin', archivos, ms } o { tipo: 'error', motivo }. Sin dependencias.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const PERMISOS = join(AQUI, 'permisos.json');
export const INSTRUCCIONES = join(AQUI, 'INSTRUCCIONES.md');
export const HERRAMIENTAS = 'Read,Edit,Write,Glob,Grep';
const EDITAN = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
/** Lo más que dura un mensaje antes de cortarlo. */
export const TIEMPO_MAXIMO = 10 * 60 * 1000;

/** Los argumentos de `claude` (sin el ejecutable): siempre los mismos permisos; el modelo y la sesión, si los hay. */
export function argumentos({ modelo = null, sesion = null } = {}) {
  return [
    '-p', '--restricted', '--strict-mcp-config', '--tools', HERRAMIENTAS,
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--settings', PERMISOS, '--append-system-prompt-file', INSTRUCCIONES,
    '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    ...(modelo ? ['--model', modelo] : []),
    ...(sesion ? ['--resume', sesion] : []),
  ];
}

/** Las credenciales del entorno que no pasan al hijo cuando va con la clave de VG (no deben ganarle a ANTHROPIC_API_KEY). */
const OTRAS_CREDENCIALES = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_BASE_URL'];
/** Lo que dice el «init» de Claude Code cuando la clave viene del entorno. */
export const ORIGEN_DE_LA_CLAVE = 'ANTHROPIC_API_KEY';
export const NO_USA_LA_CLAVE = 'Core no está usando la clave de VG';

/** El campo de un archivo JSON de secretos donde va la clave de la API de Anthropic. */
export const CAMPO_DE_LA_CLAVE = 'anthropic_api_key';

/**
 * La clave de un archivo: su primera línea, sin espacios; o, si el archivo es un objeto JSON (el de secretos que ya
 * guarda la clave de la guía), su campo `anthropic_api_key`. null si no se puede leer, está vacía o el campo falta.
 */
export function leerClave(ruta) {
  try {
    const texto = readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '');
    if (texto.trimStart().startsWith('{')) {
      const v = JSON.parse(texto)?.[CAMPO_DE_LA_CLAVE];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    }
    const v = texto.split(/\r?\n/)[0].trim();
    return v || null;
  } catch { return null; }
}

/** Tacha en un texto la clave dada y cualquier cosa con forma de clave de Anthropic. */
export function tachar(texto, clave = null) {
  let s = String(texto ?? '');
  if (clave) s = s.split(clave).join('[clave tachada]');
  return s.replace(/sk-ant-[A-Za-z0-9_-]+/g, '[clave tachada]');
}

/** Lo que llega de la pantalla va marcado como DATOS: un cierre de etiqueta dentro no puede cerrar el bloque. */
const neutro = (s) => String(s ?? '').replace(/<(\/?)(pantalla|senalado)\b/gi, '‹$1$2');

/** El mensaje que recibe el agente: lo que pide VG y, aparte y marcados como datos, el contexto de pantalla y lo señalado. */
export function mensajeDe({ texto, contexto = '', senalado = [] } = {}) {
  const partes = [String(texto ?? '').trim()];
  if (contexto && String(contexto).trim()) partes.push('<pantalla>\n' + neutro(contexto) + '\n</pantalla>');
  if (Array.isArray(senalado) && senalado.length) partes.push('<senalado>\n' + neutro(JSON.stringify(senalado, null, 1)) + '\n</senalado>');
  return partes.join('\n\n');
}

export class Agente {
  /**
   * `raiz`: la carpeta de trabajo (la raíz del worktree). `datos`: dónde se guarda el id de sesión. `modelo`: el de
   * --modelo o null. `orden`: { comando, args } para cambiar el ejecutable (las pruebas usan un agente falso de Node; sus
   * `args` van delante de los de claude). `tiempoMaximo`: ms por mensaje. `claveApi`: la RUTA del archivo con la clave
   * de VG (nunca la clave), o null: la cuenta de Claude Code de este equipo.
   */
  constructor({ raiz, datos = join(raiz, 'retoques', '.datos'), modelo = null, orden = null, tiempoMaximo = TIEMPO_MAXIMO, claveApi = null } = {}) {
    this.raiz = resolve(raiz);
    this.claveApi = claveApi;
    this.datos = datos;
    this.modelo = modelo;
    this.orden = orden;
    this.tiempoMaximo = tiempoMaximo;
    this.proceso = null;
    this.turno = null;
    this.sesion = this.#leerSesion();
  }

  get ocupado() { return Boolean(this.turno); }
  get vivo() { return Boolean(this.proceso); }

  #rutaSesion() { return join(this.datos, 'sesion.json'); }
  #leerSesion() {
    try {
      const id = JSON.parse(readFileSync(this.#rutaSesion(), 'utf8'))?.id;
      return typeof id === 'string' && /^[0-9a-f-]{8,64}$/i.test(id) ? id : null;
    } catch { return null; }
  }
  #guardarSesion(id) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(id) || id === this.sesion) return;
    this.sesion = id;
    try { mkdirSync(this.datos, { recursive: true }); writeFileSync(this.#rutaSesion(), JSON.stringify({ id }) + '\n'); } catch { /* sin disco: se pierde al reiniciar */ }
  }
  #olvidarSesion() {
    this.sesion = null;
    try { if (existsSync(this.#rutaSesion())) rmSync(this.#rutaSesion()); } catch { /* nada */ }
  }

  /** Una ruta que dice una herramienta, relativa a la raíz y con «/» (si está fuera, tal cual). */
  #relativa(p) {
    if (typeof p !== 'string' || !p) return null;
    const abs = isAbsolute(p) ? p : resolve(this.raiz, p);
    const rel = relative(this.raiz, abs);
    return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.split(sep).join('/') : p;
  }

  #arrancar() {
    const comando = this.orden?.comando ?? 'claude';
    const args = [...(this.orden?.args ?? []), ...argumentos({ modelo: this.modelo, sesion: this.sesion })];
    let entorno = process.env;
    let filtro = (x) => tachar(x);
    if (this.claveApi) {
      const clave = leerClave(this.claveApi);
      if (!clave) throw new Error('No puedo leer la clave de API de VG (el archivo de --clave-api falta, está vacío o no se lee): Core no arranca');
      entorno = { ...process.env };
      for (const k of OTRAS_CREDENCIALES) delete entorno[k];
      entorno.ANTHROPIC_API_KEY = clave;
      filtro = (x) => tachar(x, clave);
    }
    const p = spawn(comando, args, { cwd: this.raiz, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: entorno });
    entorno = null;
    const vida = { p, buffer: '', errores: '', inicio: false, conResume: Boolean(this.sesion), filtro, motivo: null };
    this.proceso = vida;
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      vida.buffer += d;
      let n;
      while ((n = vida.buffer.indexOf('\n')) >= 0) {
        const linea = vida.buffer.slice(0, n).trim();
        vida.buffer = vida.buffer.slice(n + 1);
        if (!linea) continue;
        let e;
        try { e = JSON.parse(linea); } catch { continue; }
        if (this.proceso !== vida) return; // muerto a propósito: nada más de él
        this.#evento(e, vida);
      }
    });
    p.stderr.on('data', (d) => { vida.errores = (vida.errores + d).slice(-2000); });
    p.stdin.on('error', () => { /* el proceso se ha ido: lo dice 'exit' */ });
    p.on('error', (e) => this.#murio(vida, e.code === 'ENOENT' ? 'no encuentro «' + comando + '» (Claude Code)' : String(e.message ?? e)));
    p.on('exit', (codigo) => this.#murio(vida, vida.motivo ?? 'Core se ha cerrado (código ' + codigo + ')' + (vida.errores.trim() ? ': ' + vida.filtro(vida.errores.trim()).slice(-400) : '')));
  }

  #murio(vida, motivo) {
    if (this.proceso !== vida) return;
    this.proceso = null;
    // Un --resume que no arranca (la sesión ya no existe): la próxima vez, una conversación nueva.
    if (vida.conResume && !vida.inicio) { this.#olvidarSesion(); motivo += ' · no se pudo retomar la conversación anterior: el próximo mensaje empieza una nueva'; }
    this.#acabar({ tipo: 'error', motivo: vida.filtro(motivo) });
  }

  #acabar(trozo) {
    const turno = this.turno;
    if (!turno) return;
    this.turno = null;
    clearTimeout(turno.reloj);
    turno.alTrozo(trozo);
    turno.resolver(trozo);
  }

  #evento(e, vida) {
    if (e.session_id) this.#guardarSesion(e.session_id);
    if (e.type === 'system' && e.subtype === 'init') {
      vida.inicio = true;
      // Con la clave de VG, el hijo tiene que decir que la usa; si no, se le mata y el mensaje acaba en error.
      if (this.claveApi && e.apiKeySource !== ORIGEN_DE_LA_CLAVE) {
        vida.motivo = NO_USA_LA_CLAVE + ' (dice: ' + String(e.apiKeySource ?? 'nada').slice(0, 40) + ')';
        try { vida.p.kill(); } catch { /* nada */ }
        this.#murio(vida, vida.motivo);
      }
      return;
    }
    const turno = this.turno;
    if (!turno) return;
    if (e.type === 'stream_event') {
      const d = e.event?.delta;
      if (e.event?.type === 'content_block_delta' && d?.type === 'text_delta' && d.text) {
        turno.deltas++;
        turno.desdeElUltimo++;
        turno.alTrozo({ tipo: 'texto', texto: d.text });
      }
      return;
    }
    if (e.type === 'assistant') {
      for (const b of e.message?.content ?? []) {
        // Sin trozos parciales (otro modo de salida), el texto entero del mensaje.
        if (b.type === 'text' && b.text && turno.desdeElUltimo === 0) { turno.deltas++; turno.alTrozo({ tipo: 'texto', texto: b.text }); }
        if (b.type === 'tool_use') {
          const ruta = this.#relativa(b.input?.file_path ?? b.input?.notebook_path ?? b.input?.path ?? null);
          turno.usos.set(b.id, { herramienta: b.name, ruta });
          if (ruta) turno.alTrozo({ tipo: 'archivo', ruta, herramienta: b.name });
        }
      }
      turno.desdeElUltimo = 0;
      return;
    }
    if (e.type === 'user') {
      const contenido = Array.isArray(e.message?.content) ? e.message.content : [];
      for (const b of contenido) {
        if (b.type !== 'tool_result') continue;
        const uso = turno.usos.get(b.tool_use_id);
        if (!uso || !EDITAN.has(uso.herramienta)) continue;
        if (b.is_error) {
          const texto = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content : []).map((x) => x?.text ?? '').join(' ');
          turno.alTrozo({ tipo: 'rechazo', ruta: uso.ruta, herramienta: uso.herramienta, motivo: texto.replace(/<\/?tool_use_error>/g, '').trim().slice(0, 200) });
        } else if (uso.ruta) turno.cambiados.add(uso.ruta);
      }
      return;
    }
    if (e.type === 'result') {
      if (e.is_error || (e.subtype && e.subtype !== 'success')) {
        this.#acabar({ tipo: 'error', motivo: vida.filtro(String(e.result || e.subtype || 'error')), archivos: [...turno.cambiados] });
        return;
      }
      if (!turno.deltas && typeof e.result === 'string' && e.result) turno.alTrozo({ tipo: 'texto', texto: vida.filtro(e.result) });
      this.#acabar({ tipo: 'fin', archivos: [...turno.cambiados], ms: Date.now() - turno.desde });
    }
  }

  /**
   * Manda un mensaje ({ texto, contexto, senalado }) y va llamando a alTrozo con lo que llega. → el último trozo
   * ({ tipo: 'fin' } o { tipo: 'error' }). Uno a la vez: si está ocupado, error y nada más (no encola).
   */
  enviar(entrada, alTrozo = () => {}) {
    if (this.turno) {
      const t = { tipo: 'error', motivo: 'Core está con otro mensaje', ocupado: true };
      alTrozo(t);
      return Promise.resolve(t);
    }
    return new Promise((resolver) => {
      this.turno = { alTrozo, resolver, usos: new Map(), cambiados: new Set(), deltas: 0, desdeElUltimo: 0, desde: Date.now(), reloj: null };
      this.turno.reloj = setTimeout(() => {
        this.#acabar({ tipo: 'error', motivo: 'Core ha tardado más de ' + Math.round(this.tiempoMaximo / 60000) + ' min: lo he parado' });
        this.cerrar();
      }, this.tiempoMaximo);
      if (!this.proceso) {
        try { this.#arrancar(); } catch (e) { this.#acabar({ tipo: 'error', motivo: String(e?.message ?? e) }); return; }
      }
      const linea = JSON.stringify({ type: 'user', message: { role: 'user', content: mensajeDe(entrada) } }) + '\n';
      try { this.proceso?.p.stdin.write(linea); } catch (e) { this.#acabar({ tipo: 'error', motivo: String(e?.message ?? e) }); }
    });
  }

  /** Una conversación nueva: cierra el proceso y olvida la sesión. false si está ocupado. */
  nueva() {
    if (this.turno) return false;
    this.cerrar();
    this.#olvidarSesion();
    return true;
  }

  /** Cierra el proceso (la sesión se conserva para --resume). → una promesa que se cumple cuando el proceso ha salido (o a los 5 s). */
  cerrar() {
    const vida = this.proceso;
    this.proceso = null;
    if (this.turno) this.#acabar({ tipo: 'error', motivo: 'Core se ha cerrado' });
    if (!vida) return this.saliendo ?? Promise.resolve();
    const salido = vida.p.exitCode !== null || vida.p.signalCode !== null ? Promise.resolve()
      : new Promise((ok) => { const reloj = setTimeout(ok, 5000); vida.p.once('exit', () => { clearTimeout(reloj); ok(); }); });
    try { vida.p.stdin.end(); } catch { /* nada */ }
    try { vida.p.kill(); } catch { /* nada */ }
    this.saliendo = salido;
    return salido;
  }
}
