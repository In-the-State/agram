# El anfitrión

El **anfitrión** es la app que lleva la carta dentro (hoy, la app de escritorio de StateArk, que empaqueta la carta sin tocarla). Le deja un **firmante** para el segundo factor (`docs/CONTRATO.md` §12.4 bis): en el navegador no hay clave de la cosa titular, y la app sí la custodia. La carta no nombra a ninguna app en su código: el contrato es genérico.

## El contrato

Antes de cargar la carta, el anfitrión deja un objeto congelado en `globalThis.__AGRAM_ANFITRION__`:

```
__AGRAM_ANFITRION__ = Object.freeze({
  firmante(cosa) → función firmar | null   (puede ser una promesa)
})
```

- `firmante(cosa)` recibe la identidad de la cosa titular (hex) y devuelve el `opciones.firmar` de `acciones.autorizar`, o `null` si el anfitrión no tiene la clave de esa cosa. Qué clave de su custodia usa para cada cosa es asunto del anfitrión, no de la carta.
- Ese `firmar({ canonico, id, propuesta })` recibe el cuerpo canónico de la autorización (su SHA-256 es `id`), su `id` y `propuesta`, el cuerpo canónico del registro que se autoriza (su SHA-256 es el id de la propuesta, el `sobre` de la autorización: el guardián comprueba que cuadra y enseña al titular qué autoriza de verdad). Devuelve la firma BIP-340 del `id` (64 bytes en hex) o `{ id, firmante, firma }`; si ese `id` no es el del registro, no vale.

Ejemplo, para una app cuya custodia nombra sus claves:

```
globalThis.__AGRAM_ANFITRION__ = Object.freeze({
  firmante: (cosa) => custodia.firmante('cartera', cosa),
});
```

## Qué hace la carta

- `carta/anfitrion.js` lee el global **una vez**, al cargar; después nadie lo cambia. Si no es un objeto con `firmante` función, no hay anfitrión y la carta queda exactamente como sin él.
- Lo por autorizar del 6 de mi alta (`contrato.porAutorizar`) lleva al final de la línea un botón **«autorizar»** (`data-autorizar="<id del registro>"`) solo si hay anfitrión, la línea no está desbordada y alguna **cosa mía** falta de verdad en ese registro (sus `faltan` cruzados con mis cosas, no solo `titular`).
- Al pulsarlo, por cada cosa mía que falta pide `firmante(cosa)`: sin firmante, el aviso «la app no tiene la clave de <cosa>»; con él, `acciones.autorizar(eje, id, cosa, { firmar, idioma })` y, si vale, el registro se asienta por el camino de siempre (`eje.anadir`, guardar y sincronizar) y se repinta: deja de estar por autorizar y su estación pasa a «ejecutada». Si no vale, sus motivos salen en el aviso. Mientras firma, el botón está inactivo («autorizando…»).
- Nada que venga del anfitrión se pinta como HTML (solo texto escapado), y un error suyo es un aviso: no rompe la carta.

Pruebas: `test/carta-anfitrion.test.js`.

## La cuenta en el guardián (camino B)

Dos caminos de alta (VG 17-11). **A**, el de siempre: la cuenta nace en la carta y su clave privada vive en el navegador. **B**: la cuenta nace en el guardián de StateArk y la carta firma TODO con él; la carta nunca ve la clave privada. La carta propone sin firmar y el guardián firma con la clave de la propia cuenta. La época no cambia, ni cómo se firma: el mismo BIP-340 sobre el mismo id.

### Lo que ofrece el núcleo

- **Un firmante donde iba la clave privada.** En todo lo que firma un registro o una prueba de posesión con una clave privada, ese mismo argumento puede ser una función con la forma del firmante de `acciones.autorizar`:

  ```
  firmar({ canonico, id }) → firma en hex | { id, firma }      (puede devolver una promesa)
  ```

  `canonico` es el cuerpo canónico del registro (su SHA-256 es `id`). Vale en `autoridad.firmar(ev, firmante, autor, { publica })`, `autoridad.firmarPosesion(ev, identidad, firmante, { publica })`, `Eje.genesis({ …, clave, privada: firmante })`, `eje.escribir(datos, firmante, { identidad: firmante })`, `eje.invitar({ …, privada: firmante })`, `eje.aceptar(inv, { publica, privada: firmante })`, `escritura.escribirDesde` y `escribirSalida`, `bases.escribirBase({ …, privada: firmante })`, `motor.consolidar` y `motor.registrar`. Con una clave privada, todo sigue igual, byte a byte.
