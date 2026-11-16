# La cuenta del banco: una E única con el saldo como dato

Core AGRAM, 16-11 (encargo «cuenta del banco», rama `beta-banco`). Decisión de VG del 16-11, que trae Core State. **Estado:** en la beta, sin aceptar.

> «La cuenta del banco es una E única, como una mesa. El saldo es un dato de su registro, que se actualiza con lo que dice el banco. No hay unidades de euro fungibles en el libro.» «El P sobre ese registro dice quién puede ordenar pagos. Una cuenta familiar es P repartido.» «Conectar un banco es dar de alta una cosa, con una plantilla.» «La credencial va al guardián de StateArk.»

## Qué hay (época 0, genérico)

| Pieza | Qué es |
|---|---|
| **connect an account** (conectar una cuenta, PV1, orden 6) | El registro de la cuenta, en el 1.1 de mi alta: 0 su nombre, 1.0 el banco, 1.1 los días que dura el permiso (180), 2 la capacidad 1 (donde el eje lee el tope de E), 3 quién, 4 la acción, 5 el tipo «account». Nada de credenciales ni números de cuenta |
| **account** (plantilla de datos, 9.2) | Describe las posiciones de la cuenta y lleva en su 9 su camino |
| **grant the permission** · **renew the permission** (dar y renovar el permiso, PV7, órdenes 4 y 5, modo agente) | «Permiso concedido»: 1.0 qué vence, 1.1 cuándo (como mucho los días de la cuenta después del registro). Dar ancla en el 7 de la cuenta; renovar, en su 7.2 |
| **update the balance** (actualizar el saldo, PV1, orden 9, modo agente) | En el 1 de la cuenta: la magnitud desplegada (1.0 «balance», 1.1 cuánto, 1.2 la unidad, EUR, 1.3 cuándo lo dice el banco) y la fuente en el 3.1 («confirmed by the bank»). No mueve tokens: solo lo que cuesta escribir |
| **acting on an account needs P on it** (regla) | Lo anclado en el 4 de una cuenta (o en un hijo del 4: 4.1 … 4.9), y los saldos y permisos anclados en ella, solo valen si quien los escribe, o el dueño de la cosa que los escribe, tiene P sobre la cuenta (registro entero o mirada 1). `contrato.cuenta` lo vuelve a comprobar al leer (con el P de ahora) y solo dice «confirmado por el banco» si el saldo lo escribió la conectora, la cosa que dio el permiso vigente |
| `contrato.cuenta(eje, id)` | nombre, banco, la E única y quién la tiene, el saldo que manda, el permiso (falta, vigente, caducado) y quién ordena (`docs/CONTRATO.md` §7.1) |
| la carta | el anverso de la cuenta (saldo, fecha, «confirmado por el banco», permiso) y la cartera en el rosetón del 1 (la E de una cuenta con su nombre y su saldo) |
| `ejemplos/ikisai/cuenta-banco.mjs` | el cuarto ejemplo de la carta, «cuenta» |

**El camino del 9**: elegir el banco (connect an account, hecho al escribirla), dar el permiso (grant the permission, lo escribe la conectora: lo de una cosa mía cuenta como mío en el camino), volver (issue E tied to X, la E única) y renovar (renew the permission, en el 7.2 de la cuenta: el paso queda hecho en cuanto hay una renovación; cuándo vence lo dice `contrato.cuenta`). Las renovaciones no se encadenan unas de otras porque la regla tendría que subir por `path`, que no pasa de diez niveles. Sin permiso o con él caducado, la cuenta dice «sin permiso» y lo que se escriba de saldo no cuenta.

## Lo que pone StateArk (carril «banco»)

- **La credencial** (el consentimiento del banco, sus tokens): al guardián de StateArk, nunca al libro.
- **La conectora**: una cosa del dueño de la cuenta (alta con «register a thing», con su clave), que va al banco y escribe en el libro «grant the permission», «renew the permission» y «update the balance». El vencimiento lo calcula ella (el BQL mínimo no construye instantes): t del registro + los días de la cuenta, y la validación lo comprueba.
- **La orden de pago** (su plantilla «payment instruction»): anclada en el 4 de la cuenta (o en un hijo del 4, como el 4.1 de un anuncio). La regla pide P sobre la cuenta a quien la escribe o al dueño de la cosa que la escribe.

## Lo que queda (para VG o Core)

1. **La E única no se acuña solo con «issue E tied to X».** Un registro con capacidad pide, por la cuota del tope (`src/condiciones/tope.js`, D1 y F1), P de quien acuña bloqueado con la salida = la serie; la plantilla no lo bloquea y ninguna plantilla de la época 0 bloquea P con esa salida («commit P» usa X). El ejemplo y las pruebas escriben el evento de la plantilla con un movimiento más: 1 de su P sobre la cuenta, bloqueado con la salida = la serie. Falta decidir: una sentencia más en «issue E tied to X» cuando el registro declara capacidad, o una plantilla nueva.
2. **«crear mi cuenta» y la R propia.** Una cuenta recién creada (su génesis, sin emisión) no acuña la E de su cuenta del banco: «minting E needs own R issued». En cuanto invita a alguien (la invitación le guarda una unidad de su R), sí. La regla no se ha cambiado.
3. **El criterio de cierre no va en el registro de la cuenta**: su 2 es la capacidad (un entero solo: `tokens.capacidadDe`), y la cuenta se lee con la plantilla de cerrado por defecto.
4. **Quién puede llegar a tener P sobre una cuenta ajena, y a qué coste.** Con las reglas de hoy:
   - quien escribe cualquier registro colgado de la cuenta (por ejemplo, «anchor here» en ella: no hay precio de atención fuera del alta) obtiene 10 P sobre ese registro y, reposicionándolo un paso hacia arriba, 1 P sobre la cuenta. Coste: lo que cuesta escribir dos registros (unos minutos de su T del día). Desde ahí la regla le deja ordenar. Es lo que hace bea en el ejemplo;
   - quien recibe la E de la cuenta de su emisor obtiene 10 P sobre la mirada 1 de la cuenta;
   - quien tiene P sobre el alta del dueño (el registro entero) baja un paso: una décima más.
   Es decir: hoy cualquiera con alta en el eje puede ordenar sobre una cuenta ajena por unos minutos de T. **Y el mismo camino sirve para escribir saldos y permisos**: con ese P, la regla le deja escribir «update the balance» y «grant/renew the permission», y `contrato.cuenta` los cuenta (un saldo suyo puede mandar; un permiso suyo puede cambiar el vencimiento). Lo único que no consigue es «confirmado por el banco», que exige a la conectora. La regla solo pide P mayor que cero; si VG quiere un umbral (más P, el P del dueño, o que los saldos y permisos solo los escriba una cosa del dueño), es otra regla o un dato.
5. La plantilla «reposition P toward X», lanzada sobre la cuenta, propone por defecto el P de la mirada 3 del alta del dueño (el que da la invitación), que no es un paso y la regla rechaza; hay que nombrar el P de origen («from»).
