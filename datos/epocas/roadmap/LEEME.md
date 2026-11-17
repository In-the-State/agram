# La época del libro del roadmap (roadmap 0)

La época propia del libro del roadmap (Core AGRAM 17-11, decidido con VG): las dependencias entre tareas como relación de verdad y el 7 como cadenas. Hereda de la época 0 (su 6: `hereda`) y no la cambia. No viaja con el núcleo: se escribe en el libro al nacer (`Eje.genesis({ epoca })`).

| Archivo | Qué es |
|---|---|
| `roadmap-0.raiz.json` | la raíz: lo propio y, donde hereda, `"<hereda>"`. Lo propio: en el 9.2, un grupo en la posición 8 (su cabecera dice «domain templates») con las plantillas de datos «task» y «previous tasks»; en el 8.7.1, su propia fila del 7 (forma `cadenas`, mide «this goes after»), que sustituye a la de la 0 por su nombre |
| `plantillas/this-goes-after.json` | «this goes after» ([7, 6]): la escribe el autor de una tarea, en su 2.6; 1 cuántas anteriores, 6 sus referencias (como mucho 30); manda la última; su 4 es `write` |
| `reglas/a-task-does-not-go-after-itself.json` | una tarea no va después de sí misma |
| `textos/es.json`, `textos/en.json` | los textos de la época por clave (van en el 9.4, detrás de los de la 0) |
| `generar.mjs` | el generador: `npm run epoca:roadmap` (el de toda hija, `datos/epocas/hija.mjs`) |
| `roadmap-0.btml.json` | el resultado: `{ id, hereda, raiz, registros }`, la forma de `node be.mjs epoca --publicar` |
| `roadmap-0.ids.json` | el id de la época, el de la 0 y los de sus registros |

La lectura, `src/cadenas.js` (`docs/CONTRATO.md` §12.10; el porqué, `docs/notas/CADENAS.md`), busca la plantilla por su nombre en la época del libro. Se cambia la fuente y se regenera; `test/cadenas.test.js` falla si el resultado no está al día con la fuente o con el id de la 0. Todo nombre lleva su texto en español (`sinTraducir('es', { epoca })`, limpio). Nada real: es genérica.
