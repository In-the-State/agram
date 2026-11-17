# El puente entre libros (A15, tramo 3, paso 2: la época)

Core AGRAM, 17-11. Diseño cerrado con VG: `agram-equipo/DISENO_PUENTE.md` (§3, §4, §5 y lo que contestó Core StateArk en el §7 bis). Este paso construye **la época 0**: cuatro plantillas, trece reglas de validez, la fila 8.9 y el origen de la línea en los enlaces; del núcleo, solo dos primitivas del BQL mínimo y el nombre de la serie forastera. El §6 (R, P y T como tokens) **no** se construye. Pruebas: `test/puente.test.js`. Ejemplo: `node ejemplos/puente.mjs`. Las fórmulas largas salen de `datos/epocas/puente.mjs` (`node datos/epocas/puente.mjs --escribir` y `npm run epocas`; una prueba vigila que cada regla lleva la suya). **Estado:** en la beta, sin aceptar. **Arreglos tras la revisión de seguridad** (encargo «arreglos del puente», Core AGRAM 17-11; `test/revision-puente.test.js`, PH1 a PH6): la primera cabecera de la prueba la firma la clave que el enlace anota para su nivel, lo enviado a otro libro no se declara aquí, la declaración es verdad también tras su propio registro, un enlace se retira (§2 bis) y lo traído cuyo contexto o movimientos no son su JSON canónico se lee «no fiable» (§7). **Segunda vuelta** (encargo «el puente, segunda vuelta», VG 17-11; `test/puente-2.test.js`): la vuelta libera a favor de otra persona, quien creó un libro lo enlaza con su génesis y las reglas que guardan el puente pasan al suelo (§10).

## 1. La idea

Una sola pieza: **un registro de un libro, con su prueba de sello, llevado como dato dentro de un registro de otro libro** (la de «put a change in force», `GOBIERNO.md` §5). Sobre ella, tres usos: un registro cruza como tal («bring a record from another book»); una E cruza como token (se bloquea en el origen con la salida en el enlace, se trae ese bloqueo, el destino crea la serie forastera); un saldo cruza como prueba («declare a balance», traído como cualquier registro). Solo entre libros **enlazados** («open a private book here» en el grande, «this book hangs from» en el pequeño): las claves de línea del enlace son las que dan por buena la prueba.

## 2. Los enlaces: las claves y el origen de la línea

| Plantilla | Cambia | Posiciones |
|---|---|---|
| **open a private book here** | las claves admiten **0** (ninguna; por defecto) y el libro pasa a 1.0.0 | 1.0.0 el libro · **1.0.1 «anchor origin»** (opcional) · 1.1 dónde publica sus cabeceras (opcional) · 2 las claves de línea: hasta cuatro pares [nivel, clave] o 0 · 3 quién · 4 la acción |
| **this book hangs from** | anota también las claves de línea del grande y su origen | 1.0 el libro · **1.1 «line keys»** (0 por defecto) · **1.2 «anchor origin»** (opcional; con él, las claves) · 2 el elemento · 3 quién · 4 la acción |

- **Cero claves** (Core AGRAM 17-11 con Core StateArk): un libro pequeño sin sellador se anuncia sin claves; vale el último anuncio que las declare (`contrato.librosPrivados`, «vale el último»). De un libro anotado sin claves no se trae: no hay con qué comprobar sus cabeceras («bringing needs the line keys of the book»).
- **«anchor origin»**: el outpoint del ancla 0 de la línea del otro libro (`<txid de 64 hex>:<salida>`). Va junto al libro, cerrando su propia décupla (sin huecos). **No es una regla**: comprobar que el ancla de una prueba desciende de ese origen pide un nodo de Bitcoin («esta salida la gastó esta tx»), como el pago. Queda como un grado de la prueba: sin él, lo traído de ese libro se lee «sin comprobar el origen» (`leerTraido(...).origen` es null).
- **Las claves que hacen falta** (PH1): para traer, el enlace ha de anotar la clave del nivel de la **primera cabecera** de la prueba (la de la casa del otro libro, nivel 1 en el ejemplo), no «alguna clave»: un enlace que solo anota la de arriba (nivel 4) no sirve para traer. Los enlaces del ejemplo anotan las dos: `[[1, casa], [4, sellador]]`.
- Un enlace escrito antes de este encargo (el libro en 1.0 o en 1) se sigue leyendo (`contrato.librosPrivados`, `contrato.cuelgaDe`: se lee la primera hoja) pero **no sirve para traer**: el puente lee el libro en 1.0.0 y en 1.0. Se vuelve a escribir.

## 2 bis. Rotar una clave y retirar un enlace (PH4)

