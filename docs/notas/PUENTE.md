# El puente entre libros (A15, tramo 3, paso 2: la época)

Core AGRAM, 17-11. Diseño cerrado con VG: `agram-equipo/DISENO_PUENTE.md` (§3, §4, §5 y lo que contestó Core StateArk en el §7 bis). Este paso construye **la época 0**: cuatro plantillas, trece reglas de validez, la fila 8.9 y el origen de la línea en los enlaces; del núcleo, solo dos primitivas del BQL mínimo y el nombre de la serie forastera. El §6 (R, P y T como tokens) **no** se construye. Pruebas: `test/puente.test.js`. Ejemplo: `node ejemplos/puente.mjs`. Las fórmulas largas salen de `datos/epocas/puente.mjs` (`node datos/epocas/puente.mjs --escribir` y `npm run epocas`; una prueba vigila que cada regla lleva la suya). **Estado:** en la beta, sin aceptar.

## 1. La idea

Una sola pieza: **un registro de un libro, con su prueba de sello, llevado como dato dentro de un registro de otro libro** (la de «put a change in force», `GOBIERNO.md` §5). Sobre ella, tres usos: un registro cruza como tal («bring a record from another book»); una E cruza como token (se bloquea en el origen con la salida en el enlace, se trae ese bloqueo, el destino crea la serie forastera); un saldo cruza como prueba («declare a balance», traído como cualquier registro). Solo entre libros **enlazados** («open a private book here» en el grande, «this book hangs from» en el pequeño): las claves de línea del enlace son las que dan por buena la prueba.

## 2. Los enlaces: las claves y el origen de la línea

| Plantilla | Cambia | Posiciones |
|---|---|---|
| **open a private book here** | las claves admiten **0** (ninguna; por defecto) y el libro pasa a 1.0.0 | 1.0.0 el libro · **1.0.1 «anchor origin»** (opcional) · 1.1 dónde publica sus cabeceras (opcional) · 2 las claves de línea: hasta cuatro pares [nivel, clave] o 0 · 3 quién · 4 la acción |
| **this book hangs from** | anota también las claves de línea del grande y su origen | 1.0 el libro · **1.1 «line keys»** (0 por defecto) · **1.2 «anchor origin»** (opcional; con él, las claves) · 2 el elemento · 3 quién · 4 la acción |

- **Cero claves** (Core AGRAM 17-11 con Core StateArk): un libro pequeño sin sellador se anuncia sin claves; vale el último anuncio que las declare (`contrato.librosPrivados`, «vale el último»). De un libro anotado sin claves no se trae: no hay con qué comprobar sus cabeceras («bringing needs the line keys of the book»).
- **«anchor origin»**: el outpoint del ancla 0 de la línea del otro libro (`<txid de 64 hex>:<salida>`). Va junto al libro, cerrando su propia décupla (sin huecos). **No es una regla**: comprobar que el ancla de una prueba desciende de ese origen pide un nodo de Bitcoin («esta salida la gastó esta tx»), como el pago. Queda como un grado de la prueba: sin él, lo traído de ese libro se lee «sin comprobar el origen» (`leerTraido(...).origen` es null).
- Un enlace escrito antes de este encargo (el libro en 1.0 o en 1) se sigue leyendo (`contrato.librosPrivados`, `contrato.cuelgaDe`: se lee la primera hoja) pero **no sirve para traer**: el puente lee el libro en 1.0.0 y en 1.0. Se vuelve a escribir.

## 3. Las plantillas

Todas pagan su T (el coste de escribir, por posición). Los tres últimos parámetros son los de siempre: `criteria` (2), `who` (3, `=me`) y `actions` (4).

