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

## La pantalla

Encargo «la pantalla del emparejamiento por QR» (camino B, parte de A25; Core AGRAM, 17-11).

**El emparejamiento hace de guardián.** `carta/guardian-emparejado.js` (sin DOM) hace sobre una instancia de `Emparejamiento` un objeto con los verbos del guardián de `docs/ANFITRION.md`: `cuentas()` da la única cuenta, la de `larga` (`estado().app`, que es la clave de la cuenta: dato de frontera de Core StateArk, 17-11); `crearCuenta` no crea clave y da esa misma; `firmar({ publica, canonico, id, segundoFactor, libro })` es `proponer` con el segundo factor que la carta ya calcula y el `libro` (el id del génesis del libro abierto, o el del propio génesis), y resuelve con la firma de la app; `sesion(publica)` (o `sesion({ publica })`) está abierta si el emparejamiento sigue en plazo, la app lo aceptó y `publica` es `larga`. No ofrece `criterios`, `clavesDeLinea`, `pedirSesion` ni `firmarServicio`, que la carta ya trata como opcionales. `carta/anfitrion.js` exporta `guardian` como enlace vivo: es el del anfitrión si lo hay y, si no, el adaptador mientras hay emparejamiento vivo (`usarGuardian`, `guardianDeLaCarta`); con anfitrión no se ofrece emparejar.

**Los códigos.** Con otra `publica` el adaptador rechaza con `unknown_account` sin mandar nada. Cada fallo lleva `code`, el del contrato del guardián que mejor dice lo ocurrido (la carta ya sabe tratarlo), y `emparejamiento`, el original, que `claveDelError` dice en llano (`emparejarRechazo_<code>` en `carta/textos.js`; uno desconocido de la app, `emparejarRechazoOtro`, como `cancelled_by_holder`):

| Código del emparejamiento | De quién | Código del contrato del guardián |
|---|---|---|
| `cancelled_by_holder` | la app | `cancelled_by_holder` |
| `unknown_account` | la app (o la carta, con otra `publica`) | `unknown_account` |
| `id_mismatch` | la app o la carta | `id_mismatch` |
| `canonical_invalid` | la app o la carta | `id_mismatch` |
| `author_mismatch` | la app | `unknown_account` |
| `message_invalid` | la app o la carta | `id_mismatch` |
| `session_expired` | la carta | `session_closed` |
| `session_revoked` | la carta | `session_closed` |
| `pairing_refused` | la carta | `session_closed` |
| `pairing_forgotten` | la carta | `session_closed` |
| `pairing_replaced` | la carta | `session_closed` |
| `no_pairing` | la carta | `session_closed` |
| `proposal_discarded` | la carta | `cancelled_by_holder` |
| `message_too_large` | la carta | `id_mismatch` |

Los del QR (`qr_invalid`, `relay_invalid`, `delegation_invalid`, `session_mismatch`, `scope_invalid`, `session_expired`) tienen su frase (`emparejarQR_<code>`); otro fallo al emparejar, «No se ha podido emparejar», con el detalle en la consola.

**La pantalla** (`carta/emparejar.js`, en su propio contenedor al lado de la carta, para que un repintado no le quite el vídeo):

