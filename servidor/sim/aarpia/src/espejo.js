// El espejo: todo lo que el relé en memoria guarda (7700, 7701, 7703) se publica también en
// uno o varios relés Nostr de verdad (NIP-01 por WebSocket), p. ej. el `strfry` de la casa VOE.
// Es lo que permite meter `aarpia/transporte` en la red de la casa como andamio dicho
// (DESPLIEGUE_AARPIA.md): la casa es el bus y el archivo; esto es la puerta de AGRAM.
//
//   const espejo = crearEspejo({ urls: ['ws://relays.strfry_1:7777'] });
//   const rele = new Rele({ alGuardar: espejo.enviar });
//
// Garantías: al menos una vez (cola con reintentos y espera creciente); idempotente porque el relé
// remoto deduplica por id; el orden de envío es el de llegada. No bloquea al relé en memoria: si el
// remoto no está, la cola espera. `estado()` dice qué falta por llegar a cada relé.
// El WebSocket es el global de Node (≥ 22) o el que se inyecte (las pruebas usan uno falso).

const ESPERA_MAX = 300_000;

/**
 * @param {object} o
 * @param {string[]} o.urls                los relés remotos
 * @param {typeof WebSocket} [o.WS]        la clase WebSocket (por defecto, la global)
 * @param {(ms:number, f:Function) => any} [o.temporizador]  setTimeout inyectable
 * @param {(msg:string) => void} [o.aviso] dónde se dicen los fallos (por defecto, nada)
 */
export function crearEspejo({ urls, WS = globalThis.WebSocket, temporizador = (ms, f) => setTimeout(f, ms), aviso = () => {} }) {
  const destinos = urls.map((url) => ({ url, cola: [], enVuelo: null, intentos: 0, socket: null, abierto: false, confirmados: 0 }));

  function conectar(d) {
    if (d.socket) return;
    const s = new WS(d.url);
    d.socket = s;
    s.onopen = () => {
      d.abierto = true;
      d.intentos = 0;
      siguiente(d);
    };
    s.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(typeof m.data === 'string' ? m.data : String(m.data)); } catch { return; }
      if (msg[0] !== 'OK' || !d.enVuelo || msg[1] !== d.enVuelo.id) return;
      const aceptado = msg[2] === true || /^duplicate:/.test(msg[3] ?? '');
      if (!aceptado) aviso('el relé ' + d.url + ' rechazó ' + d.enVuelo.id + ': ' + msg[3]);
      // Aceptado o rechazado por el remoto, este evento ya tiene respuesta: no se reintenta (un rechazo se dice).
      d.cola.shift();
      d.enVuelo = null;
      d.confirmados++;
      siguiente(d);
    };
    const caer = () => {
      d.socket = null;
      d.abierto = false;
      d.enVuelo = null; // se reenviará: el remoto deduplica por id
      if (!d.cola.length) return;
      d.intentos++;
      const espera = Math.min(ESPERA_MAX, 1000 * 2 ** (d.intentos - 1));
      aviso('sin conexión con ' + d.url + '; reintento en ' + espera + ' ms');
      temporizador(espera, () => conectar(d));
    };
    s.onclose = caer;
    s.onerror = () => { try { s.close(); } catch { /* ya cerrado */ } };
  }

  function siguiente(d) {
    if (!d.abierto || d.enVuelo || !d.cola.length) return;
    d.enVuelo = d.cola[0];
    d.socket.send(JSON.stringify(['EVENT', d.enVuelo]));
  }

  return {
    /** Encola un evento para todos los relés remotos. */
    enviar(ev) {
      for (const d of destinos) {
        d.cola.push(ev);
        if (!d.socket) conectar(d);
        else siguiente(d);
      }
    },
    /** Lo que falta por confirmar en cada relé remoto. */
    estado() {
      return destinos.map((d) => ({ url: d.url, pendientes: d.cola.length, confirmados: d.confirmados, conectado: d.abierto }));
    },
  };
}