| Plantilla | Se lanza sobre | Ancla | Aro | Lanza | Payload | Mueve |
|---|---|---|---|---|---|---|
| **bring a record from another book** | un enlace del dueño del libro | el **9.8 del génesis** | `[6, 5]` | person | 1.0 el libro de origen (por defecto, el del enlace) · 1.1 el registro: 0 id, 1 autor, 2 sobre, 3 en, 4 t, 5 movimientos (su JSON canónico, texto), 6 su payload tal cual, 7 contexto (JSON canónico), 8 su firma si la lleva · 1.2 la prueba de sello (la décupla de la vía «cascada») · 1.3 el enlace (por defecto, X) | `write` |
| **send to another book** | un enlace | su 4 | `[4, 26]` | person | 1.0 el libro de destino (el del enlace) · 1.1 la serie: 0 su clave, 1 su emisor, 2 su denominación (si la tiene), 3 su registro atado en el libro donde nació · 1.2 cuánto · 1.3 a quién: su clave pública x-only | `lock` cuánto, de la serie, de quien envía, con la salida = el enlace |
| **receive from another book** | un «bring a record» que trajo un envío a este libro | su 4 | `[4, 27]` | person | 1 el envío traído (`=it`) | la ida: `mint` cuánto de la serie forastera para quien recibe; la vuelta: `release` cuánto de la serie de aquí, de quien recibe, con la salida = el enlace por el que se trajo |
| **declare a balance** | su propia alta | su 8 | `[8, 4]` | person | 1.0 la serie (su clave aquí) · 1.1 cuánto (por defecto, lo que tiene: disponible y bloqueado) | `write` |

- **Cuándo se ofrece**: traer, sobre los enlaces del dueño del libro; enviar, sobre un enlace a quien tiene E; recibir, a quien declara en su alta la clave que nombra el envío, una vez; declarar, sobre la propia alta. Decide la regla, no la oferta.
- **La serie forastera** (diseño §4.3): la misma serie, nombrada con el libro de origen. Su emisor es `<id del génesis del libro de origen>:<su emisor allí>` (`src/tokens.js`, `esEmisorForastero`): `E:<libro>:ana/plato@<registro>`. Ninguna identidad ni ningún emisor de este libro lleva «:», así que nadie de aquí la emite como suya. Su registro atado es el registro traído (el `bring a record`) del registro al que estaba atada en el origen. Se comporta como cualquier serie de su familia (se transfiere, se bloquea, se quema).
- **Por qué el 9.8 del génesis**: «no se trae dos veces» mira solo lo traído, y lo traído de varios enlaces (al rotar claves) queda en un sitio. Ninguna plantilla anclaba ahí.
- **Por qué «send» no lleva la familia ni dónde nació**: una plantilla es una décupla (diez parámetros como mucho). La familia se lee de la clave (su primera letra) y si la serie es forastera, de su emisor.

## 4. Las reglas

Trece reglas nuevas, en la cadena del 8 detrás de «a change comes into force with its proof». Cada una solo se mira con su acción en el 4 (el `or` es perezoso), salvo las dos que guardan lo bloqueado y la serie forastera, que miran toda transacción.

