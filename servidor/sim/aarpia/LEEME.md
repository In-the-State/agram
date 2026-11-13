# AARPIA simulado (el transporte: relé Nostr, recibo de llegada, Blossom, autoridad del libro)

**Esto es una SIMULACIÓN.** Un relé Nostr y un Blossom en memoria (con libro persistente y autoridad opcionales), sin red de verdad. Se **sustituirá por AARPIA real** con la misma forma; quien lo usa (la carta, por las APIs de `eventos` y `archivos`) no cambia.

- **Origen:** copia del paquete `aarpia-transporte` de Core AARPIA (`C:/Users/acer/Documents/InTheState/aarpia/transporte`, git local), **commit fe7a2f9** (`src/`, `servidor.mjs` y este LEEME). Lo último de fe7a2f9: **eje inexistente = clave mala** (401, el mismo cuerpo `{ error: 'clave de lectura ausente o incorrecta', codigo: 'clave' }`) también en `GET /eventos/recibo` y `GET /eventos/sello` (#106, como `abrirEje` de AGRAM en 3eaf761); antes, `eje-desconocido` 404. Las pruebas del original están en `test/sim-aarpia.test.js`, con las rutas adaptadas.
- **Cambios respecto al original (solo estos):** no lleva `vendor/` (ni `Dockerfile`, `package.json` ni las pruebas de las copias). `src/servicio.js`, `src/nostr.js`, `src/recibo.js` y `src/archivos.js` importan directamente `servidor/supabase/funciones/` de este repo, y `src/autoridad.js` importa el núcleo vivo, `src/eje.js` de la raíz, en vez de la copia fijada por commit; así la simulación habla SIEMPRE la API y el núcleo vigentes de AGRAM, sin copia que se quede atrás. Por eso `NUCLEO` es aquí `{ commit: 'agram-repo' }` (la etiqueta que lleva el 7701 en `nucleo`) y no hay `vendor/revalidar.mjs` (revalidar con un commit de git: `src/revalidar.js` sí está, con la clase `Eje` que se le pase).
- **Para la carta:** `node servidor/sim/aarpia/servidor.mjs` (http://127.0.0.1:8788/eventos y /archivos); `GET /eventos/recibo?eje=…&id=…` da `{ instante, rele, firma, recibo }`, el reloj X.6.8.1 (lo pide `src/sincronia.js`); `GET /eventos/sello?eje=…&id=…` el sello (6.8.2) si el servicio tiene `sellador`.
- **No editar aquí** salvo esos imports. Si algo hay que cambiar, se pide a Core AARPIA y se vuelve a copiar.

## Lo que dice el original

Sprint 1 de In the State, fijado por Core AGRAM: lo que AARPIA da a AGRAM según `state/COORDINACION/CONTRATO_AGRAM_EXTERIOR.md`, **fingido en memoria**, en JavaScript puro, sin dependencias (Node ≥ 22). Sustituye a las funciones de Supabase de AGRAM el día que VG lo diga, **sin que la carta cambie**: habla su misma API.

```sh
npm test                 # (aquí: node --test test/sim-aarpia.test.js, 23 pruebas, sin red)
node servidor.mjs        # (aquí: node servidor/sim/aarpia/servidor.mjs) http://127.0.0.1:8788/eventos y /archivos  (--puerto, --host, --secreto, --espejo, --archivo, --autoridad)
```

Como módulo: `import { Rele, envolver, crearServicio, crearBlossom } from './src/index.js'`.

## Qué hay

| pieza | qué hace | contrato |
|---|---|---|
| `src/nostr.js` | eventos NIP-01: id, firma y verificación BIP-340 (la misma curva y la misma librería que AGRAM) | §1, §6 |
| `src/rele.js` | relé en memoria: acepta kinds 7700/7701, filtra por `ids`, `authors`, `kinds`, `#g #s #p #h #u…`, `since`, `until`, `limit`; suscripciones vivas con EOSE; **recibo de llegada 7701** firmado por el relé | §1, §2 |
| `src/sobre.js` | el sobre 7700 de un evento AGRAM: `g` id AGRAM, `s` sobre, `p` destinatarios (nombre → clave por el alta, sin el autor), `h` eje, `u` autor | §1 |
| `src/servicio.js` | la API de la función `eventos` (su `api.js`, copiado sin tocar) sobre el relé, más `GET /eventos/recibo?eje&id` → `{ instante, rele, firma, recibo }` (el reloj X.6.8.1) | §1, §2 |
| `src/blossom.js` | Blossom en memoria (BUD-01/02): `PUT /upload` con autorización 24242 firmada (t, x, expiración), `GET`/`HEAD`/`DELETE /<sha256>`; sirve con `CSP: sandbox`, `nosniff` y `attachment` para lo que no es imagen | §4 |
| `src/archivos.js` | la API de la función `archivos` (su `api.js`, sin tocar) sobre Blossom, **cifrando antes de subir** (AES-256-GCM, clave por eje): Blossom solo ve el cifrado; la carta sigue pidiendo `archivo:<sha256 del original>` | §4 |
| `servidor.mjs` | todo lo anterior por `node:http`; el Blossom también se ve en `/blossom/<sha256>` | |
| `src/autoridad.js` | **sprint 2: AARPIA como autoridad del libro.** Juzga cada evento con el núcleo de AGRAM fijado por commit (`eje.validar`, los `reason` canónicos de la época que el evento referencia). Si acepta, el 7701 lleva `nucleo` y `epoca`; si rechaza, responde `422 { error, id, reason, nucleo, epoca, rechazo }` y publica un **7703** firmado por la autoridad, con la causa y el evento dentro, que el autor recibe por `#p`. Se enciende con `crearServicio({ autoridad: new Autoridad() })`; sin ella, solo transporta | §7 |
| **libro persistente** | `crearServicio({ autoridad, archivo })` + `await abrir()`: el relé es también el **archivo que nunca purga** (una línea JSON por evento, en orden de llegada; al arrancar se verifica cada firma) y los ejes van en `<archivo>.ejes.json`. Tras reiniciar, el libro, los recibos, los rechazos y el juicio siguen igual. Nadie de fuera puede publicar un 7701 (solo el relé) ni un 7703 (solo la autoridad), y con autoridad un 7700 solo entra por el servicio, ya juzgado. Al restaurar y al revalidar solo cuenta como aceptado el 7700 cuyo recibo lleva la marca `nucleo` de la autoridad. Límite: quien pueda escribir el archivo a mano con un recibo firmado puede colar algo. Esto es la simulación: la seguridad del relé se trabajará en la AARPIA real. Las claves (la del relé incluida) van a StateArk (VG, 12-11) | §1, §7 |
| `src/revalidar.js` · `vendor/revalidar.mjs` | **revalidar antes de cambiar de núcleo** (§7, punto 4): vuelve a juzgar el libro entero en orden de llegada con el núcleo de otro commit (sacado a una carpeta temporal y borrado al acabar) y compara. Si cambia un veredicto, sale con 1 y dice cuál; si solo cambia el texto de un rechazo, es un aviso. `npm run nucleo -- <commit> --libro <archivo>` no copia el núcleo nuevo si la revalidación falla | §7 |
| `src/recibo.js` | **el recibo único de las tres casas** (`stateark.recibo@1`, B19; SIP 0 de StateArk) en el `content` de cada 7701 y 7703: «llegada» (sin autoridad, lo firma el relé), «aceptación» (lo firma la autoridad, con núcleo y época) y «rechazo» (la autoridad, con sus causas y el evento rechazado al lado, fuera del hash). Cada uno dice también lo que NO afirma. La implementación de referencia de StateArk los da por buenos, con la misma décupla, y detecta como equivocación una aceptación y un rechazo del mismo evento con el mismo núcleo y la misma época | §2, §7 |
| `src/espejo.js` | **el espejo hacia relés de verdad**: todo lo que el relé en memoria guarda (7700, 7701, 7703) se publica también en uno o varios relés Nostr por WebSocket (NIP-01), p. ej. el `strfry` de la casa VOE. Cola con reintentos y espera creciente, al menos una vez, en orden de llegada; el remoto deduplica por id. `crearServicio({ espejos: [url] })` o `node servidor.mjs --espejo ws://… --host 0.0.0.0`. Es la pieza para entrar en la red de la casa como andamio dicho (`DESPLIEGUE_AARPIA.md`) | §1 |
| **sellado de recibos** | `crearServicio({ sellador, lote })` con el sellador de `stateark/sim` (u otro con `sellar`, `prueba` y `verificar`): cada 7701 entra en un lote y el lote en un bloque. `GET /eventos/sello?eje&id` → `{ recibo, prueba, verificacion }`. Como el 7701 lleva `nucleo` y `epoca`, queda anclado con qué se juzgó cada evento (B22, VG 12-11). Minar es cosa del sellador | §2, §3 |
| `vendor/agram/` | (en el original) el contrato de AGRAM copiado byte a byte y el **núcleo** fijado por commit; aquí no están: se importan `servidor/supabase/funciones/` y `src/` de este repo | §7 |

## Qué cambia respecto a la función de Supabase (nada visible para la carta)

- `recibido` es el instante del **recibo 7701 firmado por el relé**, no la hora de Postgres.
- El sobre 7700 lo firma la **clave de transporte** del servicio, porque la carta, por HTTP, no manda su clave privada. Cuando la carta publique directamente en un relé, lo firmará el autor (acordado en el contrato §1); el módulo ya lo admite (`envolver({ privada })`).
- El orden es el de llegada al relé dentro del eje.

## Lo que no hace (todavía)

- No hay relé real ni red Nostr. Sin `archivo`, todo vive en memoria y se pierde al parar.
- El cifrado lo hace el servicio (la carta no cambia); en el sistema real lo hará la carta, con una clave que no salga del eje. Las claves por eje y el índice viven en memoria.
- `GET` autenticado en Blossom: [X] decidir VG.
- `node servidor.mjs` arranca sin autoridad (como lo usa AGRAM hoy).
