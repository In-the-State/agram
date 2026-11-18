// Generado por datos/provisional/generar.mjs desde datos/provisional/lecturas.json.
// No se edita a mano: se cambia el JSON y se ejecuta `node datos/provisional/generar.mjs`.

export const LECTURAS_PROVISIONALES_DATOS = [
  [
    [
      "what is missing"
    ],
    [
      "X.4.8",
      "epoch.4.2",
      "epoch.9.0.0",
      "epoch.9.0.1",
      "epoch.9.0.3",
      "moves",
      "apply"
    ],
    [
      "=(((first it.4).8 each (((moves it2) where \"anunciado\" in it3.2 and count ((down it2) where count ((moves it4) where not \"anunciado\" in it5.2 and it5.0 = it3.0 and it5.3.0 = it3.3.0 and it5.3.1 = it3.3.1 and it5.4 = it3.4 and it5.1 >= it3.1) > 0) = 0) each (row(it3.0, it3.1, \"stage\", row(it3.3.0, it3.3.1), row(first ((epoch.4.2.0.2 where E in it3.0.0.0) with (epoch.4.2.1.2 where P in it3.0.0.0) with (epoch.4.2.2.2 where R in it3.0.0.0) with (epoch.4.2.3.2 where T in it3.0.0.0)), it), it2, it3.7.1, (0 where 1 = 0), row(\"announcement\", it2), row(first ((payload(it2)).0 with payload(it2))))) with (it2 where count (moves it3 where \"anunciado\" in it4.2) = 0) each (row(first (before.4.(first it3.0) with first it3.0), last it3.1, \"stage\", row(last it3.3.0, last it3.3.1), row(first ((epoch.4.2.0.2 where E in (before.4.(first it3.0)).0.0) with (epoch.4.2.1.2 where P in (before.4.(first it3.0)).0.0) with (epoch.4.2.2.2 where R in (before.4.(first it3.0)).0.0) with (epoch.4.2.3.2 where T in (before.4.(first it3.0)).0.0)), it), it3, (0 where 1 = 0), (0 where 1 = 0), row(\"announcement\", it3), row(last (payload(it3)).2))))) with (((((0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (epoch.9.0.0.1.(it2))) where first it2.0 = last ((((payload(it)).2 with (payload(it)).2.2) where count it3.0 = 0) where it3 in (((0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (epoch.9.0.0.1.(it4))) each 0 with ((0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (epoch.9.0.0.5.(it4))) each 0))) each (row(P.(it), first (((((payload(it)).2 with (payload(it)).2.2) where count it3.0 = 0) where it3.2 = \"above\") each 1 with epoch.9.0.0.2), \"weight\", row((0 where 1 = 0), (0 where 1 = 0)), row(first epoch.9.0.3.1.2.0, it), it, (0 where 1 = 0), apply(last it2.1, it), (0 where 1 = 0), row(\"the tally of\", first it.3, \"with\", first it2.0, \"gives\", apply(last it2.1, it), \"and asks above\", first (((((payload(it)).2 with (payload(it)).2.2) where count it3.0 = 0) where it3.2 = \"above\") each 1 with epoch.9.0.0.2))))) where not (it2.7 > it2.1))) where count (((0 with 1 with 2 with 3 with 4 with 5 with 6 with 7 with 8 with 9) each (epoch.9.0.1.1.(it3))) where (first it3.0 = \"closed with error\" or first it3.0 = \"expired\" or first it3.0 = \"closed by decision\") and first apply(last it3.1, it)) = 0"
    ],
    [
      "X.4.9"
    ],
    [
      "read"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §6, decisiones 1 a 3, supuestos por confirmar con VG): lo que el motor deducía en JavaScript (motor.siguiente, acciones.camino), escrito como una lectura de la época que se materializa en X.4.9 (fábrica · cómo y el siguiente paso, al lado de X.4.8, «stage»). Provisional hasta la pasada única por la época 0, que la pondrá en su 2 tal cual",
      "Una fila por cada movimiento que falta, la misma para todos los que miran (no lee me): 0 qué se mueve (la serie; en el recuento, P.(X)), 1 cuánto (lo anunciado; en el recuento, el umbral), 2 por qué (stage, o el nombre del recuento), 3 quién (3.0 quién tiene que actuar, una o varias identidades; en el recuento, las que nombra su lista o el dueño; 3.1 a quién), 4 la acción que lo cumple (de epoch.4.2 por la familia de la serie; para el recuento, epoch.9.0.3.1.2.0), 5 sobre qué registro se lanza (el anuncio, o X), 6 para cuándo (el 7.1 del movimiento anunciado), 7 lo que hay (el valor del recuento)",
      "Lo anunciado: los movimientos anunciados de cada anuncio pendiente ((first X.4).8, la lectura «stage») que ningún registro anclado sobre él ha movido aún, con la misma comparación que «stage»; y el anuncio de antes (un payload que imita un movimiento), su fila. El recuento: el último nombre de recuento (epoch.9.0.0.1) o de lo que no lo es (epoch.9.0.0.5) que el dueño dice en su criterio (su 2 o su 2.2, solo lo de su payload), su umbral («above x» o epoch.9.0.0.2) y su valor (apply de la fórmula de la época); da fila si es un recuento de la época y su valor no pasa del umbral. Un proceso terminado (las plantillas de cerrado «closed with error», «expired» y «closed by decision» de epoch.9.0.1, aplicadas a X) no da filas",
      "La forma de cada fila (Core AGRAM 18-11, tercera tanda): 0 qué se mueve, 1 cuánto, 2 la regla o lectura que lo pide (su mensaje encabeza el texto), 3 quién (3.0 quién tiene que actuar, una o varias identidades, o nadie si es quien tenga la acción ofrecida; 3.1 a quién), 4 qué se hace (4.0 la acción que lo cumple, 4.1 sobre qué registro se lanza), 5 el registro del que trata, 6 para cuándo, 7 lo que hay, 8 los parámetros de la acción como pares nombre, valor, 9 el texto (piezas que se leen seguidas; si la fila tiene a quién, detrás va el movimiento legible). Quien lee no distingue las filas por su nombre"
    ],
    [
      "epoch 0"
    ],
    [
      "after stage"
    ],
    [
      "what is missing: one row per movement that X still needs and per tally that does not pass, with who has to act and the action that does it"
    ]
  ],
  [
    [
      "path steps"
    ],
    [
      "X.4.9",
      "X.7.1",
      "X.7.4",
      "before.3",
      "before.6.0",
      "epoch.7.0.3.1",
      "moves"
    ],
    [
      "=(((first it.4).9 with ((((moves (first it.3)) where R in it2.0.0.0 and transfer in it2.4 and it2.0.0.1 = first it.3 and it2.3.1 = first it.3 and it2.3.0 != first it.3 group it2.6.5) each 0) where not first (first it2.7).4 and count (before.3 where first it3.6 = it) > 0) each (row((0 where 1 = 0), (0 where 1 = 0), \"attended\", row(first it.3, (0 where 1 = 0)), row(\"attend\", it2), it2, (0 where 1 = 0), (0 where 1 = 0), (0 where 1 = 0), row(first ((payload(it2)).0 with payload(it2)))))) with ((first it.7).1 where count it2.7 > 0 and (first it2.7).0 <= (first before.6.0).0 + first epoch.7.0.3.1) each (row(it2.0, it2.1, \"E is tied to a record that exists\", row(it2.0.0.1, (0 where 1 = 0)), row(\"expire something mine\", it), it, first it2.7, (0 where 1 = 0), row(\"series\", it2.0), row(it2.0, \"expires at\", first it2.7))))"
    ],
    [
      "X.9.8"
    ],
    [
      "read"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md §6): lo que acciones.camino deducía en JavaScript de las reglas, como una lectura de la época que se materializa en X.9.8 (camino, frente a otros). Provisional hasta la pasada única por la época 0",
      "Las filas de X.4.9 («what is missing») y, con la misma forma, dos clases más: (1) las peticiones de atención sin atender, si X es un alta: los registros que devuelven R de su dueño (first X.3) a su dueño, de otro, sin la lectura «attended» (su 7.4), con «attend» sobre la petición y el dueño como quien actúa; (2) las caducidades próximas: las series vivas del subárbol de X (X.7.1) que caducan antes de un día del calendario (epoch.7.0.3.1) después del reloj del libro (before.6.0, o el que fije quien lee), con «expire something mine» sobre X, su emisor como quien actúa, su caducidad en el 6 y, en el 8, los parámetros como pares nombre, valor: series y la serie",
      "Lo que no entra todavía: el tutorial (el 9 del tipo, el de identidad y el de X) y las sugerencias, que siguen en acciones.camino",
      "La forma de cada fila (Core AGRAM 18-11, tercera tanda): 0 qué se mueve, 1 cuánto, 2 la regla o lectura que lo pide (su mensaje encabeza el texto), 3 quién (3.0 quién tiene que actuar, una o varias identidades, o nadie si es quien tenga la acción ofrecida; 3.1 a quién), 4 qué se hace (4.0 la acción que lo cumple, 4.1 sobre qué registro se lanza), 5 el registro del que trata, 6 para cuándo, 7 lo que hay, 8 los parámetros de la acción como pares nombre, valor, 9 el texto (piezas que se leen seguidas; si la fila tiene a quién, detrás va el movimiento legible). Quien lee no distingue las filas por su nombre"
    ],
    [
      "epoch 0"
    ],
    [
      "after what is missing"
    ],
    [
      "path steps: what the rules ask on X, one row each, with who has to act and the action that does it"
    ]
  ],
  [
    [
      "chosen cohort"
    ],
    [
      "X.8",
      "X.3",
      "payload"
    ],
    [
      "=(last ((down it) where last (first it2.6).5 = \"8000000000\" and first it2.3 = first it.3 and \"change cohort\" in (payload(it2)).4)) each (row(first (payload(it2)).0, it2))"
    ],
    [
      "X.8.5"
    ],
    [
      "read"
    ],
    [
      "*"
    ],
    [
      "Core AGRAM 18-11 (docs/notas/NUCLEO_6_7_8.md, tercera tanda): la cohorte que eligió el dueño de X, como lectura de la época que se materializa en X.8.5 (frente a otros · dónde encaja). Provisional hasta la pasada única por la época 0",
      "El último registro del dueño de X anclado en su 8 que dice «change cohort» en su 4 (la acción que lo escribe, como dato aquí y no en el núcleo): una fila con 0 la cohorte (el 0 de ese registro, donde la escribe su parámetro «cohort») y 1 ese registro. Sin él, nada. La lee contrato.cohorte (cohorteEscrita)"
    ],
    [
      "epoch 0"
    ],
    [
      "after maturity"
    ],
    [
      "chosen cohort: the cohort the owner of X chose in its 8, and the record that says it"
    ]
  ]
];
