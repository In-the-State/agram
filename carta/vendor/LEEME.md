# `carta/vendor/`: lottie-web, dentro del repositorio

La carta pinta las piezas Lottie del modo animado con **lottie-web** (de Airbnb; el reproductor se publica también con el nombre «bodymovin»). Antes se pedía a cdnjs; desde el encargo «anfitrión y lottie» (16-11-2026) va aquí, como `src/vendor/noble-secp256k1.js`, y se carga del propio origen solo cuando hace falta (`cargarLottie()` en `carta/app.js`), con su SRI.

## `lottie.min.js`

| | |
|---|---|
| Qué es | lottie-web **5.12.2**, la compilación minificada (`lottie.min.js`, bodymovin) |
| De dónde | `https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js`, bajado y comprobado por Core, copiado aquí tal cual |
| Licencia | MIT (© Airbnb), la de lottie-web |
| Tamaño | 305543 bytes |
| **sha256** | `a0757321f974527bda3cc2593bf56cc7ffe4578421249ced6ae49ffb1c529f90` |
| **sha512** (el SRI de `cargarLottie()`, el mismo que publica cdnjs) | `sha512-jEnuDt6jfecCjthQAJ+ed0MTVA++5ZKmlUcmDGBv2vUI/REn6FuIdixLNnQT+vKusE2hhTk2is3cFvv5wA+Sgg==` |

**No se edita.** `test/carta-anfitrion.test.js` comprueba que el archivo da este sha256, que este LEEME lo dice y que en `carta/` no queda ninguna URL de cdnjs. Para cambiar de versión: bajar el archivo nuevo fuera del repositorio, comprobar su sha512 con el que publica cdnjs, copiarlo aquí y actualizar las dos huellas en este LEEME, el sha256 en la prueba y el SRI en `cargarLottie()`.
