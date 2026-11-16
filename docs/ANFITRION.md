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
