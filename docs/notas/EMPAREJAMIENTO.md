# El emparejamiento por QR (el módulo)

Encargo «el emparejamiento por QR, el módulo» (resto de A25, primera parte; Core AGRAM, 17-11). La forma es la del SIP 0, sección «Emparejamiento» (rama `beta-emparejar` del SIP de StateArk), y la de su resumen `stateark/EMPAREJAMIENTO_PARA_AGRAM.md`. Aquí solo está el módulo, sin pantalla: engancharlo a la carta es un encargo posterior.

**La idea.** La carta de un navegador cualquiera lee un QR de la app de StateArk y recibe una **clave de sesión que solo propone** (alcance `[13, 22242]`, 24 h como mucho, revocable). Con ella propone registros **sin firmar** por el relé de AARPIA (gift wrap NIP-59 con NIP-44 v2) y la app los firma con la clave de la cuenta, que la carta nunca ve. La firma vuelve, la carta la verifica y la pone como en el camino B (`docs/ANFITRION.md`).

## Los archivos

| Archivo | Qué es |
|---|---|
| `carta/emparejamiento.js` | el QR, los eventos de Nostr, envolver y abrir, el cliente del relé y el flujo (`Emparejamiento`). Puro: sin DOM, sin libro, sin `localStorage` |
| `carta/nip44.js` | NIP-44 v2: el secreto compartido con la curva de `src/vendor/noble-secp256k1.js` (la multiplicación de tiempo constante, `multiply`), HMAC-SHA256 con `crypto.subtle`, HKDF (Extract es un HMAC; Expand se arma con HMAC, porque `subtle` no da el Expand suelto), el relleno y el MAC comparado en tiempo constante |
| `carta/chacha20.js` | ChaCha20 del RFC 8439, escrito a mano |
| `test/emparejamiento.test.js`, `test/chacha20.test.js` | las pruebas (abajo) |
| `test/vectores/emparejamiento.json`, `test/vectores/nip44-v2.json`, `test/vectores/LEEME.md` | los vectores de StateArk y los oficiales de NIP-44 v2, con su origen y su SHA-256 |

No hay librerías nuevas. Del núcleo se usan `canonico` y `hash` (`src/evento.js`), `hashEtiquetado` y `verificarBip340` (`src/cripto.js`), `publicaDe` y `clavePublicaValida` (`src/autoridad.js`) y `schnorr` de la librería que ya está dentro. El azar sale siempre de `crypto.getRandomValues`.

## Qué exporta

`carta/emparejamiento.js`:

- **Constantes, en un solo sitio:** `KINDS` (`SELLO` 13, `REGALO` 1059, `RUMOR` 7704, `REVOCACION` 7705, `AUTH` 22242; 7704 y 7705 ya confirmados por Core AARPIA), `PREFIJO_QR`, los esquemas y usos, `ALCANCE`, `DE_LA_CARTA`, `DE_LA_APP`, `ESTADOS` y `LIMITES`.
- **El QR:** `leerQR(texto, { ahora, local })` → `{ rele, privada, delegacion, huella }`, o lanza `ErrorEmparejamiento` con `code`: `qr_invalid`, `relay_invalid`, `delegation_invalid`, `session_mismatch`, `scope_invalid` o `session_expired`, en ese orden. `huellaCorta(sesion)` → `a1b2-c3d4`. `textoDeQR` (el de la app; aquí para las pruebas). `releValido`.
- **Firmas:** `firmarEventoDeSesion(evento, privada)` firma SOLO los kinds 13 y 22242; cualquier otro, `scope_invalid` sin firmar. Es la única función exportada que firma con la clave que se le da. `eventoAuth` (el 22242 con `relay`, `challenge` y `delegacion`), `idDeEvento`, `verificarEvento`.
- **Mensajes:** `formaDelMensaje`, `envolver(mensaje, { privada, para, creadoEn, caduca })` (rumor 7704 → sello 13 del remitente → regalo 1059 de una clave de usar y tirar, con `p` y `expiration`), `abrir(regalo, privada)` → `{ remitente, creadoEn, mensaje, motivo }` o `null`, `revocacionValida`.
- **Almacenes:** `almacenEnMemoria()` y `almacenIndexedDB({ nombre, tienda })`. Los dos con `obtener`, `poner`, `borrar` y `claves`, asíncronos.
- **`ClienteRele`:** NIP-42 (firma el AUTH cuando el relé manda su desafío), la suscripción `{"kinds":[1059], "#p":[<sesión>]}` en cuanto el relé acepta el AUTH, el envío (cada evento espera su `OK` en una cola acotada y se manda otra vez al reconectar) y la reconexión con esperas de 1, 2, 5, 10, 30 y 60 s. Un AUTH rechazado no reintenta: avisa `auth_rechazado`.
- **`Emparejamiento`:** el flujo (abajo).
- `ErrorEmparejamiento` (con `code`).

