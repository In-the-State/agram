# La época del libro de la guía (guía-libro 0)

La época propia del libro de la guía (VG 17-11 por Core State; `agram-equipo/DISENO_ZONAS_GUIA.md`, pieza 1): los botones de la cara (las zonas) y la guía mínima, con el diseño estricto de `ENCAJE_GUIA.md` (c). Hereda de la época 0 (su 6: `hereda`) y no la cambia. Pasa a la 0 al congelar, con la forma que tenga entonces, si VG lo confirma. No viaja con el núcleo: se escribe en el libro de la guía al nacer (`Eje.genesis({ epoca })`). No es `datos/epocas/guia/`, que es el registro de la guía del PV9.

| Archivo | Qué es |
|---|---|
| `guia-libro-0.raiz.json` | la raíz: lo propio y, donde hereda, `"<hereda>"` (la marca `{ ref: <id de la 0> }`); lo propio son solo sus dos plantillas y sus textos |
| `plantillas/*.json` | las dos plantillas de transacción: «a step of the guide» ([4, 29], en el 4 del elemento) y «a zone of the face» ([2, 13], en su 0). Las dos solo para el autor del elemento, en modo persona, y su 4 es `write`: no mueven nada más que el coste de escribir. Sin reglas ni plantillas de datos propias |
| `textos/es.json`, `textos/en.json` | los textos de la época por clave (van en el 9.4, detrás de los de la 0) |
| `generar.mjs` | el generador: `npm run epoca:guia-libro` (el de toda hija, `datos/epocas/hija.mjs`, el mismo que el de la época state) |
| `guia-libro-0.btml.json` | el resultado: `{ id, hereda, raiz, registros }`, la forma de `node be.mjs epoca --publicar` |
| `guia-libro-0.ids.json` | el id de la época, el de la 0 y los de sus registros |

Lo que escribe cada plantilla (la décupla manda sobre la colocación del diseño; `docs/CONTRATO.md` §12.8):

- **Un paso de la guía**: 0 el título; 1.0 la acción (nombre canónico) y 1.1 sus parámetros «etiqueta: valor»; 2 el porqué; 3 quién; 4 «a step of the guide»; 5.0 el libro donde se hace (id de su génesis, un dato; por defecto, este libro) y 5.1 el registro (id, un dato; sin él, el alta de quien sigue la guía).
- **Una zona de la cara**: 0 la etiqueta (1 a 40 bytes); 1.0 x, 1.1 y, 1.2 ancho, 1.3 alto (milésimas de la cara; toda a cero retira); 2 el criterio de cierre; 3 quién; 4 «a zone of the face»; 5.0 el libro del destino (por defecto, este) y 5.1 el registro, dos ids como datos. Para moverla o retirarla, la nueva se lanza sobre la vieja.

Las lecturas (`src/guia-libro.js`: `zonas`, `pasosDeGuia`, `guias`, `pasoHecho`, `sugerenciasDeGuia`) buscan las plantillas por su nombre en la época del libro, no por esta época: siguen valiendo si pasan a la 0. Se cambia la fuente y se regenera; `test/guia-libro.test.js` falla si el resultado no está al día con la fuente o con el id de la 0. Todo nombre lleva su 0 en inglés y su texto en español en `textos/es.json` (`sinTraducir('es', { epoca })` de `docs/sin-traducir.mjs` con esta época, limpio: lo comprueba la prueba). Nada real: es genérica.

Si algún día lleva plantillas de datos propias: el 9.2 se hereda por posición, así que van en un grupo (una décupla cuya cabecera dice «domain templates») en una posición libre detrás de las de la 0, como hace la época state (`docs/CONTRATO.md`, «las plantillas de dominio»).