- **Vale el último** enlace del dueño para ese libro, de cualquiera de los dos tipos, **en el mismo elemento o en el 9.5 del génesis**: uno posterior (o del mismo instante) allí retira el anterior. El mismo elemento: para un «open a private book here», lo que cuelga de su elemento; para un «this book hangs from» (que vive en el 9.5 del génesis), el 9.1 del génesis. Así, rotar escribiendo el enlace nuevo **en el mismo elemento** o un «this book hangs from» en el génesis retira el viejo.
- **Un enlace nuevo en otro elemento no retira el viejo**: la regla no recorre el libro entero. Al rotar en otro sitio, se retira el viejo.
- **Retirar un enlace**: la plantilla nueva **«withdraw a link»** («retirar un enlace»), que se lanza sobre el propio enlace y ancla en su 4. Solo se le ofrece al autor del enlace, y una vez; solo cuenta la que escribe el autor del enlace (lo que cuelgue otro de él no lo retira). Un enlace retirado no vale para traer («a record is brought from a linked book») ni para enviar («a send locks what it names»). Coste acotado: se mira lo que cuelga del enlace (`down`), no el libro. Las plantillas «close…» no servían tal cual: «close» dice que lo anunciado ha pasado y solo se ofrece sobre un proceso.
- **El contrato dice lo mismo**: `contrato.librosPrivados` da por libro el último de quien lo abrió en ese elemento, si su autor no lo retiró ni escribió después, para ese libro, un enlace en el 9.5 del génesis; `contrato.cuelgaDe` da null si el último «this book hangs from» está retirado o tiene detrás, del autor del génesis y para el mismo libro, un enlace en el 9.1 o el 9.5 del génesis. Ninguno dice ya «vale el último del libro entero». `LIBRO_PRIVADO.retirar` es el nombre de la acción.
- **Lo que tendrá que decir la carta al rotar una clave**: «Para cambiar las claves de este enlace, escribe el nuevo en este mismo elemento, o retira este: un enlace escrito en otro sitio no lo sustituye».
- Lo bloqueado con la salida en un enlace retirado sigue esperando su vuelta: «receive from another book» lo suelta igual (no mira si el enlace está retirado).

## 3. Las plantillas

Todas pagan su T (el coste de escribir, por posición). Los tres últimos parámetros son los de siempre: `criteria` (2), `who` (3, `=me`) y `actions` (4).

| Plantilla | Se lanza sobre | Ancla | Aro | Lanza | Payload | Mueve |
|---|---|---|---|---|---|---|
| **bring a record from another book** | un enlace del dueño del libro | el **9.8 del génesis** | `[6, 5]` | person | 1.0 el libro de origen (por defecto, el del enlace) · 1.1 el registro: 0 id, 1 autor, 2 sobre, 3 en, 4 t, 5 movimientos (su JSON canónico, texto), 6 su payload tal cual, 7 contexto (JSON canónico), 8 su firma si la lleva · 1.2 la prueba de sello (la décupla de la vía «cascada») · 1.3 el enlace (por defecto, X) | `write` |
| **send to another book** | un enlace | su 4 | `[4, 26]` | person | 1.0 el libro de destino (el del enlace) · 1.1 la serie: 0 su clave, 1 su emisor, 2 su denominación (si la tiene), 3 su registro atado en el libro donde nació · 1.2 cuánto · 1.3 a quién: su clave pública x-only | `lock` cuánto, de la serie, de quien envía, con la salida = el enlace |
| **receive from another book** | un «bring a record» que trajo un envío a este libro | su 4 | `[4, 27]` | person | 1.0 el envío traído (`=it`) · 1.1 (la vuelta) de qué bloqueos saca: hasta diez ternas [quién lo bloqueó, el enlace de su salida, cuánto] | la ida: `mint` cuánto de la serie forastera para quien recibe; la vuelta (§10): por cada bloqueo, `transfer` desde quien lo bloqueó hacia quien recibe con esa salida (si no es él) y `release` |
| **declare a balance** | su propia alta | su 8 | `[8, 4]` | person | 1.0 la serie (su clave aquí) · 1.1 cuánto (por defecto, lo que tiene aquí: disponible y bloqueado, sin lo bloqueado para otro libro) | `write` |
| **withdraw a link** | un enlace suyo («open a private book here» o «this book hangs from»), sin retirar | su 4 | `[4, 28]` | person | 0 la nota («withdrawn») · 1 el enlace (`=it`) | `write` |

- **Cuándo se ofrece**: traer, sobre los enlaces del dueño del libro; enviar, sobre un enlace a quien tiene E; recibir, a quien declara en su alta la clave que nombra el envío, una vez; declarar, sobre la propia alta; retirar, sobre un enlace propio no retirado. Decide la regla, no la oferta.
- **La serie forastera** (diseño §4.3): la misma serie, nombrada con el libro de origen. Su emisor es `<id del génesis del libro de origen>:<su emisor allí>` (`src/tokens.js`, `esEmisorForastero`): `E:<libro>:ana/plato@<registro>`. Ninguna identidad ni ningún emisor de este libro lleva «:», así que nadie de aquí la emite como suya. Su registro atado es el registro traído (el `bring a record`) del registro al que estaba atada en el origen. Se comporta como cualquier serie de su familia (se transfiere, se bloquea, se quema).
- **Por qué el 9.8 del génesis**: «no se trae dos veces» mira solo lo traído, y lo traído de varios enlaces (al rotar claves) queda en un sitio. Ninguna plantilla anclaba ahí.
- **Por qué «send» no lleva la familia ni dónde nació**: una plantilla es una décupla (diez parámetros como mucho). La familia se lee de la clave (su primera letra) y si la serie es forastera, de su emisor.

## 4. Las reglas

Trece reglas nuevas, en la cadena del 8 detrás de «a change comes into force with its proof». Cada una solo se mira con su acción en el 4 (el `or` es perezoso), salvo las dos que guardan lo bloqueado y la serie forastera, que miran toda transacción.

