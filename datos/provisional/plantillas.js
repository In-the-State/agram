// Generado por datos/provisional/generar.mjs desde datos/provisional/plantillas.json.
// No se edita a mano: se cambia el JSON y se ejecuta `node datos/provisional/generar.mjs`.

export const PLANTILLAS_PROVISIONALES_DATOS = [
  [
    [
      "name it"
    ],
    [
      [
        [
          "name"
        ],
        [
          "text"
        ],
        [
          "=hex(slice(cat(utf8(it), bytes(\"00\")), 0, 1)) != \"00\" and hex(slice(cat(utf8(it), bytes(\"0000000000000000000000000000000000000000000000000000000000000000000000000000000000\")), 40, 41)) = \"00\""
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "0"
        ],
        [
          "Core AGRAM 18-11 (VG 18-11, «poner nombre»): parámetro de «name it»"
        ],
        [
          "required"
        ],
        [
          1
        ],
        [
          "the new name of the record, plain: at most 40 bytes of UTF-8 (forty letters; one with an accent counts two)"
        ]
      ],
      [
        [
          "about"
        ],
        [
          "ref"
        ],
        [
          "any"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "1"
        ],
        [
          "Core AGRAM 18-11 (VG 18-11, «poner nombre»): parámetro de «name it»"
        ],
        [
          "required"
        ],
        [
          2
        ],
        [
          "=first it.5",
          "the record it names: X"
        ]
      ],
      [
        [
          "criteria"
        ],
        [
          "text"
        ],
        [
          "any"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "2"
        ],
        [
          "Core AGRAM 18-11 (VG 18-11, «poner nombre»): parámetro de «name it»"
        ],
        [
          "required"
        ],
        [
          3
        ],
        [
          "=first epoch.9.0.1.2",
          "the closing template, as in any anchored record"
        ]
      ],
      [
        [
          "who"
        ],
        [
          "identity"
        ],
        [
          "=it = me"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "3"
        ],
        [
          "Core AGRAM 18-11 (VG 18-11, «poner nombre»): parámetro de «name it»"
        ],
        [
          "required"
        ],
        [
          4
        ],
        [
          "=me",
          "who names it: the author of the record, or the person on her own alta"
        ]
      ],
      [
        [
          "actions"
        ],
        [
          "text"
        ],
        [
          "=it = \"name it\""
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "4"
        ],
        [
          "Core AGRAM 18-11 (VG 18-11, «poner nombre»): parámetro de «name it»"
        ],
        [
          "required"
        ],
        [
          5
        ],
        [
          "name it",
          "the action that wrote it"
        ]
      ]
    ],
    [
      "=first it.3 = me or first it.5 = first me.6"
    ],
    [
      [
        "me"
      ],
      [
        "person"
      ]
    ],
    [
      "write"
    ],
    [
      "0"
    ],
    [
      "Core AGRAM 18-11 (VG 18-11: una acción «poner nombre» irá a la época 0; su registro se lee como el nombre del registro sobre el que se lanza): provisional, con la forma exacta que tendrá en el 9.6 de la 0 en su pasada única. Modelo, «rename a conversation» de la época state, pero general: cualquier registro. Un ocupante más en el 0 de X (anclado en su 0, con el nombre en su propio 0); vale el último de quien podía (la lectura «name», en X.0). Se ofrece a quien escribió X y a la persona sobre su propia alta. Lo escrito por otro no se rechaza: lo ignora la lectura (no hay regla que juzgue). Su 4 es «write»: no mueve nada más que el coste de escribir",
      "Molde (el de la época 0, 9.6.0): 0 nombre; 1 los parámetros (cada uno una décupla: 0 etiqueta, 1 tipo, 2 validación «=…» con it = el valor, 3 quién lo da, 4 qué se hace con él, 5 dónde va en el registro que escribe, 6 de dónde viene, 7 required u optional, 8 orden, 9 los defectos y, la última hoja, la ayuda); 2 cuándo se ofrece (BQL con it = X y me = quien mira); 3 quién la lanza y su modo; 4 lo que mueve; 5 dónde ancla; 6 procedencia; 7 época; 8 [punto de vista, orden]; 9 mensaje",
      "La décupla del registro: 0 el nombre (de 1 a 40 bytes de UTF-8, como la etiqueta de una zona); 1 X, la referencia al registro que nombra; 2 el criterio de cierre; 3 quién; 4 «name it». [0, 7]: en el punto de vista 0, detrás de las de la 0 (1 a 5) y de «rename a conversation» de la época state (6)"
    ],
    [
      "epoch 0"
    ],
    [
      0,
      7
    ],
    [
      "name it: {me} names {first it.0} as {first memo.0}"
    ]
  ],
  [
    [
      "a zone of the face"
    ],
    [
      [
        [
          "label"
        ],
        [
          "text"
        ],
        [
          "=hex(slice(cat(utf8(it), bytes(\"00\")), 0, 1)) != \"00\" and hex(slice(cat(utf8(it), bytes(\"0000000000000000000000000000000000000000000000000000000000000000000000000000000000\")), 40, 41)) = \"00\""
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "0"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          1
        ],
        [
          "=first ((payload(it)).0 where \"a zone of the face\" in (payload(it)).4)",
          "the text of the button, plain: at most 40 bytes of UTF-8 (forty letters; one with an accent counts two); on a zone, by default its label"
        ]
      ],
      [
        [
          "x"
        ],
        [
          "number"
        ],
        [
          "=floor it = it and it >= 0 and it <= 1000"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "1.0"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          2
        ],
        [
          "=first ((payload(it)).1.0 where \"a zone of the face\" in (payload(it)).4)",
          "where the box starts from the left, in thousandths of the face (an integer from 0 to 1000)"
        ]
      ],
      [
        [
          "y"
        ],
        [
          "number"
        ],
        [
          "=floor it = it and it >= 0 and it <= 1000"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "1.1"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          3
        ],
        [
          "=first ((payload(it)).1.1 where \"a zone of the face\" in (payload(it)).4)",
          "where the box starts from the top, in thousandths of the face (an integer from 0 to 1000)"
        ]
      ],
      [
        [
          "width"
        ],
        [
          "number"
        ],
        [
          "=floor it = it and (it >= 60 and it + first memo.1.0 <= 1000 or it = 0 and first memo.1.0 = 0 and first memo.1.1 = 0 and first memo.1.3 = 0)"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "1.2"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          4
        ],
        [
          "=first ((payload(it)).1.2 where \"a zone of the face\" in (payload(it)).4)",
          "the width of the box in thousandths: an integer of at least 60 (a finger) and x + width at most 1000; the whole box at zero withdraws the zone it is written on"
        ]
      ],
      [
        [
          "height"
        ],
        [
          "number"
        ],
        [
          "=floor it = it and (it >= 60 and it + first memo.1.1 <= 1000 or it = 0 and first memo.1.0 = 0 and first memo.1.1 = 0 and first memo.1.2 = 0)"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "1.3"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          5
        ],
        [
          "=first ((payload(it)).1.3 where \"a zone of the face\" in (payload(it)).4)",
          "the height of the box in thousandths: an integer of at least 60 and y + height at most 1000; the whole box at zero withdraws the zone it is written on"
        ]
      ],
      [
        [
          "criteria"
        ],
        [
          "text"
        ],
        [
          "any"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "2"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          6
        ],
        [
          "=first epoch.9.0.1.2",
          "the closing template, as in any anchored record"
        ]
      ],
      [
        [
          "who"
        ],
        [
          "identity"
        ],
        [
          "=it = me"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "3"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          7
        ],
        [
          "=me",
          "who writes the zone: the author of the element"
        ]
      ],
      [
        [
          "actions"
        ],
        [
          "text"
        ],
        [
          "=it = \"a zone of the face\""
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "4"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          8
        ],
        [
          "a zone of the face",
          "the action that wrote it"
        ]
      ],
      [
        [
          "book"
        ],
        [
          "text"
        ],
        [
          "=hex(slice(bytes(it), 0, 32)) = it"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "5.0"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          9
        ],
        [
          "=first ((payload(it)).5.0 where \"a zone of the face\" in (payload(it)).4)",
          "=first (first before.5 where not (\"a zone of the face\" in (payload(it)).4))",
          "the book of the destination: the id of its genesis (64 hexadecimal characters in lower case), a datum and not a reference; by default, this book (on a zone, its book)"
        ]
      ],
      [
        [
          "record"
        ],
        [
          "text"
        ],
        [
          "=hex(slice(bytes(it), 0, 32)) = it and (first memo.5.0 != first before.5 or count it.6 > 0)"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "5.1"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a zone of the face»"
        ],
        [
          "required"
        ],
        [
          10
        ],
        [
          "=first ((payload(it)).5.1 where \"a zone of the face\" in (payload(it)).4)",
          "the record the button leads to: its id (64 hexadecimal characters in lower case), a datum; in this book it has to exist. Never an address: only an id"
        ]
      ]
    ],
    [
      "=first it.3 = me"
    ],
    [
      [
        "me"
      ],
      [
        "person"
      ]
    ],
    [
      "write"
    ],
    [
      "0"
    ],
    [
      "Core AGRAM 18-11 (VG 18-11: «a zone of the face» y «a step of the guide» irán a la época 0): provisional, con la forma exacta que tendrá en el 9.6 de la 0 en su pasada única; copia tal cual de datos/epocas/guia-libro/plantillas/a-zone-of-the-face.json, salvo su 6 y su 7 (de qué época es). Una época que la trae (la del libro de la guía, la de cuenta) gana por nombre",
      "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): una zona de la cara es un registro del autor del elemento, anclado en su 0: dónde está el botón sobre el dibujo (la caja, en milésimas de la cara) y a qué registro lleva. El dibujo no sabe nada de las zonas: la carta pinta los botones encima, con su código. Se ofrece solo al autor del elemento, como «attach art to this element» (la lectura ignora las zonas de otros). Su 4 es «write»: no mueve nada más que el coste de escribir",
      "La décupla del registro: 0 la etiqueta; 1 la caja, 1.0 x, 1.1 y, 1.2 ancho, 1.3 alto (enteros de 0 a 1000, x + ancho y y + alto sin pasar de 1000, ancho y alto de 60 como poco, salvo la caja toda a cero); 2 el criterio de cierre; 3 quién; 4 «a zone of the face»; 5 el destino: 5.0 su libro (por defecto, el génesis de este libro) y 5.1 el registro, dos ids de 64 hexadecimales como datos. Nunca una dirección: la validación solo admite ids",
      "Sustituir y retirar: la zona nueva se lanza sobre la zona vieja (X es la zona; ancla en su 0). Cuenta si es del autor del elemento; con la caja toda a cero, la retira. Lanzada sobre una zona, sus defectos son los de esa zona (mover una zona es cambiar sus números)"
    ],
    [
      "epoch 0"
    ],
    [
      2,
      13
    ],
    [
      "a zone of the face: {me} puts the zone {first memo.0} on the face of {first it.0}"
    ]
  ],
  [
    [
      "a step of the guide"
    ],
    [
      [
        [
          "title"
        ],
        [
          "text"
        ],
        [
          "=it != \"\""
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "0"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a step of the guide»"
        ],
        [
          "required"
        ],
        [
          1
        ],
        [
          "the title of the step, in plain words"
        ]
      ],
      [
        [
          "action"
        ],
        [
          "text"
        ],
        [
          "=it != \"\""
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "1.0"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a step of the guide»"
        ],
        [
          "required"
        ],
        [
          2
        ],
        [
          "the action, by its canonical name: a transaction template of the epoch of the book where it is done (not checked here: that book may be another one)"
        ]
      ],
      [
        [
          "parameters"
        ],
        [
          "text"
        ],
        [
          "any"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "1.1"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a step of the guide»"
        ],
        [
          "optional"
        ],
        [
          3
        ],
        [
          "the parameters of the action, one occupant each as «label: value» (the name or the label of the parameter and its value as it is written in a form: the shape of a proposal of the external exit)"
        ]
      ],
      [
        [
          "why"
        ],
        [
          "text"
        ],
        [
          "=it != \"\""
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "2"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a step of the guide»"
        ],
        [
          "required"
        ],
        [
          4
        ],
        [
          "why this step, one sentence"
        ]
      ],
      [
        [
          "who"
        ],
        [
          "identity"
        ],
        [
          "=it = me"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "3"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a step of the guide»"
        ],
        [
          "required"
        ],
        [
          5
        ],
        [
          "=me",
          "who writes the step: the author of the guide"
        ]
      ],
      [
        [
          "actions"
        ],
        [
          "text"
        ],
        [
          "=it = \"a step of the guide\""
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "4"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a step of the guide»"
        ],
        [
          "required"
        ],
        [
          6
        ],
        [
          "a step of the guide",
          "the action that wrote it"
        ]
      ],
      [
        [
          "book"
        ],
        [
          "text"
        ],
        [
          "=hex(slice(bytes(it), 0, 32)) = it"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "5.0"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a step of the guide»"
        ],
        [
          "required"
        ],
        [
          7
        ],
        [
          "=first before.5",
          "the book where it is done: the id of its genesis (64 hexadecimal characters in lower case), a datum and not a reference; by default, this book"
        ]
      ],
      [
        [
          "record"
        ],
        [
          "text"
        ],
        [
          "=hex(slice(bytes(it), 0, 32)) = it and (first memo.5.0 != first before.5 or count it.6 > 0)"
        ],
        [
          "me"
        ],
        [
          "payload"
        ],
        [
          "5.1"
        ],
        [
          "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): parámetro de «a step of the guide»"
        ],
        [
          "optional"
        ],
        [
          8
        ],
        [
          "the record it is done on: its id (64 hexadecimal characters in lower case), a datum; in this book it has to exist; empty: the alta of whoever follows the guide in that book"
        ]
      ]
    ],
    [
      "=first it.3 = me"
    ],
    [
      [
        "me"
      ],
      [
        "person"
      ]
    ],
    [
      "write"
    ],
    [
      "4"
    ],
    [
      "Core AGRAM 18-11 (VG 18-11: «a zone of the face» y «a step of the guide» irán a la época 0): provisional, con la forma exacta que tendrá en el 9.6 de la 0 en su pasada única; copia tal cual de datos/epocas/guia-libro/plantillas/a-step-of-the-guide.json, salvo su 6 y su 7 (de qué época es). Una época que la trae (la del libro de la guía, la de cuenta) gana por nombre",
      "Core AGRAM 17-11 (encargo «zonas de la cara y guía mínima», pieza 1; VG 17-11 por Core State; agram-equipo/DISENO_ZONAS_GUIA.md): un paso de la guía es un registro del autor de la guía, anclado en el 4 de la guía. Dice qué acción real se hace, en qué libro y sobre qué registro, con qué parámetros y por qué. No guarda estado: está hecho cuando la acción real está escrita (la misma regla que el tutorial del camino, docs/CONTRATO.md §12.5). Se ofrece solo al autor del elemento, que es quien cuenta (la lectura ignora los pasos de otros). Su 4 es «write»: no mueve nada más que el coste de escribir",
      "La décupla del registro (manda la décupla sobre la colocación del diseño): 0 el título; 1.0 la acción y 1.1 sus parámetros «etiqueta: valor» (lo que se hace y con cuánto); 2 el porqué; 3 quién; 4 «a step of the guide» (el 4 nombra la acción que escribe el registro, como en todo registro: si llevara la acción del paso, un paso «close with error» en el 4 de la guía la cerraría con error, porque la plantilla de cerrado lee lo que dice el 4 de lo anclado en el 4); 5 dónde se hace: 5.0 el libro (por defecto, el génesis de este libro) y 5.1 el registro (opcional, al final: sin él, el alta de quien sigue la guía). Sin huecos ni rellenos (VG 13-11, #77); sin tipo en el 5 (la plantilla de transacción ya tiene diez parámetros en la zona, el tope de una décupla, y el 5 es dónde se hace)"
    ],
    [
      "epoch 0"
    ],
    [
      4,
      29
    ],
    [
      "a step of the guide: {me} adds to the guide {first it.0} the step {first memo.0}"
    ]
  ]
];