- **El núcleo no se fía del firmante.** Antes de aceptar lo que devuelve comprueba que es una firma de 64 bytes en hexadecimal, que el `id`, si lo trae, es el del registro, y que la firma verifica con la clave pública que debe firmar cuando el núcleo la conoce: en el génesis, la `clave` que declara; en `eje.escribir`, la del autor en el eje o, en su propia alta, la que el alta declara; en la prueba de posesión, la clave declarada para esa identidad. Si no, o si el firmante lanza o rechaza, lanza un error claro (que conserva el `code` del rechazo: `session_closed`, `cancelled_by_holder`, `id_mismatch`, `unknown_account`…) y **nada entra en el libro**.
- **El génesis, entero o nada.** Con la época 0 del código, `Eje.genesis` firma el génesis y, si hay `emision`, la transacción de emisión (con una época escrita, además la raíz de la época y sus registros). Si una firma falla a mitad, el génesis lanza y no devuelve ningún eje.
- **Un solo firmante para todo.** `acciones.autorizar` (`opciones.firmar`) ya recibe `({ canonico, id, propuesta })`: el mismo firmante le vale (ignora o lee `propuesta`). `acciones.transaccion` (`opciones.firmar`), `acciones.autoejecutar`, `local.englobar` y `Sincronia` (`firmar`) piden en cambio `(evento) → evento firmado`: `autoridad.firmanteDeEventos(firmante, { publica })` la hace del firmante, con las mismas comprobaciones.
- **La firma del servicio.** `pago.pagoHttp` (y `pago.deConfiguracion`) llama a `firmar(idHex, evento)`: además del id, el evento NIP-98 entero sin firmar, para que el guardián no firme un id suelto y recalcule su id. Fuera de los registros y de esto, el núcleo no firma nada con la clave de la cuenta (`Sincronia` solo firma registros con su `firmar`, y el sello solo verifica).

### El contrato del anfitrión (acordado entre Core AGRAM y Core StateArk, 17-11)

El anfitrión añade al objeto `__AGRAM_ANFITRION__`:

```
crearCuenta({ nombre }) → { publica }                       abre la sesión en el mismo diálogo
cuentas() → [{ nombre, publica }]                           en las importadas, `nombre` es la identidad del alta: se casa por `publica`
firmar({ publica, canonico, id, segundoFactor }) → { id, firma }   la prueba de posesión de un alta es esa misma firma
firmarServicio({ publica, evento }) → firma                 evento NIP-98 sin firmar; el guardián recalcula su id
sesion(publica) → { abierta, caduca }
criterios({ publica, registros }) → { aceptados }           opcional; registros = [{ canonico, id, firma }]; sin sesión
```

Los errores, como rechazo con `code`: `session_closed`, `cancelled_by_holder`, `id_mismatch`, `unknown_account`. Dentro de una sesión abierta el guardián firma los registros corrientes sin diálogo; con `segundoFactor` verdadero abre siempre su diálogo.

Pruebas del núcleo: `test/firmante.test.js`.

### Qué hace la carta (camino B)

- `carta/anfitrion.js` detecta el camino B (`guardian`) cuando el anfitrión ofrece `crearCuenta`, `cuentas`, `firmar` y `sesion`; sin ellos todo sigue por el camino A, como hoy.
- Con camino B, crear una cuenta pide la pública al guardián y todo lo de su alta se firma con `firmanteDeCuenta`: `({ canonico, id }) => guardian.firmar({ publica, canonico, id, segundoFactor })`. En el navegador no hay clave privada: la cuenta lleva `guardian: true` y no hay `agram.clave.<alta>`. Al abrirla, si `cuentas()` no trae su pública (o no hay guardián), se abre solo para leer y lo dice.
- `segundoFactor` lo calcula la carta con la lectura «second factor» de la época sobre la candidata (la misma de `acciones.transaccion`); si no puede, verdadero.
- Lo automático (la sincronía, seguir el camino) consulta antes `sesion(publica)`: cerrada, no firma y deja un aviso persistente con el botón «abrir la sesión», que pide una firma con un gesto. Lo que se pide con un gesto se intenta siempre. Lo que solo se mira (el camino del árbol, previsualizar) no se le pide al guardián.
- El servicio de pagos firma con `firmarServicio`. La copia de seguridad no lleva clave privada (la cuenta, el eje y la marca; la clave de lectura, cifrada con la frase como hoy).
- Los rechazos se dicen en llano (`carta/textos.js`, `guardian…`); el detalle de un fallo desconocido, en la consola.

Pruebas: `test/carta-guardian.test.js`.