| Regla | Qué pide |
|---|---|
| **a record is brought from a linked book** | cuelga del 9.8 del génesis; su enlace (1.3) es un registro de este libro **del dueño** (el autor del génesis), nombra el libro de origen (1.0) y es el último de los suyos: un «open a private book here» sin otro posterior del mismo autor para el mismo libro en el mismo elemento, o un «this book hangs from» en el 9.5 del génesis sin otro posterior |
| **bringing needs the line keys of the book** | el enlace anota al menos un par [nivel, clave] |
| **a brought record is its body** | el id (1.1.0) es el SHA-256 de su cuerpo canónico (`src/evento.js`: autor, contexto, en, movimientos, payload, sobre, t), rehecho con `json` y `cat` |
| **a brought record comes with its proof** | la prueba es de la vía «cascada», su hoja es el id, su primera cabecera es del libro de origen (su 8) y hay un eslabón j, con los de 0 a j válidos (cabecera v2, camino «sip», firma con su propia clave: las piezas de «sealed»), que dice un nivel k ≥ `epoch.8.9.2`, con su grado a la altura del exigido en k (`epoch.7.6.5`, como «firm»), firmado por la clave que el enlace anota **para ese nivel k**. «sealed» entero no basta: sus claves de abajo no se miran y la prueba de otra línea pasaría |
| **a record is brought once** | ningún registro traído antes (en el 9.8 del génesis) trae el mismo id |
| **only the families of the bridge cross** | la familia de la serie (la letra de su clave) está en `epoch.8.9.1` y es la de lo que bloquea |
| **a send locks what it names** | se ancla en un enlace que nombra el libro de destino (otro); un solo bloqueo, de cuánto dice, de la serie de ese emisor y esa denominación, con la salida en el enlace, y nada más que su coste; el registro atado es el de la serie si es de aquí; si es forastera, **solo vuelve a su libro de origen** y el registro es el traído de su registro atado allí |
| **what is locked for another book is released only by its return** | una liberación o una transferencia con la salida en un enlace solo vale en un «receive from another book» |
| **a send is received once by whom it names** | se ancla en un registro traído que es un envío a este libro; quien lo escribe declara en su alta la clave a la que va; no se ha recibido antes |
| **what is received is what was sent** | la familia cruza aquí; la ida (el emisor sin «:»): una sola acuñación, cuánto se envió, para quien recibe, de la serie con emisor `<origen>:<emisor>` y la misma denominación; la vuelta (el emisor es `<este libro>:<emisor>`): una sola liberación, cuánto vuelve, de quien recibe, de la serie de aquí de ese emisor, denominación y registro, con la salida en un enlace al libro de origen; nada más |
| **only a receive mints a foreign series** | nadie acuña una serie forastera fuera de un «receive from another book» |
| **the tied record of E crossed before** | el requisito de E (si `epoch.8.9.3` lo nombra para E): la serie forastera de E queda atada al registro traído, del libro de origen, de su registro atado allí |
| **a declared balance is true** | quien declara tiene, de esa serie, al menos lo que dice (disponible y bloqueado, sobre el libro de antes) |

Tres reglas de E dejan fuera la serie forastera, que la crea su «receive» y no su emisor (que está en otro libro): **E is minted by and to its issuer**, **minting E needs own R issued** y **minting E needs P on its record**. Ninguna de las tres está en el suelo (7.9.6).

**Nunca se suelta más de lo que se bloqueó**: cada envío se recibe una vez; la vuelta suelta solo cuánto vuelve; la serie forastera solo la crea su recibir (no hay más forastera que la enviada) y el libro no suelta más de lo bloqueado con esa salida.

## 5. La fila 8.9, «bridge»

| Posición | Qué es | Nacimiento |
|---|---|---|
| 8.9.0 | `["bridge", ayuda]` | — |
| 8.9.1 | las familias que cruzan como token | `["E"]` |
| 8.9.2 | el nivel de firmeza que pide traer un registro (de `epoch.7.6.1`) | `4` |
| 8.9.3 | los requisitos de cada familia, en el orden de 8.9.1: nombres de reglas | `[["the tied record of E crossed before"]]` |

Abrir una familia es un cambio de época: añadirla a 8.9.1 y dar sus reglas en 8.9.3; el mecanismo no se toca. La regla del requisito de E se mira solo si 8.9.3 la nombra para E (`lookup(epoch.8.9.1, epoch.8.9.3, "E")`). **Ninguna de las cuatro posiciones se ha puesto en el suelo (7.9.6) ni entre las piezas de gobierno (7.9.7)**: decidirlo es de VG.

## 6. El núcleo: lo mínimo

- **`src/bqlm.js`**: dos primitivas puras de verificación (`docs/BQLM.md` §12). `json(x)`: la serialización canónica (`canonico`, la del id de un evento) de un texto, un número o una décupla del payload, en bytes. `text(b)`: el texto UTF-8 de unos bytes (la vuelta de `utf8`; ERROR si no son UTF-8 o están vacíos). Con `json` se rehace el cuerpo de un registro traído; con `text(cat(utf8(a), bytes("3a"), utf8(b)))` se nombra la serie forastera, y `text(utf8(salida))` lleva la salida de un movimiento a un texto que se despliega como el registro que nombra.
- **`src/tokens.js`**: `esEmisorForastero` y, en `validarMovimiento`, el emisor de una serie forastera de E lleva su «:» y su emisión puede ir a quien no es su emisor (lo deciden las reglas).
- **`src/contrato.js`**: `librosPrivados` lee el libro en 1.0.0 (y en 1.0, los de antes) y admite 0 claves; `cuelgaDe` lee el libro en 1.0 (y en 1).

