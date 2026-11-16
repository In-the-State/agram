# El libro privado: el enlace entre dos libros

Core AGRAM, 17-11 (encargo «abrir aquí un libro privado», VG por Core State; contraste en `agram-equipo/CONTRASTE_PRIVACIDAD_GOBIERNO.md`, parte A; ajuste de Core StateArk: el nivel de cada clave explícito, la dirección de las cabeceras y «vale el último»), rama `beta-privado`. **Estado:** en la beta, sin aceptar.

> Lo privado dentro de un espacio compartido es otro libro, más pequeño, que cuelga de un elemento. El grande guarda y sella, no lee. Lee quien está invitado al pequeño. Quien no está invitado ve que existe y quién lo abrió, no su contenido. Los tokens no cruzan libros. Los libros no se leen entre sí.

## Qué es el enlace

Dos datos, uno en cada libro, sin referencias: ninguno de los dos libros tiene ni lee al otro.

| Lado | Plantilla (época 0) | Dónde | Payload |
|---|---|---|---|
| el grande | **open a private book here** ([9, 9]) | en el 9.1 del elemento X; la escribe quien puede escribir sobre X (su T; sobre el alta de otro no se ofrece: allí pide el precio de la atención y se escribe a mano con el pago) | 0 el mensaje; 1.0.0 el libro (el id del génesis del pequeño, 64 hex; en 1.0 antes del puente) y 1.0.1 opcional, el origen de su línea («anchor origin», `PUENTE.md`); 1.1 opcional, dónde publica el pequeño sus cabeceras (una dirección); 2 las claves de línea, hasta cuatro pares [nivel, clave], nivel de `epoch.7.6.1` sin repetir, clave x-only, o 0 (ninguna, por defecto); 3 quién; 4 la acción |
| el pequeño | **this book hangs from** ([9, 12]) | en el 9.5 de su génesis; solo se ofrece al autor del génesis | 0 el mensaje; 1.0 el libro del que cuelga (el id de su génesis; en 1 antes del puente), 1.1 sus claves de línea (hasta cuatro pares o 0, por defecto) y 1.2 opcional, el origen de su línea (`PUENTE.md`); 2 el elemento (su id); 3 quién; 4 la acción |

**Cero claves** (Core AGRAM 17-11, acordado con Core StateArk): un libro pequeño sin sellador se anuncia sin claves, con `0` en el 2 (el defecto); `librosPrivados` lo da con `claves` vacío, el enlace sigue siendo recíproco y vale el último anuncio que las declare. Desde el puente (`PUENTE.md`), el libro va en 1.0.0 junto al origen de su línea (1.0.1, «anchor origin», opcional), y «this book hangs from» anota también las claves de línea del grande (1.1) y su origen (1.2); los registros de antes se siguen leyendo.

Las claves de línea son las que el pequeño declara en sus ajustes: con ellas, quien sella el grande sabe qué cabeceras del pequeño anclar. Por qué pares y no cuatro huecos, uno por nivel: lo opcional cierra su propia décupla (sin huecos ni rellenos, VG 13-11); cuatro posiciones opcionales seguidas dejarían un hueco cuando falta la de un nivel de abajo.

Por qué el 9.1 y el 9.5: el 9 es lo que configura un elemento y allí anclan las cuatro plantillas de custodia; el enlace va al lado sin chocar con ellas en su dirección. El 9.0 es el 9 por ceros, y en un génesis el 9.2, el 9.3 y el 9.6 ya los ocupan los ajustes, las preferencias y las revisiones, y el 9.4 los retoques de textos. Las dos plantillas van a direcciones distintas para no chocar en el génesis de un libro que es pequeño y a la vez abre otro.

Lecturas (`docs/CONTRATO.md` §7.3): `librosPrivados(eje, id)`, `cuelgaDe(eje)` y `enlaceReciproco(grande, pequeno)`. En los dos lados vale el último por instante y, a igualdad, por id, y solo de quien toca: en el grande, de quien abrió ese libro (el autor del primer registro que lo nombra en el elemento); en el pequeño, del autor de su génesis. Rotar una clave es escribir otro «open a private book here» para el mismo libro.

Que el grande guarda y sella sin leer se declara en el pequeño con lo que ya hay: un «add a parent» con la clave de quien sella el grande, `keeps and seals` y `does not read` (`test/libro-privado.test.js`, el ejemplo).

## Qué se ve desde fuera

- **Que existe y quién lo abrió.** En el grande, el registro está a la vista de todos los lectores; la carta pinta en «quién guarda esto» una línea por libro privado («un libro privado (abababab) cuelga de aquí; lo abrió bea»), sin enlace, sin las claves y sin la dirección.
- **Cuánta actividad hay**, por las cabeceras: el grande sella las cabeceras de lote del pequeño, así que quien las ve sabe cuántos lotes hubo y cuándo. Privacidad de contenido, no de actividad.
- No el contenido: está en el otro libro, que este no tiene.

## Lo que falta

- **Quitar el enlace.** La época no tiene una forma general de retirar un registro propio: «remove a parent» solo quita padres, «expire something mine» quema E y «expire» o «close» cierran procesos. Hoy un enlace no se quita; rotarlo es escribir otro.
- **Que solo el dueño escriba «this book hangs from».** Es de la oferta de la plantilla; a mano, otro puede escribirlo (la época lo deja) y `cuelgaDe` no lo cuenta. Impedirlo en la validez pediría una regla nueva, que no se añadió.
- **Varios registros para el mismo libro** sobre un elemento: vale el último de quien lo abrió (Core, al fundir: quien sella el libro grande se fía de esas claves de línea, y el registro de otra persona no debe cambiarlas). «Quien lo abrió» es el autor del registro más antiguo por instante; quien pueda escribir sobre el elemento con un instante anterior al de la apertura se la quedaría, y eso no lo impide una regla.
- **La época por referencia.** El pequeño usa la 0 que trae el código o escribe la suya entera; no puede heredar por referencia la del grande (ni sus retoques). Encargo de núcleo.
- **La carta con varios libros.** La carta abre un solo libro: entrar en lo privado desde el elemento, con su sincronía y su clave de lectura por libro, es otro encargo.
- **El cifrado de la copia.** En AGRAM no hay cifrado: el formato del sobre es de Core StateArk (V4).
- **Cómo sella el grande al pequeño**, la frontera con StateArk: el pequeño pide ancla en el grande («ask for an anchor», en construcción) y quien sella el grande ancla las cabeceras firmadas con las claves de línea declaradas aquí.