## Qué guarda y dónde

Solo en el **almacén inyectado** (en el navegador, IndexedDB del origen con `almacenIndexedDB`, base `agram-emparejamiento`; nunca `localStorage`, nunca el libro, nunca la copia de la cuenta):

- `sesion:<clave de sesión>`: el objeto del QR (`rele`, `privada`, `delegacion`), si la app ya aceptó (`aceptada`) y si el `hola` salió (`hola`). Es lo único que lleva la privada de la sesión. Se **borra** al llegar a `hasta`, con una `revocada` que verifica, con `pairing_refused`, al olvidar o al leer otro QR.
- `propuestas`: por id, `{ id, sesion, publica, canonico, segundoFactor, nota?, libro?, estado, firma? | code? y motivo?, propuestaEn }`. Los estados: `propuesto`, `firmado`, `rechazado`, `caducado` y `revocado`. Sobreviven a la sesión (para enseñar «caducado sin firmar» o «revocado»); se quitan con `descartar(id)`. Como mucho 500: al pasar, se tiran los terminados más viejos.

La API nunca devuelve la privada: ni `estado()`, ni `propuestas()`, ni los avisos.

## Lo que necesitará el encargo de pantalla

<!-- comprobar: fragmento -->
```js
import { Emparejamiento, almacenIndexedDB } from './emparejamiento.js';

const emparejamiento = new Emparejamiento({
  almacen: almacenIndexedDB(),
  agente: 'navegador · ' + location.host,    // lo que la app enseña en su diálogo
  avisar: (aviso) => repintar(aviso),        // { tipo: 'emparejada' | 'rechazada' | 'firma' | 'rechazo' | 'caducada'
});                                          //   | 'revocada' | 'firma_invalida' | 'conectado' | 'desconectado' | 'auth_rechazado', … }
await emparejamiento.cargar();               // al abrir la carta: la sesión guardada, si sigue en plazo (sin otro «hola»)

// Leer un QR (de BarcodeDetector + getUserMedia, o pegado):
try {
  const { huella, hasta } = await emparejamiento.emparejar(texto);   // guarda, conecta y manda «hola»
  // «Emparejada con la app hasta HH:MM (a1b2-c3d4)»; aceptada cuando llegue el aviso «emparejada»
} catch (e) { /* e.code: qr_invalid, relay_invalid, delegation_invalid, session_mismatch, scope_invalid, session_expired */ }

emparejamiento.estado();   // null o { sesion, huella, hasta, app, rele, aceptada, conectado }

// Proponer, sin anfitrión y con un emparejamiento vivo: el firmante del camino B, el mismo sitio donde iría la clave.
const firmante = emparejamiento.firmante({ publica, segundoFactor, libro });   // libro: opcional (abajo)
const firmado = await autoridad.firmar(ev, firmante, ev.autor, { publica });  // espera la firma; el núcleo la comprueba otra vez
// o, sin el núcleo: await emparejamiento.proponer({ publica, canonico, id, segundoFactor, nota, libro }) → { id, firma }

emparejamiento.propuestas();          // para «propuesto», «rechazado» (code y motivo), «caducado sin firmar», «revocado»
await emparejamiento.reenviar(id);    // «volver a pedir» de una que sigue «propuesto»
await emparejamiento.descartar(id);   // ya asentada en el libro, o vista
await emparejamiento.olvidar();       // «Olvidar el emparejamiento»: borra la sesión sin mandar nada
emparejamiento.cerrar();              // al cerrar la página: para el socket y la alarma, no borra nada
```

- `proponer` (y el firmante) resuelve con `{ id, firma }` solo cuando llega una `firma` de la app que **verifica** (BIP-340 de `publica` sobre `id`); una que no verifica se descarta (aviso `firma_invalida`) y la propuesta sigue «propuesto». Rechaza con el `code` de un `rechazo` (`cancelled_by_holder`, `unknown_account`, `id_mismatch`, `canonical_invalid`, `author_mismatch`, `message_invalid`) y su motivo, o con los de la carta: `session_expired`, `session_revoked`, `pairing_refused`, `pairing_forgotten`, `pairing_replaced`, `proposal_discarded`; y antes de mandar nada, con `no_pairing`, `id_mismatch`, `canonical_invalid`, `message_invalid` o `message_too_large`.
- Ya firmada, la misma propuesta devuelve la firma guardada sin mandar nada; todavía «propuesto», se reenvía (la app responde lo mismo).
- **Tras recargar la página**, la promesa de antes ya no existe, pero la firma queda en `propuestas()`: para asentar el registro, volver a pasarlo por `autoridad.firmar` con el firmante (devuelve la guardada al momento), con el cuerpo idéntico (el mismo `t`): `{ ...JSON.parse(canonico), id }` lo da.
- Los textos de la interfaz (los códigos de arriba dichos en llano, «propuesto», «caducado sin firmar», «revocado», la huella) van en `carta/textos.js`, en ese encargo.