## 7. Lo traído, leído

`leerTraido(eje, id)` (`datos/epocas/puente.mjs`; no es núcleo) → `{ libro, id, autor, t, payload, firme, enlace, origen }`: de qué libro, quién lo escribió allí, cuándo, qué decía, cuándo quedó en firme (la hora de la cabecera del primer eslabón a la altura de 8.9.2) y el origen de la línea que anota el enlace (null: «sin comprobar el origen»). En BQL, lo mismo está en el payload del registro traído: `(payload(X)).1.1.1` el autor, `.1.1.6` lo que decía. `registroComoDecupla(ev)` da el 1.1 de un registro para traerlo.

## 8. Coste

Medido en `test/puente.test.js` (presupuesto de la época: 10 000 ocupantes, 100 000 pasos y 2 000 000 bytes por evaluación), con una prueba de dos eslabones (la casa en el nivel 1, el sellador en el 4):

| Regla | Pasos | Ocupantes | Bytes |
|---|---|---|---|
| a record is brought from a linked book | 32 | 79 | 0 |
| bringing needs the line keys of the book | 11 | 31 | 0 |
| a brought record is its body | 27 | 34 | 1 577 |
| a brought record comes with its proof | 190 | 588 | 133 619 |
| a record is brought once | 3 | 4 | 0 |

La prueba con cuatro eslabones (el vector `prueba-cuatro-eslabones.json` de Core StateArk): 1 097 ocupantes y 268 134 bytes. Validar el registro entero (todas las reglas de la época) tarda unos 30-80 ms en esta máquina. Una prueba de sello en el payload son unas ochenta posiciones: su coste de escribir.

## 9. Límites que se saben

- **La vuelta suelta lo de quien lo bloqueó.** «Recibir» en el origen lo escribe quien nombra la vuelta y libera **lo suyo**: el suelo («nobody moves tokens of others») no deja soltar lo bloqueado de otro. Si la vuelta nombra a otra persona que la que envió, no hay nada suyo que soltar y no se recibe. Que lo bloqueado de ana pase a otro al volver tocaría el suelo: **pregunta abierta para VG**.
- **Solo enlaces del dueño.** Se trae solo por un enlace escrito por el dueño del libro de destino (decisión de Core AGRAM en el encargo): con los de cualquiera, alguien que abre un libro privado sobre un elemento suyo y anota sus propias claves fabricaría registros «de» un libro que ya está enlazado. El libro privado que abre otra persona necesita que el dueño escriba también el enlace. Si VG quiere otra cosa, es la regla «a record is brought from a linked book».
- **A igualdad de instante**, dos enlaces del dueño para el mismo libro se anulan (el BQL mínimo no ordena textos); `contrato.librosPrivados` desempata por id.
- **No se trae**: el génesis (no tiene «sobre»), un registro cuyo payload lleva referencias `{ ref }` (el suelo de las referencias ausentes rechaza el registro que lo trae) ni uno cuyo payload es solo una lista de hojas (anidado se lee como lista y `json` no rehace su forma).
- **La firma del registro traído no se comprueba**: la clave de su autor está en el otro libro; lo que dice que el otro libro lo aceptó es la prueba de sello de su línea.
- **El destino se fía de las reglas del origen**: lee el envío por su payload; que el bloqueo sea el que dice lo comprobó el origen («a send locks what it names»). Un origen con otra época podría no comprobarlo.
- **La serie forastera no lleva el contrato de la de origen** (divisible, caducidad, precio): nace con el de la época. Va en enteros, como toda E de plantilla.
- **Una serie forastera solo vuelve a su libro**; no se reenvía a un tercero.
- **El origen de la línea** no se comprueba aquí (diseño §7 bis): pide un nodo de Bitcoin.
- **La seguridad de un token que cruza es la del sello del libro de origen** (diseño §9): con grado local o en la red de pruebas, vale para enseñarlo y no para dinero. Un saldo declarado es verdad en su fecha.
- **Falta** (paso 3 del plan): enviar, traer y recibir desde la carta, entre los libros abiertos; la sincronía que traiga los registros y sus sellos de un libro a otro.