| Regla | Qué pide |
|---|---|
| **a record is brought from a linked book** | cuelga del 9.8 del génesis; su enlace (1.3) **cuenta** (§10: del dueño, el autor del génesis, o el «open» de quien creó el libro, con su génesis comprobado), es un registro de este libro, nombra el libro de origen (1.0), es el último de los suyos (ningún enlace suyo para ese libro, **de cualquiera de los dos tipos**, igual o posterior, en el mismo elemento ni en el 9.5 del génesis: §2 bis) y **no está retirado** |
| **bringing needs the line keys of the book** | el enlace anota una clave **para el nivel de la primera cabecera** de la prueba (su eslabón 0) |
| **a brought record is its body** | el id (1.1.0) es el SHA-256 de su cuerpo canónico (`src/evento.js`: autor, contexto, en, movimientos, payload, sobre, t), rehecho con `json` y `cat` |
| **a brought record comes with its proof** | la prueba es de la vía «cascada», su hoja es el id, su primera cabecera es del libro de origen (su 8) y hay un eslabón j, con los de 0 a j válidos (cabecera v2, camino «sip», firma con su propia clave: las piezas de «sealed»), que dice un nivel k ≥ `epoch.8.9.2`, con su grado a la altura del exigido en k (`epoch.7.6.5`, como «firm»), firmado por la clave que el enlace anota **para ese nivel k**. Y por debajo (PH1): **el eslabón 0** (la cabecera cuyo libro es el de origen) lo firma la clave que el enlace anota para su nivel; **cada eslabón intermedio**, si el enlace anota clave para su nivel, esa clave. «sealed» entero no basta: sus claves de abajo no se miran y la prueba de otra línea pasaría |
| **a record is brought once** | ningún registro traído antes (en el 9.8 del génesis) trae el mismo id |
| **only the families of the bridge cross** | la familia de la serie (la letra de su clave) está en `epoch.8.9.1` y es la de lo que bloquea |
| **a send locks what it names** | se ancla en un enlace **no retirado** que nombra el libro de destino (otro); un solo bloqueo, de cuánto dice, de la serie de ese emisor y esa denominación, con la salida en el enlace, y nada más que su coste; el registro atado es el de la serie si es de aquí; si es forastera, **solo vuelve a su libro de origen** y el registro es el traído de su registro atado allí |
| **what is locked for another book is released only by its return** | una liberación o una transferencia con la salida en un enlace solo vale en un «receive from another book» |
| **a send is received once by whom it names** | se ancla en un registro traído que es un envío a este libro; quien lo escribe declara en su alta la clave a la que va; no se ha recibido antes |
| **what is received is what was sent** | la familia cruza aquí; la ida (el emisor sin «:»): una sola acuñación, cuánto se envió, para quien recibe, de la serie con emisor `<origen>:<emisor>` y la misma denominación; la vuelta (el emisor es `<este libro>:<emisor>`): una sola liberación, cuánto vuelve, de quien recibe, de la serie de aquí de ese emisor, denominación y registro, con la salida en un enlace al libro de origen; nada más |
| **only a receive mints a foreign series** | nadie acuña una serie forastera fuera de un «receive from another book» |
| **the tied record of E crossed before** | el requisito de E (si `epoch.8.9.3` lo nombra para E): la serie forastera de E queda atada al registro traído, del libro de origen, de su registro atado allí |
| **a declared balance is true** | quien declara tiene, de esa serie, al menos lo que dice: disponible y bloqueado, **menos lo bloqueado con la salida en un enlace** (PH2: eso ya vive en el otro libro y se declara allí), y **después de los movimientos del propio registro** (PH3: lo que quema o pasa a otro, como la T de su coste) |

**La declaración de saldo es suelo** (la salida con lo propio, VG 17-11; `docs/notas/GOBIERNO.md` §10). «a declared balance is true», la regla nueva **«a declared balance is only that»** (detrás de ella en la cadena del 8: un registro que nombra «declare a balance» se ancla en el 8 de la propia alta, lleva el payload de la plantilla y nada más, solo quema T y no está fechado más de un año después del mayor instante del libro: S7) y la plantilla «declare a balance» están en 7.9.6, y a una declaración solo se le prueban las reglas del suelo: ningún cambio de reglas le quita a nadie declarar lo que tiene. Llevarse la E y los registros como tales de modo que salgan del libro sigue bajo las reglas del libro (las de esta sección no son suelo).

Tres reglas de E dejan fuera la serie forastera, que la crea su «receive» y no su emisor (que está en otro libro): **E is minted by and to its issuer**, **minting E needs own R issued** y **minting E needs P on its record**. Ninguna de las tres está en el suelo (7.9.6).

**Nunca se suelta más de lo que se bloqueó**: cada envío se recibe una vez; la vuelta suelta solo cuánto vuelve; la serie forastera solo la crea su recibir (no hay más forastera que la enviada) y el libro no suelta más de lo bloqueado con esa salida.

## 5. La fila 8.9, «bridge»

| Posición | Qué es | Nacimiento |
|---|---|---|
| 8.9.0 | `["bridge", ayuda]` | — |
| 8.9.1 | las familias que cruzan como token | `["E"]` |
| 8.9.2 | el nivel de firmeza que pide traer un registro (de `epoch.7.6.1`) | `4` |
| 8.9.3 | los requisitos de cada familia, en el orden de 8.9.1: nombres de reglas | `[["the tied record of E crossed before"]]` |

Abrir una familia es un cambio de época: añadirla a 8.9.1 y dar sus reglas en 8.9.3; el mecanismo no se toca. La regla del requisito de E se mira solo si 8.9.3 la nombra para E (`lookup(epoch.8.9.1, epoch.8.9.3, "E")`). **La fila es pieza de gobierno** (VG 17-11, la salida con lo propio): `epoch.8.9` está en 7.9.7, así que qué familias cruzan, a qué nivel y con qué requisitos solo lo cambia un cambio «governance» («el cambio toca «epoch.8.9», que es una pieza de gobierno (epoch.7.9.7), y se declara «ordinary»…»). No es suelo.

