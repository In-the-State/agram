# La cuenta del banco: una E única con el saldo como dato

Core AGRAM, 16-11 (encargo «cuenta del banco», rama `beta-banco`). Decisión de VG del 16-11, que trae Core State. **Estado:** en la beta, sin aceptar. VG 17-11 (V6, por Core State): la cuenta en el libro de su dueño pasa a firme, la E de la cuenta no cambia de manos y la carta dice quién puede proponer pagos.

> VG 17-11 (V6): «Dentro de un libro, cualquier invitado puede proponer pagos de la cuenta (el banco pide la aprobación del titular en cada uno, y la carta dice quién puede), y la E de una cuenta no se puede pasar a otra persona. Lo provisional de "la cuenta vive en el libro de su dueño" pasa a firme.»

> «La cuenta del banco es una E única, como una mesa. El saldo es un dato de su registro, que se actualiza con lo que dice el banco. No hay unidades de euro fungibles en el libro.» «El P sobre ese registro dice quién puede ordenar pagos. Una cuenta familiar es P repartido.» «Conectar un banco es dar de alta una cosa, con una plantilla.» «La credencial va al guardián de StateArk.»

## Qué hay (época 0, genérico)

| Pieza | Qué es |
|---|---|
| **connect an account** (conectar una cuenta, PV1, orden 6) | El registro de la cuenta, en el 1.1 de mi alta: 0 su nombre, 1.0 el banco, 1.1 los días que dura el permiso (180), 2 la capacidad 1 (donde el eje lee el tope de E), 3 quién, 4 la acción, 5 el tipo «account». Nada de credenciales ni números de cuenta |
| **account** (tipo, 9.2) | Describe las posiciones de la cuenta y lleva en su 9 su camino |
| **grant the permission** · **renew the permission** (dar y renovar el permiso, PV7, órdenes 4 y 5, modo agente) | «Permiso concedido»: 1.0 qué vence, 1.1 cuándo (como mucho los días de la cuenta después del registro). Dar ancla en el 7 de la cuenta; renovar, en su 7.2 |
| **update the balance** (actualizar el saldo, PV1, orden 9, modo agente) | En el 1 de la cuenta: la magnitud desplegada (1.0 «balance», 1.1 cuánto, 1.2 la unidad, EUR, 1.3 cuándo lo dice el banco) y la fuente en el 3.1 («confirmed by the bank»). No mueve tokens: solo lo que cuesta escribir |
| **the bank speaks through the owner's thing** (regla) | En una cuenta, un permiso o una renovación solo vale si lo escribe una cosa del dueño de la cuenta (la conectora) con un vencimiento que no pasa de su t más los días de la cuenta; un saldo, si su instante (1.3) no es posterior a su t |
| **acting on an account needs P on it** (regla) | Lo anclado en el 4 de una cuenta (o en un hijo del 4: 4.1 … 4.9), y los saldos y permisos anclados en ella, solo valen si quien los escribe, o el dueño de la cosa que los escribe, tiene P sobre la cuenta (registro entero o mirada 1). `contrato.cuenta` lo vuelve a comprobar al leer (con el P de ahora) y solo dice «confirmado por el banco» si el saldo lo escribió la conectora, la cosa que dio el permiso vigente |
| **the E of an account stays with its owner** (regla, VG 17-11, V6) | Un movimiento de E con destino (acuñar, transferir, bloquear, liberar) cuya serie está atada a una cuenta solo vale si el destino es quien escribió la cuenta; quemarla sigue valiendo. Solo se mira cuando la candidata mueve E. Lo anunciado no mueve nada y no se mira; pagarlo sí |
| las acciones que mueven E | no ofrecen la E de una cuenta: «apply a resource» y «lock E as a bid for a quota» no cuentan la E de una cuenta como «tengo E» (ni la puja la propone por defecto); «pay» no ofrece ni propone el anuncio de la E de una cuenta; «write to X» no la toma para pagar la atención; «issue E tied to X» sobre una cuenta solo se ofrece a quien la escribió. Lo dicen sus fórmulas (datos de la época), no el código |
| `contrato.cuenta(eje, id)` | nombre, banco, la E única y quién la tiene, el saldo que manda, el permiso (falta, vigente, caducado) y quién ordena, es decir, quién puede proponer pagos (`ordenan`; `docs/CONTRATO.md` §7.1) |
| la carta | el anverso de la cuenta (saldo, fecha, «confirmado por el banco», permiso y, debajo, VG 17-11, V6: «pueden proponer pagos: ana, bea» —los tres primeros y «y N más»—, «cada pago lo aprueba {titular} en su banco» —el autor de la cuenta— y «ven el saldo quienes leen este libro», sin número: el contrato no da quién lee el libro) y la cartera en el rosetón del 1 (la E de una cuenta con su nombre y su saldo) |
| `ejemplos/ikisai/cuenta-banco.mjs` | el cuarto ejemplo de la carta, «cuenta» |

**El camino del 9**: elegir el banco (connect an account, hecho al escribirla), dar el permiso (grant the permission, lo escribe la conectora: lo de una cosa mía cuenta como mío en el camino), volver (issue E tied to X, la E única: la acción bloquea además el P que pide la cuota, su «commitment») y renovar (renew the permission, en el 7.2 de la cuenta: el paso queda hecho en cuanto hay una renovación; cuándo vence lo dice `contrato.cuenta`). Las renovaciones no se encadenan unas de otras porque la regla tendría que subir por `path`, que no pasa de diez niveles. Sin permiso o con él caducado, la cuenta dice «sin permiso» y lo que se escriba de saldo no cuenta.