- **Emparejar**: en la pantalla de arranque sin anfitrión («Emparejar con la app») y en el aviso de una cuenta sin clave que solo se lee. Con la cámara si hay `BarcodeDetector` y `getUserMedia` (`leerConCamara({ detector, video })`, aislada y probada con dobles; la cámara se suelta al leer, al cancelar, al cerrar el diálogo, al ocultarse la página y al salir); siempre, pegando el texto. Lo leído pasa tal cual a `emparejar(texto)`; nada del QR se pinta como HTML, y de un rechazo de la app solo se dice su código en llano, nunca su motivo.
- **Tras leer**: «Emparejada con la app hasta las HH:MM», la huella corta y «Esperando a que la app acepte…» hasta el aviso `emparejada`. Aceptada y sin ningún libro de la clave de la app en este dispositivo: «Abrir un libro con la clave de la app» (el `crearCuenta` de siempre con el guardián; el génesis lo firma la app), «Entrar en un libro al que me han invitado» y «Restaurar una copia». El mismo botón de entrar por invitación sale en la pantalla de arranque sin cuenta mientras el emparejamiento esté vivo y aceptado. Quien entra es entonces la cuenta de la app (su clave larga, `guardian: true`, sin privada; `carta/invitado.js quienEntra`). Su alta se propone a la app por el guardián emparejado, con el `libro` del génesis del libro bajado y con diálogo. Si su alta ya está, «Añadirlo a tus libros» guarda la entrada con `guardian: true` sin pedir firma. El diálogo se pinta sobre el arranque, y al cerrarlo sin entrar se vuelve a él.
- **El libro de cuenta** (Carril F, 18-11; agram-equipo/LIBRO_DE_CUENTA_ALOJADO.md §6 y §9): la carta anuncia en `hola` la época de cuenta (`cuenta: { epoca }`, el id de `src/epoca-cuenta.js`); si `emparejada` trae `cuenta: { epoca, permiso: { hasta } }`, se guarda con la sesión y `estado().cuenta` lo dice. Aceptada, sin libro de la clave de la app y con el permiso vivo, el diálogo se cierra y se va derecho al formulario de nombre e idioma («Tu cuenta, con la app», con «Entrar en un libro al que me han invitado» y «Restaurar una copia» debajo). Al crear, `genesisDeCuenta` (`carta/guardian-emparejado.js`) pide las claves (`pedirClaves`) y el génesis nombra la época de cuenta por su id (un registro) con `eje` y `next` en su contexto: la app lo firma sin segundo diálogo. Las claves se comprueban al llegar: `eje` ha de ser el hex del SHA-256 de los 32 bytes de la pública x-only `gobierno` (no del texto hex) y `next`, 64 hex; si no cuadran, `keys_invalid`, como si no hubiera claves (`clavesCuadran`). Con permiso y sin claves (no cuadran, rechazo o 60 s sin respuesta, `no_answer`) **no hay génesis**: nada se propone y el formulario dice «La app no ha dado las claves de tu cuenta… Actualiza la app o vuelve a emparejar» y queda para reintentar. Sin permiso (caducado, o una app que no lo da), el génesis nace igual por id, sin ellos, y la app saca su diálogo. Una app v1, que valida `hola` con claves exactas, responde al `hola` con `cuenta` un `rechazo` `message_invalid` con el id de la sesión, sin revocarla: la carta reenvía `hola` sin `cuenta` una sola vez y la sesión sigue como v1 (`v1` guardado con ella; sin permiso, `estado().cuenta` nulo), por el camino sin permiso. Lectura, escritura y contenido, que también da `claves`, solo viven en memoria. `firmarGobierno` (`gobierno` → `firma_gobierno`) existe, sin uso todavía. Vectores para StateArk: `test/vectores/genesis-de-cuenta.json`.
- **La línea fija**, abajo: hasta qué hora, la huella, la conexión con el relé (`conectada`, «sin conexión con el relé», «el relé no acepta esta sesión»), «Leer otro QR» y «Olvidar el emparejamiento» (`olvidar()`; dice que se borra en este navegador y que para cortarlo del todo hay que revocarlo en la app). Leer otro QR con propuestas esperando pregunta antes y después dice cuántas han caducado.
- **Lo propuesto**: «Propuesto: confírmalo en la app» mientras algo espera, sin bloquear la carta; la lista «Pendiente de la app» con cada propuesta, su estado (`propuesto`, `firmado`, `rechazado` con su motivo llano, «caducado sin firmar», `revocado`), «Volver a pedir» (`reenviar`, solo si sigue `propuesto` en la sesión viva) y «Descartar» (`descartar`).
- **Tras recargar**: `asentarFirmadas` pasa cada propuesta `firmado` de este libro que aún no está en él por `autoridad.firmar` con el cuerpo idéntico (`{ ...JSON.parse(canonico), id }`) y un firmante que da la firma guardada (el núcleo la vuelve a comprobar con `publica`), la añade con `eje.anadir` y la descarta; una que ya está, solo se descarta; nunca dos veces. Las propuestas de esta misma página las asienta su propio flujo.
- **El almacén** es `almacenIndexedDB()`: `cargar()` al abrir la carta (antes de abrir la cuenta, para que su guardián ya esté), `cerrar()` al cerrar la página (`pagehide`; al volver de la caché del navegador, `cargar()` otra vez).

**Las cuentas.** Las entradas sin clave (`guardian: true`) cuya `publica` es `larga` firman por el emparejamiento; con otra `publica` siguen en solo lectura con «la app emparejada guarda otra clave»; sin emparejamiento (o al caducar, con `revocada` o al olvidar), solo lectura con «Emparejar con la app» o «Volver a emparejar». Con una cuenta del navegador abierta, «Un libro nuevo con mi clave» no pasa por la app.

**Lo no comprobado**: nada se ha visto en un navegador ni ha hablado con un relé real ni con la app real; `almacenIndexedDB`, la cámara y el `WebSocket` del navegador no se prueban en Node.

## El armazón del service worker

Para que el emparejamiento funcione sin red desde la primera carga, habrá que añadir al `ARMAZON` de `sw.js` (ni este encargo ni el de la pantalla lo tocan) lo que la carta importa ya desde el encargo de pantalla:

```
'./carta/emparejamiento.js', './carta/nip44.js', './carta/chacha20.js', './carta/guardian-emparejado.js', './carta/emparejar.js'
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