## 6. El núcleo: lo mínimo

- **`src/bqlm.js`**: dos primitivas puras de verificación (`docs/BQLM.md` §12). `json(x)`: la serialización canónica (`canonico`, la del id de un evento) de un texto, un número o una décupla del payload, en bytes. `text(b)`: el texto UTF-8 de unos bytes (la vuelta de `utf8`; ERROR si no son UTF-8 o están vacíos). Con `json` se rehace el cuerpo de un registro traído; con `text(cat(utf8(a), bytes("3a"), utf8(b)))` se nombra la serie forastera, y `text(utf8(salida))` lleva la salida de un movimiento a un texto que se despliega como el registro que nombra.
- **`src/tokens.js`**: `esEmisorForastero` y, en `validarMovimiento`, el emisor de una serie forastera de E lleva su «:» y su emisión puede ir a quien no es su emisor (lo deciden las reglas).
- **`src/contrato.js`**: `librosPrivados` lee el libro en 1.0.0 (y en 1.0, los de antes) y admite 0 claves; `cuelgaDe` lee el libro en 1.0 (y en 1). Desde los arreglos (PH4), los dos dejan fuera un enlace retirado o con otro posterior del mismo autor en el 9.5 (o, para `cuelgaDe`, el 9.1) del génesis, como la regla (§2 bis).
- **`src/suelo.js`**, `condicionesDelRegistro` (S8 de la salida con lo propio, en el mismo encargo): a una declaración se le prueban las reglas del suelo de la versión de **nacimiento** del libro (`GOBIERNO.md` §10).

## 7. Lo traído, leído

`leerTraido(eje, id)` (`datos/epocas/puente.mjs`; no es núcleo) → `{ libro, id, autor, t, payload, contexto, movimientos, fiable, causa, firme, enlace, origen }`: de qué libro, quién lo escribió allí, cuándo, qué decía, su contexto y sus movimientos, cuándo quedó en firme (la hora de la cabecera del primer eslabón a la altura de 8.9.2) y el origen de la línea que anota el enlace (null: «sin comprobar el origen»). **«No fiable»** (PH6): el contexto y los movimientos viajan como texto y «a brought record is its body» los mete tal cual en el cuerpo; si uno de los dos no es el JSON canónico de un solo valor (`canonico(JSON.parse(texto))` no da el mismo texto), los mismos bytes podrían partirse de otra forma con el mismo id. Entonces `fiable` es false, `causa` lo dice en llano («no fiable: el contexto y los movimientos que trae no son el JSON canónico de un solo valor, así que el mismo id podría leerse partido de otra forma; no se enseñan») y `contexto` y `movimientos` son null. El autor, el «sobre», el t y el payload pasan por `json`: esos sí son los del registro. En BQL, lo mismo está en el payload del registro traído: `(payload(X)).1.1.1` el autor, `.1.1.6` lo que decía. `registroComoDecupla(ev)` da el 1.1 de un registro para traerlo.

## 8. Coste

Medido en `test/puente.test.js` (presupuesto de la época: 10 000 ocupantes, 100 000 pasos y 2 000 000 bytes por evaluación), con una prueba de dos eslabones (la casa en el nivel 1, el sellador en el 4):

| Regla | Pasos | Ocupantes | Bytes |
|---|---|---|---|
| a record is brought from a linked book | 39 (antes de los arreglos, 32) | 89 (79) | 0 |
| bringing needs the line keys of the book | 35 (15 antes de RP7; 11 antes de PH1) | 120 (48; 31) | 0 |
| a brought record is its body | 27 | 34 | 1 577 |
| a brought record comes with its proof | 238 (190) | 776 (588) | 133 619 |
| a record is brought once | 3 | 4 | 0 |

La prueba con cuatro eslabones (el vector `prueba-cuatro-eslabones.json` de Core StateArk): 487 pasos (379 antes), 1 469 ocupantes (1 097) y 268 134 bytes. Mirar solo el eslabón 0 y el que llega, sin los intermedios, daba 202 pasos con dos eslabones y 387 con cuatro: los intermedios cuestan unos cien pasos más con cuatro eslabones, lejos de los límites, así que se quedan. Validar el registro entero (todas las reglas de la época) tarda unos 30-80 ms en esta máquina. Una prueba de sello en el payload son unas ochenta posiciones: su coste de escribir.

## 9. Límites que se saben

- **Ninguna regla lee el contexto ni los movimientos de un registro traído** (1.1.7 y 1.1.5; comprobado en todas las del puente: solo «a brought record is its body» los usa, para rehacer el hash), y ninguna debe hacerlo mientras viajen como texto: el mismo id admite otra partición de esos bytes (PH6). Lo que lee lo traído es su payload (`.1.1.6`) y su id (`.1.1.0`).
- **Un enlace en otro elemento no retira el anterior** (§2 bis): se retira con «withdraw a link». Mirar «el último enlace de su autor para ese libro en todo el libro» pediría recorrer el libro.

