# El límite de cálculo: la causa para la puerta de AARPIA

Core AGRAM, 17-11 (encargo «el límite de cálculo, con causa y como dato de la época», #100; VG por Core State), rama `beta-limite`. **Estado:** en la beta, sin aceptar.

> La regla de parada: el tope de cálculo es un dato de la época (o del tipo de contexto), no una constante escondida, y cuando una evaluación se para por él se sabe por qué, con una causa que una máquina lee.

## Lo que la puerta lee

La puerta de AARPIA pregunta al eje antes de escribir, o escribe y recoge el error. En los dos casos tiene la causa tipada; no tiene que reconocer el texto «límite de cálculo: …».

<!-- comprobar: fragmento -->
```js
const motivos = await eje.motivos(ev);        // [{ texto, regla, estado, causa }]; [] si entra
const porLimite = motivos.some((m) => m.causa === 'limit_exhausted');

try {
  await eje.escribir(datos, privada);
} catch (e) {
  e.code;      // 'limit_exhausted' si algún motivo es por límite; si no, no está
  e.motivos;   // la misma lista que eje.motivos
  e.message;   // el texto de siempre: 'evento rechazado: …'
}
```

| Campo | Qué es |
|---|---|
| `texto` | el texto de `eje.validar`, idéntico y en el mismo orden (el que ya enseña la carta) |
| `regla` | la regla de la época o la condición del suelo que lo dice; `null` si es la aritmética del libro o la forma |
| `estado` | `'pendiente'` si la regla no se resolvió (no se sabe); `'falla'` si dice que no |
| `causa` | `'limit_exhausted'` (`CAUSA_LIMITE` de `src/bqlm.js`) si se paró por un límite de cálculo; `null` si no |

## Qué significa `limit_exhausted`

- **No es un «no»**: ninguna regla ha dicho que no. Si alguna regla falla con veredicto, solo cuentan esas y la parada por límite no sale (el orden de `src/condiciones/reglas.js`, que no cambia). Un motivo `limit_exhausted` quiere decir «no se ha podido terminar de comprobar con los límites de esta época».
- **Nada se escribe**: el registro se rechaza entero, como cualquier rechazo.
- **El aviso**: la puerta puede decir la causa sin traducir el texto (`regla` dice cuál; `texto`, cuánto: «más de N pasos», «más de N ocupantes expandidos», «expresión anidada más de N niveles», «más de N bytes procesados…»).

## De dónde salen los límites

La fila **8.8** de la época, «calculation limits»: `[[nombre, ayuda], [pasos], [ocupantes], [anidamiento], [hilo], [bytes]]`. La 0 lleva los valores de siempre (100 000, 10 000, 100, 10, 2 000 000). El núcleo usa el menor entre el dato y su constante `LIMITES` (el techo: una época no lo sube); un dato ausente, mal formado, cero o negativo cuenta como la constante. Una época hija que reescribe su 8.8 lo baja: así un tipo de contexto tiene su propio tope sin más mecanismo. `limitesDeEpoca(eje.epoca())` dice los que rigen.

**Cuidado con la SIP 0 de StateArk**: ya usa su 8.8 para «usage labels». Su fila no se llama «calculation limits», así que cuenta como la constante (rige lo de siempre), pero una SIP que quiera bajar sus límites tendrá que mover sus etiquetas de uso a otra fila. Lo decide Core StateArk con VG.

Lo que no entra aquí: la parte de la casa de Gregorio y el núcleo en Wasm. Contrato completo: `docs/CONTRATO.md` §5 bis.1; límites: `docs/BQLM.md`. Prueba: `test/limite-de-calculo.test.js`.