## Firme: la cuenta solo se conecta en el libro propio

Core AGRAM 16-11; firme desde VG 17-11 (V6, por Core State):

- Regla «an account lives in its owner's book»: un registro escrito con «connect an account» solo vale si su autor es el autor del génesis del eje (el primer registro del libro: `first (first before.1).3`). Solo se mira cuando la candidata dice «connect an account».
- «connect an account» solo se ofrece a quien escribió el génesis.
- Dentro de ese libro sigue mandando el P: la regla «acting on an account needs P on it» y `contrato.cuenta` no cambian; una persona invitada al libro que gana P sobre la cuenta propone pagos, y cada uno lo aprueba el titular en su banco.
- El ejemplo es el libro propio de ana, con bea invitada por ella.

## Lo que pone StateArk (carril «banco»)

- **La credencial** (el consentimiento del banco, sus tokens): al guardián de StateArk, nunca al libro.
- **La conectora**: una cosa del dueño de la cuenta (alta con «register a thing», con su clave), que va al banco y escribe en el libro «grant the permission», «renew the permission» y «update the balance». El vencimiento lo calcula ella (el BQL mínimo no construye instantes): t del registro + los días de la cuenta, y la validación lo comprueba.
- **La orden de pago** (su acción «payment instruction»): anclada en el 4 de la cuenta (o en un hijo del 4, como el 4.1 de un anuncio). La regla pide P sobre la cuenta a quien la escribe o al dueño de la cosa que la escribe.

## Lo que queda (para VG o Core)

1. **Hecho (ajuste):** «issue E tied to X» lleva una segunda sentencia que bloquea «commitment» (1.3) de mi P sobre X o su mirada 1 con la salida = la serie. Su defecto (1) solo se resuelve si el 2 de X es un entero positivo; si es un texto, el defecto no se resuelve (el léxico no tiene prueba de tipo: `floor` de un texto es ERROR), no se pone y no se bloquea nada. **Límite:** la capacidad que declara solo un antepasado de X no la ve el defecto (recorrer el hilo daría ERROR en el primer texto); ahí «commitment» se pone a mano.
2. **«crear mi cuenta» y la R propia.** Una cuenta recién creada (su génesis, sin emisión) no acuña la E de su cuenta del banco: «minting E needs own R issued» (la regla no se ha cambiado). La época 0 **no tiene una acción para emitir la R propia sin más**: la emiten, como parte de dársela a alguien, «give own R», «admit someone» y «write to X». Quien está sola en su libro puede admitir a su conectora en la cuenta («admit someone», whom = la conectora): eso emite su R y desde ahí acuña (lo hace la prueba del recién llegado). No está en el camino del 9 porque el camino de un tipo es una lista fija de nombres: no sabe poner un paso «solo si falta la R» sin cambiar `acciones.camino`.
3. **El criterio de cierre no va en el registro de la cuenta**: su 2 es la capacidad (un entero solo: `tokens.capacidadDe`), y la cuenta se lee con la plantilla de cerrado por defecto.
4. **Quién puede llegar a tener P sobre una cuenta ajena, y a qué coste.** Con las reglas de hoy:
   - quien escribe cualquier registro colgado de la cuenta (por ejemplo, «anchor here» en ella: no hay precio de atención fuera del alta) obtiene 10 P sobre ese registro y, reposicionándolo un paso hacia arriba, 1 P sobre la cuenta. Coste: lo que cuesta escribir dos registros (unos minutos de su T del día). Desde ahí la regla le deja ordenar. Es lo que hace bea en el ejemplo;
   - ~~quien recibe la E de la cuenta de su emisor obtiene 10 P sobre la mirada 1 de la cuenta~~: ya no puede pasar (VG 17-11, V6: la regla «the E of an account stays with its owner» no deja que la E de una cuenta llegue a otra persona, ni que otra la acuñe para sí);
   - quien tiene P sobre el alta del dueño (el registro entero) baja un paso: una décima más.
   Es decir: hoy cualquiera con alta en el eje puede ordenar (proponer pagos, VG 17-11) sobre una cuenta ajena por unos minutos de T; cada pago lo aprueba el titular en su banco. **Y el mismo camino sirve para escribir saldos y permisos**: con ese P, la regla le deja escribir «update the balance» y «grant/renew the permission», y `contrato.cuenta` los cuenta (un saldo suyo puede mandar; un permiso suyo puede cambiar el vencimiento). Lo único que no consigue es «confirmado por el banco», que exige a la conectora. La regla solo pide P mayor que cero; si VG quiere un umbral (más P, el P del dueño, o que los saldos y permisos solo los escriba una cosa del dueño), es otra regla o un dato.
5. **Hecho (ajuste):** el defecto de «from» (y de «amount») de «reposition P toward X» leía la mirada en `it2.0.5` (en P, siempre vacío) y proponía el P de la mirada 3 del alta, que la regla rechaza; ahora la lee en `it2.0.0.5` y propone un P entero sobre el padre o un hijo. Su 2 no ha cambiado.