- **(Superado por §10)** ~~La vuelta suelta lo de quien lo bloqueó.~~ «Recibir» en el origen lo escribe quien nombra la vuelta y libera **lo suyo**: el suelo («nobody moves tokens of others») no deja soltar lo bloqueado de otro. Si la vuelta nombra a otra persona que la que envió, no hay nada suyo que soltar y no se recibe. Que lo bloqueado de ana pase a otro al volver tocaría el suelo: **pregunta abierta para VG**.
- **(Superado por §10)** ~~Solo enlaces del dueño.~~ Se trae solo por un enlace escrito por el dueño del libro de destino (decisión de Core AGRAM en el encargo): con los de cualquiera, alguien que abre un libro privado sobre un elemento suyo y anota sus propias claves fabricaría registros «de» un libro que ya está enlazado. El libro privado que abre otra persona necesita que el dueño escriba también el enlace. Si VG quiere otra cosa, es la regla «a record is brought from a linked book».
- **A igualdad de instante**, dos enlaces del dueño para el mismo libro se anulan (el BQL mínimo no ordena textos); `contrato.librosPrivados` desempata por id.
- **No se trae**: el génesis (no tiene «sobre»), un registro cuyo payload lleva referencias `{ ref }` (el suelo de las referencias ausentes rechaza el registro que lo trae) ni uno cuyo payload es solo una lista de hojas (anidado se lee como lista y `json` no rehace su forma).
- **La firma del registro traído no se comprueba**: la clave de su autor está en el otro libro; lo que dice que el otro libro lo aceptó es la prueba de sello de su línea.
- **El destino se fía de las reglas del origen**: lee el envío por su payload; que el bloqueo sea el que dice lo comprobó el origen («a send locks what it names»). Un origen con otra época podría no comprobarlo.
- **La serie forastera no lleva el contrato de la de origen** (divisible, caducidad, precio): nace con el de la época. Va en enteros, como toda E de plantilla.
- **Una serie forastera solo vuelve a su libro**; no se reenvía a un tercero.
- **El origen de la línea** no se comprueba aquí (diseño §7 bis): pide un nodo de Bitcoin.
- **Cuatro pares de claves, como mucho** (RP10, tercera tanda): un enlace que lleva algo más allá del cuarto par [nivel, clave] no cuenta para el puente (ni traer, ni enviar, ni la vuelta): lo dice `enlaceQueCuenta`, y la lectura (`gradoDelEnlace`, `librosPrivados` con `puente`, `nivelMasBajoDe`, `leerTraido`) dice lo mismo. Las plantillas no dejan escribir un quinto par (su validación); la regla aguanta sola el escrito a mano.
- **En el 4 del registro traído solo cuelga su recibir** (RP11, tercera tanda; regla de suelo «only a receive hangs on the 4 of a brought record»): lo ya recibido de una vuelta y el «una vez» de la ida se leen ahí, no en todo lo que cuelga del traído, así que lo que otros cuelguen en otras posiciones no cuesta nada. En ese 4 solo entra un «receive from another book», y ese solo lo escribe quien el envío nombra («a send is received once by whom it names»): probado que 100 registros de un tercero colgados del traído no cambian el coste de las dos reglas de recibir, y que una nota en ese 4 no entra.
- **La prueba empieza en la casa del libro** (RP7, segunda tanda): la primera cabecera de toda prueba (ida, vuelta y registros) es del nivel más bajo que el enlace anota, firmada por la clave que anota para ese nivel. **Si un enlace solo anota la clave de un sellador de arriba** (el libro no tiene línea propia), quien trae por él se fía de que ese sellador solo sella para ese libro lo que ese libro le da. `leerTraido(...).nivelMasBajo` (y `nivelMasBajoDe(enlace)`) dice ese nivel, para que la carta lo enseñe.
- **La fila 8.9 es de gobierno, no de suelo** (RP3, pendiente de VG): dos tercios pueden cambiar qué series cruzan y con qué sello. Si lo hacen, lo que ya se mandó a otro libro puede quedar parado (ninguna vuelta se recibe, nada se trae), pero no pasa a manos de nadie.
- **La seguridad de un token que cruza es la del sello del libro de origen** (diseño §9): con grado local o en la red de pruebas, vale para enseñarlo y no para dinero. Un saldo declarado es verdad en su fecha.
- **Los textos de los rechazos nuevos**, en español (epoch.9.4): «{quien} trae del libro {libro} por {enlace}, que no es el último enlace del dueño de este libro con ese libro (en su elemento o en el 9.5 del génesis), o está retirado, o no desde el 9.8 del génesis»; «{quien} trae de un libro cuyo enlace no anota la clave de línea del nivel de la primera cabecera de la prueba: no hay con qué comprobar esa cabecera»; «{quien} trae {id} sin una prueba de su libro que lo cubra al nivel que pide el puente (epoch.8.9.2) con las claves de línea que nombra su enlace (también su primera cabecera, firmada por la clave de su nivel)»; «{quien} envía a {libro} algo que no es un bloqueo de lo que dice el envío, con la salida en el enlace con ese libro, o por un enlace retirado»; «{quien} declara más {serie} de lo que tiene aquí después de este registro (lo bloqueado para otro libro se declara allí)»; y «a declared balance is only that» añade «o fechado más de un año después del mayor instante del libro».
- **Falta** (paso 3 del plan): enviar, traer y recibir desde la carta, entre los libros abiertos; la sincronía que traiga los registros y sus sellos de un libro a otro.

## 10. Segunda vuelta (encargo «el puente, segunda vuelta», VG 17-11)

Diseño: `agram-equipo/DISENO_PUENTE_2.md`. Pruebas: `test/puente-2.test.js`. Lo de §9 sobre «la vuelta suelta lo de quien lo bloqueó» y «solo enlaces del dueño» queda superado aquí.

### 10.1 La vuelta libera a favor de otra persona