### El campo `libro` (Core AGRAM y Core StateArk, 17-11)

La propuesta lleva un campo **opcional** `libro`: el id del génesis del libro en el que se firma, 64 hex en minúsculas. StateArk aún no lo ha construido en su app ni en sus vectores. `proponer` (y el firmante) lo admite como opcional, lo valida si viene (`message_invalid` si no es 64 hex en minúsculas) y **solo lo manda si se le da**: sin él, el mensaje es exactamente el de los vectores de hoy.

## El armazón del service worker

Para que el emparejamiento funcione sin red desde la primera carga, habrá que añadir al `ARMAZON` de `sw.js` (este encargo no lo toca), cuando el encargo de pantalla importe el módulo:

```
'./carta/emparejamiento.js', './carta/nip44.js', './carta/chacha20.js'
```

y subir la `VERSION`. Lo que importan de `src/` (`evento.js`, `cripto.js`, `autoridad.js`, `vendor/noble-secp256k1.js`) ya lo guarda el service worker al primer uso, como el resto del núcleo.

## Los límites

- **Tamaños, antes de decodificar:** el texto del QR, 2048 caracteres (el SIP da unos 840); un mensaje del relé, 200 000 caracteres antes de `JSON.parse`; un payload de NIP-44, de 132 a 87 472 caracteres de base64 y de 99 a 65 603 bytes; `agente` 200, `nota` y `motivo` 2000 caracteres; el desafío del relé, 512.
- **El tamaño de una propuesta:** el rumor (con el canónico dentro) y el sello (con el rumor cifrado dentro) tienen que caber cada uno en 65 535 bytes de NIP-44. Por el doble envoltorio (el sello lleva el rumor cifrado en base64, y el relleno sube en trozos de 8 KB), el canónico de un registro cabe hasta unos 40 KB (40 489 caracteres sin escapes, medido; menos si lleva comillas o barras, que se escapan dentro del rumor), no 64: más grande, `message_too_large` y no se guarda nada.
- **La delegación:** la forma exacta (los ocho campos), instantes ISO con `Z`, `hasta` después de `desde` y como mucho 24 h entre los dos; si no, `delegation_invalid`.
- **El relé:** solo `wss://`, sin usuario ni clave en la URL. `ws://localhost` y `ws://127.0.0.1` solo con la opción `local` (pruebas).
- **Un solo emparejamiento vivo:** leer otro QR (de la misma app o de otra) sustituye al anterior; lo que quedaba «propuesto» pasa a «caducado» (`pairing_replaced`), porque la respuesta llegaría a una sesión que ya no se lee.
- **Revocada:** se acepta solo con la forma exacta, la firma de `larga` sobre el hash etiquetado `StateArk/Sesion/Revocacion/v1`, `larga` la de esta sesión y `sesion` la suya, y dentro de un sello de la app.
- **Lo que no prueba Node:** `almacenIndexedDB` y el `WebSocket` del navegador. Las pruebas usan un almacén en memoria y un relé y una app simulados; **nada ha hablado con un relé real ni con la app real**.

## Pruebas

`node --test --test-concurrency=2 test/chacha20.test.js` y `node --test --test-concurrency=2 test/emparejamiento.test.js`:

- ChaCha20: el cuarto de vuelta (§2.1.1), el bloque (§2.3.2), el cifrado (§2.4.2) y A.1 #1 del RFC 8439, y el cotejo con el `chacha20` de `node:crypto` en largos de 0 a 300 bytes.
- NIP-44 v2: todos los vectores oficiales (claves de conversación y de mensaje, largos con relleno, cifrar y descifrar, los largos de 65 535 bytes y los inválidos).
- StateArk: el QR (texto, lectura, huella y los ocho fallos con su código), el AUTH byte a byte, la revocación y su 7705, y los seis mensajes envueltos byte a byte (con su clave de usar y tirar, sus nonces y `aux` a cero) y abiertos; el remitente no los abre.
- Cada código del QR con sus casos; envolver y abrir al azar; un regalo para otra clave, de otro esquema o tocado se descarta; `libro` opcional.
- El flujo con relé y app simulados: emparejar, firma buena (también con `autoridad.firmar` de un registro de verdad), firma falsa, rechazo, caducidad, revocación buena y falsas, `pairing_refused`, reenvío con la misma respuesta, recarga, reconexión y olvidar.
- La clave de sesión no firma ningún otro kind; nada se escribe fuera del almacén inyectado y la privada no sale por la API.
