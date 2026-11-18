# La época del libro de cuenta (account book epoch 0)

A34, parte de datos (Core AGRAM 18-11; `agram-equipo/DISENO_LIBRO_DE_CUENTA.md`). VG: el libro de cuenta y el de la guía son el mismo. Mis libros, mis invitaciones y mis emparejamientos son registros de mi libro de cuenta, sobre mi alta, y la lente los enseña sin pantallas fijas. Hereda de la época 0 y no la cambia. No viaja con el núcleo: ningún archivo de `src/` ni de `carta/` conoce estas plantillas por su nombre.

| Archivo | Qué es |
|---|---|
| `cuenta-0.raiz.json` | la raíz: lo propio y, donde hereda, `"<hereda>"`. Lo propio: la guía de inicio, el tutorial del alta (`epoch.3.0.9`), con «a pairing» y «a book of mine» detrás de los pasos de la 0 (una hija cambia ese 9 entero, por posición) |
| `plantillas/*.json` | «a book of mine» ([1, 40], en el 1 de mi alta), «an invitation received» ([3, 40]) y «a pairing» ([3, 41]), en su 3. Las tres: solo el dueño de la alta, sobre ella (o sobre una suya anterior, para cambiarla), en modo persona; su 4 es `write`. Nunca un secreto |
| `prestadas.json` | las dos plantillas de la guía y sus textos, leídos de la fuente de `guia-libro` sin copiarlos (el generador de toda hija los toma de ahí). Al congelar, si pasan a la 0, se quitan de aquí |
| `reglas/*.json` | tres lecturas con nombre, en BQL, con `it` = mi alta: «my books», «my pending invitations» y «my pairings»: lo vigente (sin una nueva mía encima ni un «close by decision» mío) |
| `textos/es.json`, `textos/en.json` | los textos de la época por clave (detrás de los prestados) |
| `generar.mjs` | el generador: `npm run epoca:cuenta` (el de toda hija, `datos/epocas/hija.mjs`) |
| `cuenta-0.btml.json`, `cuenta-0.ids.json` | el resultado y sus ids |

Lo que escribe cada plantilla (manda la décupla sobre el diseño):

- **a book of mine**: 0 el nombre; 1.0 mi alta en ese libro (id, dato); 2.0 el criterio de cierre y 2.1 para qué (opcional); 3 quién; 4 la plantilla; 5.0 el libro (su génesis, otro que este), 5.1 dónde bajarlo (http o https) y 5.2 el nombre del libro compartido (opcionales).
- **an invitation received**: 0 el nombre del libro; 1.0 la invitación en ese libro (id, dato; obligatoria); 2.0 criterio y 2.1 una nota (opcional); 3; 4; 5.0 el libro y 5.1 quién invita (su clave pública; opcional). Aceptada no se guarda: lo está cuando hay un «a book of mine» con el mismo 5.0.
- **a pairing**: 0 el nombre del navegador o aparato; 1.0 la clave pública de la sesión y 1.1 hasta cuándo vale (opcional); 2.0 criterio y 2.1 una nota (opcional); 3; 4; 5.0 el relé (wss o https).

Cambiar: la nueva se lanza sobre la vieja, con sus defectos; manda la última. Retirar (olvidar un libro, rechazar una invitación, revocar un emparejamiento): «close by decision» de la 0, que se ofrece a su autor; «close» no (pide algo anunciado). Se cambia la fuente y se regenera; `test/cuenta-libro.test.js` falla si no está al día con su fuente o con el id de la 0. Nada real: es genérica.