Bloquear «con salida» en un enlace es consentir que se libere según lo que vuelva. Quien recibe la vuelta (a quien nombra el envío, por su clave) escribe dentro de un «receive from another book» transferencias **desde quien bloqueó hacia sí**, con la salida en el enlace, y su liberación. La mecánica del núcleo no cambia: una transferencia con salida solo saca lo bloqueado con esa salida.

- **El fondo**: lo bloqueado de una serie con la salida en un enlace **de un autor** a un libro **que anota, para el nivel de la primera cabecera de la prueba de la vuelta, la clave que la firmó** (RP1, arreglos de la segunda revisión: «cada enlace tiene su fondo»). Una vuelta traída por un enlace de ese autor saca de ese fondo (también de lo bloqueado por un enlace suyo ya retirado, si anota esas claves). El fondo nunca sale por el enlace de otro autor, ni por uno del mismo autor con otras claves, ni hacia otra serie u otro libro.
- **El tope del daño, dicho con verdad**: quien escribió un enlace no puede llevarse lo mandado por él cambiando las claves: una vuelta sellada con claves suyas solo alcanza lo mandado por sus enlaces que anotan esas mismas claves. Lo mandado a otro libro queda en manos de ese libro (de quien firma sus cabeceras con esas claves), hasta lo mandado por los enlaces de ese autor a ese libro que anotan esas mismas claves.
- **Límite nuevo**: si el libro de destino cambia de claves de línea, lo mandado con las viejas solo vuelve con una vuelta sellada por las viejas (la primera cabecera firmada por la clave vieja de su nivel).
- **El registro nombra de qué bloqueos saca** (su 1.1: [quién lo bloqueó, el enlace de su salida, cuánto], hasta cinco: RP8). **Una vuelta se recibe en una o varias veces** (RP9): cada «receive from another book» libera algo y, con lo ya liberado por los que cuelgan del registro traído, no más de lo que vuelve; la ida, una vez y entera. `bloqueosDeLaVuelta` da la parte siguiente, y recibir se ofrece mientras quede algo. «what is received is what was sent» pide: cada transferencia, desde otro hacia quien escribe, de la serie de aquí; cada liberación, de quien escribe; lo liberado suma lo que vuelve; no acuña ni bloquea; y (RP6) **el 1.1 dice la verdad**: cada terna lleva tres hojas y cuánto es positivo, su enlace es del fondo, la de otra persona es una transferencia de esa persona con esa salida y esa cantidad, la de quien recibe es una liberación con esa salida y esa cantidad, y nada queda fuera de las ternas (cada transferencia y cada liberación es una terna; tantas transferencias como ternas de otras personas, tantas liberaciones como ternas). Lo que no coteja: si varias ternas comparten salida y tienen cantidades distintas, el reparto entre ellas de las transferencias de una misma persona puede ser otro (el total liberado es lo que vuelve y todo sale del mismo fondo). **RP8** (segunda tanda) vuelve a pedir, por cada salida, que lo transferido no pase de lo liberado con ella en el mismo registro (nada queda bloqueado con la salida en un enlace a nombre de quien recibe), y por cada persona y salida, que lo transferido sume lo que dicen sus ternas (el 1.1 no dice de menos). El orden (el más antiguo primero) lo pone la ayuda `bloqueosDeLaVuelta` de `datos/epocas/puente.mjs`, no la regla: el fondo es fungible.
- **El suelo**: segunda excepción de «nobody moves tokens of others», calcada de la invitación: una transferencia desde otro, hacia quien escribe, con la salida en un enlace entre libros, dentro de un «receive from another book». `src/validez.js` (`recibeLaVuelta`) la repite.
- **Enviar** pide un enlace que cuente: el mismo predicado que traer (`enlaceQueCuenta`), con la retirada. No se envía por un enlace por el que nunca podrá traerse la vuelta.
- **Límite llano**: quien escribió el enlace puede dejar parado lo que se mandó por él mientras no lo reponga. Un fondo bloqueado por un enlace que su autor retira solo vuelve si ese mismo autor escribe otro enlace a ese libro (por él se trae la vuelta, que libera lo bloqueado por el retirado). Probado: retirar, enlazar de nuevo, traer la vuelta y liberar.

### 10.2 Quien creó un libro lo enlaza

«open a private book here» cuenta para el puente si es del dueño de este libro o de **quien creó el libro que enlaza**. La prueba va en el enlace, en su **5** (opcional; en el 5 del payload y no junto al libro, para no dejar huecos): las piezas del génesis del libro enlazado, una décupla.

| 5.k | Qué |
|---|---|
| 0 | el autor del génesis |
| 1 | su instante |
| 2 | su payload, como JSON canónico (un texto) |
| 3 | el id de su época (`contexto.epoca`) |
| 4 | la clave que declara para su autor (`contexto.claves`) |
| 5 | su firma |
| 6 | cuántos registros de época escribe (`contexto.epocaEscrita`); 0 si no lo dice |
| 7 | (opcional) un 1 si es de demostración |

`genesisComoDecupla(g)` la da. La regla **«who created a book links it with its genesis»** (suelo) rehace el cuerpo canónico del génesis

`{"autor":A,"contexto":{"claves":{A:K}[,"demostracion":true],"epoca":E[,"epocaEscrita":N],"genesis":true},"en":"0000000000","movimientos":[],"payload":F,"sobre":null,"t":T}`

