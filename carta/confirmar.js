// La confirmación dentro de la página, en lugar del `confirm` del navegador (el patrón que dejó el emparejamiento,
// carta/emparejar.js htmlConfirmarEmparejar): el mismo diálogo de la carta (fondo, sección y pie con botones), una frase y
// «Seguir» / «Cancelar». Sirve a quien la pida: olvidar una cuenta (carta/app.js) y vaciar las opiniones (carta/opinar.js).
//
// htmlConfirmar es puro (se prueba en Node, test/carta-confirmar.test.js); confirmarEnPagina es lo único que toca el DOM:
// pone el diálogo en el <body> (fuera de la carta: un repintado no lo quita) y resuelve true con «Seguir», false con
// «Cancelar», el fondo o Escape. El foco empieza en «Cancelar» y, al cerrar, vuelve a donde estaba.

import { t } from './textos.js';

const escapar = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** El diálogo de la confirmación. `texto` ya va dicho en llano; se escapa. */
export function htmlConfirmar({ texto = '' } = {}) {
  return `<section class="formulario confirmar" role="alertdialog" aria-modal="true" aria-labelledby="confirmar-texto">
    <p id="confirmar-texto" data-confirmar-texto>${escapar(texto)}</p>
    <footer><button type="button" class="principal" data-confirmar="si">${escapar(t('confirmarSeguir'))}</button> <button type="button" data-confirmar="no">${escapar(t('confirmarCancelar'))}</button></footer>
  </section>`;
}

let abierta = false;

/** Pregunta dentro de la página. Resuelve true con «Seguir»; false con «Cancelar», el fondo o Escape (y false si ya hay otra pregunta abierta). */
export function confirmarEnPagina(texto, { documento = globalThis.document } = {}) {
  return new Promise((resolver) => {
    if (abierta || !documento?.body) { resolver(false); return; }
    abierta = true;
    const antes = documento.activeElement ?? null;
    const fondo = documento.createElement('div');
    fondo.className = 'formulario-fondo confirmar-fondo';
    fondo.setAttribute('data-confirmar-fondo', '');
    fondo.innerHTML = htmlConfirmar({ texto });
    const cerrar = (si) => {
      if (!abierta) return;
      abierta = false;
      documento.removeEventListener('keydown', alTeclado, true);
      fondo.remove();
      try { antes?.focus?.({ preventScroll: true }); } catch { /* sin foco al que volver */ }
      resolver(si);
    };
    const alTeclado = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault?.();
      e.stopPropagation?.();
      e.stopImmediatePropagation?.();
      cerrar(false);
    };
    fondo.addEventListener('click', (e) => {
      const boton = e.target?.closest?.('[data-confirmar]');
      if (boton) { e.preventDefault?.(); cerrar(boton.getAttribute('data-confirmar') === 'si'); return; }
      if (e.target === fondo) cerrar(false);
    });
    documento.addEventListener('keydown', alTeclado, true);
    documento.body.append(fondo);
    fondo.querySelector('[data-confirmar="no"]')?.focus?.();
  });
}
