# La época de la clase `state` (state 0)

La época de los nodos de la clase `state`: un nodo leído como un eje (VG 16-11, #124; `docs/EPOCA_STATE.md`). Hereda de la época 0 (su 6: `hereda`) y no la cambia. No viaja con el núcleo: se escribe en el libro del eje del nodo al nacer.

| Archivo | Qué es |
|---|---|
| `state-0.raiz.json` | la raíz: lo propio y, donde hereda, `"<hereda>"` (la marca `{ ref: <id de la 0> }`) |
| `reglas/*.json` | dos reglas que sustituyen a las de la 0 con el mismo nombre: «second factor» y «attention has a price» |
| `plantillas/*.json` | las 32 plantillas de transacción (las altas, el camino, el criterio, las operaciones, el recibo) |
| `textos/es.json`, `textos/en.json` | los textos de la época por clave (van en el 9.4, detrás de los de la 0; mandan sobre los de la 0) |
| `generar.mjs` | el generador: `npm run epoca:state` |
| `state-0.btml.json` | el resultado: `{ id, hereda, raiz, registros }`, la forma de `node be.mjs epoca --publicar` |
| `state-0.ids.json` | el id de la época, el de la 0 y los de sus registros |

Se cambia la fuente y se regenera; `test/epoca-state.test.js` falla si el resultado no está al día con la fuente o con el id de la 0. Todo nombre lleva su 0 en inglés y su texto en español en `textos/es.json` (`docs/sin-traducir.mjs` con esta época, limpio). Nada real: es genérica.