(`json` de cada pieza y `utf8` del payload; las cuatro formas, según diga época escrita o demostración) y pide: su SHA-256 es el libro que nombra el enlace (1.0.0); la firma vale (`signed`) con la clave K que ese cuerpo declara; K es una de las que quien escribe el enlace tiene en su alta de este libro (la de su titular); el instante del enlace no es anterior al del génesis; y quien no es el dueño lo escribe sobre un elemento suyo. Cada pieza es un solo valor JSON y las separaciones son fijas, así que el mismo id no admite otra partición: la clave sale del cuerpo. **Al usar el enlace** (traer, enviar y, por traer, la vuelta: `enlaceQueCuenta`) la prueba se vuelve a mirar entera (`pruebaDelGenesis`; revisión automática del 17-11): no se fía de que la regla rigiera cuando se escribió.

- **Un alta no declara una clave sin su prueba de posesión**: la propia, por la firma del alta misma (quien entra firma su aceptación con la clave que declara); la de otra identidad, por su «posesion». Probado: aceptar una invitación con la clave de otra persona no entra. Y quien tiene clave firma todo lo suyo con ella («who has a key signs»), así que el enlace mismo va firmado con K.
- **Lo que no cabe**: un génesis con campos propios en su contexto, o de demostración sin clave, no lo enlaza su creador (no se rehace su cuerpo); queda el enlace del dueño.
- **Sin el 5**, el «open a private book here» de quien no es el dueño sigue siendo un anuncio (`docs/notas/LIBRO_PRIVADO.md`: lo escribe quien puede escribir sobre X) y **no cuenta** para el puente.
- **(a)** El fondo es por autor de enlace (10.1). **(b)** Con un enlace del dueño a ese libro con otras claves, el de otra persona no cuenta: **por lectura y no por regla** (mirarlo pide recorrer el libro). `contrato.gradoDelEnlace`, `contrato.librosPrivados(eje, X, { puente: true })` y `leerTraido` lo dicen (`cuenta: false`) y dan el del dueño (`delDueno`); la regla sigue dejando traer por él. **(c)** Lo traído dice por qué enlace vino: `leerTraido` da `enlace`, `quien`, `grado` («del dueño», «de quien creó el libro, avalado por el dueño» si el dueño tiene un enlace vigente al mismo libro con las mismas claves de línea, o «de quien creó el libro»), `cuenta` y `delDueno`.
- «this book hangs from» no cambia: cuenta solo el del dueño del libro pequeño.

### 10.3 Las reglas que guardan el puente, en el suelo (7.9.6)

Si dos tercios pudieran quitarlas, podrían llevarse lo bloqueado para otro libro. Entran:

| Pieza | Por qué |
|---|---|
| a record is brought from a linked book | sin ella se traería por cualquier enlace: registros «de» otro libro que nadie escribió |
| a brought record comes with its proof | sin ella lo traído no necesita el sello de la línea del otro libro |
| a brought record is its body | sin ella el id de lo traído no ata lo que dice |
| a record is brought once | sin ella el mismo envío se trae y se recibe dos veces |
| bringing needs the line keys of the book | sin ella la primera cabecera de la prueba no se compara con ninguna clave de la línea |
| what is locked for another book is released only by its return | sin ella lo bloqueado para otro libro se suelta aquí sin vuelta |
| a send is received once by whom it names | sin ella la vuelta la recibe cualquiera, o dos veces |
| what is received is what was sent | sin ella la vuelta saca más del fondo o de otro fondo, y la ida acuña lo que quiera |
| a send locks what it names | sin ella un envío no bloquea lo que dice: allí se acuña lo que aquí sigue libre |
| only a receive mints a foreign series | sin ella cualquiera acuña la serie forastera y la «devuelve» |
| who created a book links it with its genesis | sin ella un enlace con un génesis falso entraría (al usarlo se vuelve a mirar, pero es la puerta) |
| only a send locks for another book | (RP2) sin ella, lo bloqueado sobre un enlace por otra plantilla (pujar por un cupo, comprometer P) quedaría congelado y entraría en el fondo de las vueltas |
| las plantillas bring a record from another book, send to another book, receive from another book, open a private book here, this book hangs from, withdraw a link | son los nombres que esas reglas leen |

**RP2, la regla nueva «only a send locks for another book»** (suelo): un registro que deja algo bloqueado con la salida en un enlace entre libros, por un bloqueo o por una transferencia con salida, es un «send to another book» (el bloqueo) o un «receive from another book» (la transferencia, que su regla obliga a liberar). No alcanza una declaración (no bloquea) ni la invitación (su salida es una persona). Pujar por un cupo y comprometer P ya no se ofrecen sobre un enlace (su 2).

«only the families of the bridge cross» y «the tied record of E crossed before» no entran: su falta no deja sacar lo bloqueado ni traer lo que nadie escribió (la fila 8.9 sigue siendo pieza de gobierno). **Ninguna alcanza una declaración**: cada una empieza por «no nombra su acción», o solo mira movimientos que una declaración no tiene; probado. El motor rechaza un cambio, de cualquier clase, que sustituya cualquiera de ellas o las quite de 7.9.6.

### 10.4 Lo que la carta tendrá que decir

