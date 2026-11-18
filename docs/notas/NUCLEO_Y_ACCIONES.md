# El núcleo y las acciones por su nombre (medida del 18-11)

Regla de VG: una acción (lo que el código llama «plantilla de transacción») es dato de la época, y el código no debe conocer ninguna por su nombre. La carta la vigila `test/lente-limpia.test.js`; el núcleo, `test/nucleo-limpio.test.js`, con el mismo método (`test/ayudas-lente.mjs`):

- **Nombres:** salen al ejecutar, con `plantillasDeTransaccion`, de la época 0 y de cada época hija (state, guia-libro, roadmap, cuenta). Son 122: 119 sin la cuenta, que añade 3 y ninguno sale en src/.
- **Qué cuenta:** solo una cadena literal entera igual al nombre.
- **Dónde se mide:** `src/*.js` y `src/condiciones/*.js`, sin `vendor`.

**Medida:** 41 nombres distintos, en 45 pares archivo y nombre. Desde el núcleo 6 (Core AGRAM 18-11), 35 en 38. Lo que falta se lee de X.4.9 y lo que piden las reglas en el camino, de X.9.8: «commit P» deja `acciones.js` y `motor.js`, y «attend» y «expire something mine» dejan `acciones.js`. Los finales del proceso son dato (`datos/provisional/finales.json`): «close with error», «expire» y «close by decision» dejan `motor.js` sin pasar al suelo.

**Clases:**
- **A, suelo:** la época 0 lo guarda en su suelo (`epoch.7.9.6`) o en sus piezas de gobierno (`epoch.7.9.7`), y la prueba lo comprueba en los datos. Es una lista cerrada: solo cambia con una decisión.
- **B, deuda:** el núcleo sabe por su nombre de una acción que solo existe porque la define una época. Solo encoge.

## A: suelo (14 nombres)

| Nombre | Dónde | Motivo |
|---|---|---|
| send to another book, bring a record from another book | acciones.js:64 | Puente: el suelo los guarda (7.9.6). Solo valen sobre un enlace que cuente |
| open a private book here, this book hangs from, withdraw a link | contrato.js:2821 | Los enlaces entre libros, guardados en 7.9.6. Las reglas del puente, que son suelo, los leen |
| receive from another book, open a private book here, this book hangs from | validez.js:412-414 | La vuelta del puente: excepción de «nobody moves tokens of others», que es suelo |
| a reserve | validez.js:427 | La reserva: excepción del mismo suelo. Su guarda «a reserve is spent as it says» está en 7.9.6 |
| declare a balance | suelo.js:307 | La declaración de saldo: a ese registro solo se le prueban las reglas del suelo (7.9.6) |
| propose a change, enact a change, put a change in force, withdraw a change, support a change, withdraw support | versiones.js:19-25 | Gobierno de la época: piezas de gobierno (7.9.7) |

## B: deuda (21 nombres; solo encoge)

| Nombre | Dónde | Motivo |
|---|---|---|
| second factor | acciones.js:1174-1175 | **Dudoso.** El segundo factor (SIP 0 de StateArk) por su acción y su lectura. ¿Es suelo de todo libro con guardián, o una acción de la 0 que el código no debería nombrar? |
| ask for more firmness | anclas.js:19 | La acción de la 0 que pide más firmeza |
| this goes after, close, deliver | cadenas.js:17 | La lectura de cadenas: relación de la época del roadmap y cierre y entrega de la 0 |
| declare capacity or threshold | contrato.js:1403 | Capacidad: la plantilla y su parámetro, por nombre |
| change cohort | contrato.js:2255 | Cohorte: la plantilla, por nombre |
| connect an account, grant the permission, renew the permission, update the balance | contrato.js:2403-2405 | La cuenta del banco. Su regla no es suelo |
| add a parent, remove a parent, set the kind of owner, set a custody default | contrato.js:2516-2519 | Padres y custodia. Su regla no es suelo |
| retouch a text | contrato.js:3390 | Los retoques de textos. Su regla no es suelo |
| remove someone | elegibles.js:82 | La acción de quitar (pv3) |
| a zone of the face, a step of the guide | guia-libro.js:22 | Las dos plantillas de la época guia-libro |
| anchor here | nota-detalle.js:31 | La nota de detalle del volcado: la convención de la plantilla más común de la 0 |
| remove someone, admit someone | tres.js:31-33 | Las cajas del 3: admitir y quitar por su nombre |

Los dudosos van en B hasta que Core AGRAM decida. Si alguno pasa a A, tiene que estar antes en el suelo de la época (7.9.6 o 7.9.7): la prueba lo exige.
