// El transporte simulado como servicio HTTP: la misma API que la función
// `eventos` de AGRAM, sobre un relé Nostr en memoria. Para la carta basta con
// apuntar su URL base aquí.
//
//   node servidor.mjs [--puerto 8788] [--host 127.0.0.1] [--secreto prueba] [--espejo ws://relé …]
//                     [--archivo /datos/libro.jsonl] [--autoridad]
//   (--host 0.0.0.0 dentro de Docker; --espejo, una vez por relé de la casa al que replicar;
//    --archivo, el libro persistente; --autoridad, juzgar con el núcleo de AGRAM: 7701 o 7703)
//   El secreto para crear ejes también puede venir de AGRAM_CREAR_EJES (mejor que por argumento).
//
// Rutas: /eventos/ejes (POST), /eventos (POST, GET ?eje&desde&cuantos), /eventos/recibo (GET ?eje&id).

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { crearServicio } from './src/servicio.js';

async function aRequest(req, base) {
  const trozos = [];
  for await (const t of req) trozos.push(t);
  const cabeceras = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') cabeceras.set(k, v);
  const sinCuerpo = req.method === 'GET' || req.method === 'HEAD';
  return new Request(base + req.url, { method: req.method, headers: cabeceras, body: sinCuerpo ? undefined : Buffer.concat(trozos) });
}

/** Arranca el servicio en `puerto` (0: uno libre). Devuelve { url, puerto, cerrar, servicio }. */
export async function arrancar({ puerto = 0, host = '127.0.0.1', secreto = 'prueba', ...opciones } = {}) {
  const servicio = crearServicio({ crearEjes: { secreto }, ...opciones });
  if (opciones.archivo) await servicio.abrir(); // el libro guardado: relé, ejes y juicio de la autoridad
  const servidor = createServer(async (req, res) => {
    const respuesta = await servicio.manejar(await aRequest(req, 'http://' + (req.headers.host ?? 'localhost')));
    res.writeHead(respuesta.status, Object.fromEntries(respuesta.headers));
    res.end(Buffer.from(await respuesta.arrayBuffer()));
  });
  await new Promise((ok) => servidor.listen(puerto, host, ok));
  const p = servidor.address().port;
  return { url: 'http://' + (host === '0.0.0.0' ? '127.0.0.1' : host) + ':' + p, puerto: p, servicio, cerrar: () => new Promise((ok) => servidor.close(ok)) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
  const espejos = process.argv.flatMap((a, i, l) => (a === '--espejo' ? [l[i + 1]] : []));
  const archivo = arg('--archivo', undefined);
  const autoridad = process.argv.includes('--autoridad') ? new (await import('./src/autoridad.js')).Autoridad() : null;
  const secreto = arg('--secreto', process.env.AGRAM_CREAR_EJES ?? 'prueba');
  const s = await arrancar({ puerto: Number(arg('--puerto', 8788)), secreto, host: arg('--host', '127.0.0.1'), espejos, archivo, autoridad });
  console.log('aarpia-transporte en ' + s.url + '/eventos · relé ' + s.servicio.rele.publica + (autoridad ? ' · autoridad ' + autoridad.nucleo.slice(0, 7) : '') + (archivo ? ' · libro ' + archivo : '') + (espejos.length ? ' · espejo ' + espejos.join(', ') : ''));
}
