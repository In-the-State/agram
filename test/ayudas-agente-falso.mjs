// Un agente falso para test/retoques-servidor.test.js: imita la salida stream-json de Claude Code sin llamar a nada.
// Recibe los mismos argumentos que claude (retoques/agente.mjs argumentos) y se niega si faltan los de los permisos.
// Por cada mensaje: un texto en dos trozos, un Edit de carta/estilo.css (lo escribe de verdad, para ver que el aviso
// espera a que acabe), su resultado y el final. Si el mensaje dice LENTO, tarda 600 ms antes de acabar; si dice ROTO,
// el proceso se cierra a medias.

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
// Sin los argumentos de claude es que lo ha recogido `node --test` (todo lo de test/ cuenta como prueba): no hace nada.
if (!args.includes('-p')) process.exit(0);
for (const exigido of ['--restricted', '--strict-mcp-config', '--input-format', '--output-format', '--settings', '--append-system-prompt-file']) {
  if (!args.includes(exigido)) { process.stderr.write('falta ' + exigido + '\n'); process.exit(3); }
}
if (args[args.indexOf('--tools') + 1] !== 'Read,Edit,Write,Glob,Grep' || args[args.indexOf('--permission-mode') + 1] !== 'dontAsk') { process.stderr.write('permisos\n'); process.exit(3); }
if (args.some((a) => /dangerously|bypassPermissions/i.test(a))) process.exit(4);

const sesion = args.includes('--resume') ? args[args.indexOf('--resume') + 1] : '0f0f0f0f-1111-2222-3333-444455556666';
const decir = (o) => process.stdout.write(JSON.stringify({ session_id: sesion, ...o }) + '\n');
decir({ type: 'system', subtype: 'init', tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'] });

let buf = '';
let cola = Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  let n;
  while ((n = buf.indexOf('\n')) >= 0) {
    const linea = buf.slice(0, n);
    buf = buf.slice(n + 1);
    if (linea.trim()) cola = cola.then(() => turno(JSON.parse(linea).message.content));
  }
});
process.stdin.on('end', () => cola.then(() => process.exit(0)));

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function turno(texto) {
  const delta = (t) => decir({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } } });
  delta('Cambio ');
  delta('el color.');
  decir({ type: 'assistant', message: { content: [{ type: 'text', text: 'Cambio el color.' }] } });
  const ruta = join(process.cwd(), 'carta', 'estilo.css');
  decir({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'u1', name: 'Edit', input: { file_path: ruta, old_string: 'a', new_string: 'b' } }] } });
  if (texto.includes('ROTO')) process.exit(2);
  appendFileSync(ruta, '\n/* retoque */\n');
  decir({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'u1', content: 'ok' }] } });
  decir({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'u2', name: 'Write', input: { file_path: join(process.cwd(), 'src', 'x.js'), content: 'x' } }] } });
  decir({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'u2', is_error: true, content: 'Permission to use Write has been denied' }] } });
  if (texto.includes('LENTO')) await esperar(600);
  decir({ type: 'result', subtype: 'success', is_error: false, result: 'Cambio el color.', permission_denials: [{}] });
}
