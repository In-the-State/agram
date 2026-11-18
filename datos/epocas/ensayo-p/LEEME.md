# La época de ensayo de P (ensayo-p 0)

Época hija de la 0, de ensayo (VG 18-11, por Core State): el criterio de una persona sobre un registro son diez medidas, el reparto de su P entre los diez puntos de vista del registro, y pasar P de un punto de vista a otro del MISMO registro no pierde nada (un número de la época). La 0 no se toca. No viaja con el núcleo: se escribe en un libro al nacer (`Eje.genesis({ epoca })`).

| Archivo | Qué es |
|---|---|
| `ensayo-p-0.raiz.json` | la raíz: diez etiquetas en el 1.1.1 (0 «de representación» … 9 «de camino») y el paso lateral `[1]` en el 1.1.4.4; lo demás, `"<hereda>"` |
| `reglas/p-is-repositioned-one-step-at-a-time.json` | sustituye (mismo 0) a la de la 0: una rama más, el paso entre dos puntos de vista del mismo registro por `first epoch.1.1.4.4` |
| `textos/es.json`, `textos/en.json` | el texto de esa regla |
| `generar.mjs` | `node datos/epocas/ensayo-p/generar.mjs [--comprobar]` (el de toda hija, `datos/epocas/hija.mjs`) |
| `ensayo-p-0.btml.json`, `ensayo-p-0.ids.json` | el resultado |

Pruebas: `test/ensayo-p.test.js`. Nada real.