- **Antes de enviar**, con el grado del enlace y la red: «Lo que mandas a otro libro queda en manos de ese libro. Si ese libro hiciera trampa, podría fabricar una vuelta a su favor, hasta lo que se haya mandado por este enlace.»
- **La oferta dice lo mismo que la lectura** (RP4): `A.acciones` no ofrece enviar ni traer por un enlace que `gradoDelEnlace` da con `cuenta: false` (mirarlo cuesta menos de un milisegundo en un libro de 300 registros). La lectura lee el libro del enlace en 1.0.0 (o 1.0, «this book hangs from»), como la regla: un enlace de antes del puente no cuenta (RP5).
- **El grado de un enlace**: `contrato.gradoDelEnlace(eje, id)` → { enlace, quien, grado, cuenta, delDueno } (y `librosPrivados(eje, X, { puente: true })` por elemento). **El fondo bloqueado por él**: `eje.bloqueado(quien, serie, enlace)` de cada quien que envió por ese enlace (los enlaces del mismo autor al mismo libro hacen un fondo); `bloqueosDeLaVuelta(eje, idTraido)` da de qué bloqueos saca una vuelta.
- Para que un miembro enlace como creador el libro que abre, la carta tendrá que mandar el génesis (`genesisComoDecupla`) en el 5 y escribir sobre un elemento suyo.

### 10.5 El punto en «this book hangs from»

Su 5, opcional, «point»: el id del registro que puso en vigor el último cambio en el libro de arriba cuando nació este (o nada). Es un dato para leer, ninguna regla lo juzga; `contrato.cuelgaDe` lo da como `punto` (solo si está).

### 10.6 Coste (medido en `test/puente-2.test.js`, dos eslabones)

| Regla | Pasos | Ocupantes | Bytes |
|---|---|---|---|
| what is received is what was sent (la vuelta de 1, un bloqueo) | 256 (204 antes de los arreglos) | 532 (274) | 4 740 |
| what is received is what was sent (cinco bloqueos, el tope por registro desde la segunda tanda) | 1 604 | 3 838 (de 10 000) | 19 100 |
| who created a book links it with its genesis | 67 | 116 | 66 990 |
| a record is brought from a linked book, por el enlace de quien creó el libro (con la prueba otra vez) | 125 | 268 | 66 990 |
| a send locks what it names, por ese enlace | 168 | 318 | 67 134 |

Por el enlace del dueño, el coste de traer no cambia (39 pasos: la prueba del génesis no se mira). Validar el registro entero: unos 20-30 ms.

## 11. La salida, paso a paso (tramo 4, parte B)

Diseño: `agram-equipo/DISENO_TRAMO_4.md` §4. Quien no acepta un cambio, o a quien una regla deja sin escribir, se va con lo suyo. No hay regla ni plantilla nueva (la época 0 no cambia): dos funciones de JS, fuera del núcleo, en `datos/epocas/puente.mjs`. Ejemplo: `node ejemplos/salida.mjs`. Prueba de punta a punta: `test/salida.test.js`.

- **`saldosDe(eje, identidad)`** → `[{ serie, familia, disponible, bloqueado, enOtroLibro, cantidad, declarable, causa }]`: cuánto puede declarar hoy de cada serie, exactamente lo que acepta «a declared balance is true» (disponible y bloqueado, menos lo bloqueado con la salida en un enlace, y nunca más de lo que queda tras el propio registro). Probado: con `cantidad` entra; con una más, la regla la rechaza. **La T no es declarable**: la de una persona no se guarda (es lo que puede gastar cada día al escribir, su saldo es 0) y la declaración misma quema T; `declarable: false` y su causa en llano (probado a mano: una declaración de 1 T la rechaza la regla).
- **`planDeSalida(eje, identidad, { punto, claves, nuevo, sellos, foco, elemento })`** → `{ libro, identidad, epoca: { punto, version, id, registro }, pasos, noSeLleva, esperan, aparte }`. No firma ni escribe: devuelve los pasos en orden, cada uno con su libro (`viejo` o `nuevo`), su plantilla y sus parámetros, y su estado (`hecho` con su id, `listo` para firmar, o `espera` con lo que falta). Se vuelve a pedir tras cada paso: lee lo ya escrito.
  1. En el viejo, un «declare a balance» por serie declarable.
  2. El génesis del nuevo, con la época del viejo por referencia (`epocaEscritaDe(version, { porReferencia: true })`, como `abrirLibroPrivado`) en el `punto`: `'vigente'` (por defecto), `'antes'` (la de antes del último cambio en vigor) o el número de una versión.
  3. En el nuevo, como dueño, «this book hangs from» con el viejo, sus claves de línea (`claves`, la de la casa incluida) y el punto (el registro que puso en vigor esa versión; nada si es la de nacimiento). El elemento, por defecto, el alta de quien sale en el viejo.
  4. En el nuevo, un «bring a record from another book» por declaración, con su prueba de sello (`sellos`).
- **Lo que no se lleva** (`noSeLleva`): lo bloqueado en un enlace (se declara en el otro libro), la T y el P sobre sus propias declaraciones (cada declaración da P sobre ella; declararlo daría otra declaración y otro P, sin fin). La E y los registros como tales van aparte, con «send to another book», bajo las reglas del viejo.
- **Probado tras una regla que silencia** (como `test/revision-suelo.test.js`, S6): las declaraciones entran. Con la época vigente la regla viaja al libro nuevo y allí no se escribe ni de qué cuelga: quien sale por una regla nace con `punto: 'antes'`.

**Lo que la regla no puede dar.** La declaración vale fuera cuando lleva el sello del libro viejo. Ninguna regla la rechaza, pero el sello lo pone quien guarda ese libro. Si deja de sellar, la persona tiene su registro firmado y su copia, y la prueba para terceros espera: el plan se queda en las declaraciones firmadas y cada «traer» dice «espera el sello del libro viejo». Sin las claves de línea del viejo en el enlace, tampoco se trae nada, y el plan lo dice.
