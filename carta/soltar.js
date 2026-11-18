// Soltar en una caja, en la carta (VG 18-11: «soltar en una caja es crear ahí lo que la época permita»). Soltar compone en
// el borrador, como tocar o rellenar; nunca escribe en el acto. Qué encaja lo dice el núcleo (src/soltar.js loQueEncaja);
// aquí, lo que la carta hace con eso:
//
//   queHacerAlSoltar(r)            una opción: componerla; varias: elegir una en una lista corta; ninguna: el motivo
//   entradaAlSoltar(opcion, destino)  lo que va al borrador (bandeja.poner): la acción, sobre qué, lo relleno, dónde se
//                                  compuso (el registro de la caja y su punto de vista) y si está completa
//   htmlElegirAlSoltar · elegirEnPagina  la lista corta, en la página (el patrón de carta/confirmar.js)
//
// Ninguna acción se nombra aquí: llegan por su id, con su etiqueta en el idioma.

import { t } from './textos.js';

const escapar = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Qué hace la carta con lo que dio loQueEncaja: { componer: opción } si encaja una; { elegir: [opciones] } si varias;
 * { aviso: texto en llano } si ninguna (nada que la época permita ahí, o lo permite pero no a ti, con la condición que
 * falla si el núcleo la da). `nombre(accion)`: el nombre de una acción en el idioma (sin él, el que traiga).
 */
export function queHacerAlSoltar(r, { nombre = (a) => a } = {}) {
  const encajan = r?.encajan ?? [];
  if (encajan.length === 1) return { componer: encajan[0] };
  if (encajan.length > 1) return { elegir: encajan };
  if (r?.motivo?.que === 'no-a-ti') {
    const porque = (r.motivo.acciones ?? []).map((a) => a.texto || t('soltarNoSeOfrece', { accion: nombre(a.nombre) })).join(' · ');
    return { aviso: t('soltarNoATi', { porque }) };
  }
  return { aviso: t('soltarNada') };
}

/**
 * La entrada del borrador de una opción de soltar: sobre el registro que dice la opción, con lo que rellena el gesto;
 * compuesta donde se soltó (el registro de la caja y el punto de vista de su lugar, para que se vea ahí). Si le falta algo
 * por rellenar, queda a medias, como cualquier entrada del borrador.
 */
export function entradaAlSoltar(opcion, destino) {
  const pv = typeof destino?.lugar === 'string' && /^\d/.test(destino.lugar) ? Number(destino.lugar[0]) : null;
  return {
    accion: opcion.accion, X: opcion.X, valores: { ...(opcion.valores ?? {}) },
    donde: { X: destino?.X ?? opcion.X, pv }, completa: !(opcion.faltan ?? []).length,
  };
}

/** La lista corta para elegir qué preparar al soltar: una frase y un botón por opción (su etiqueta), y «cancelar». */
export function htmlElegirAlSoltar({ opciones = [] } = {}) {
  const botones = opciones.map((o, k) => `<li><button type="button" class="principal" data-soltar-elegir="${k}">${escapar(o.etiqueta ?? o.nombre ?? o.accion)}</button></li>`).join('');
  return `<section class="formulario confirmar soltar-elegir" role="dialog" aria-modal="true" aria-labelledby="soltar-texto">
    <p id="soltar-texto">${escapar(t('soltarElige'))}</p>
    <ul class="soltar-opciones">${botones}</ul>
    <footer><button type="button" data-soltar-elegir="no">${escapar(t('soltarCancelar'))}</button></footer>
  </section>`;
}

let abierta = false;

/** Pregunta qué preparar, dentro de la página. Resuelve el índice elegido; null con «cancelar», el fondo o Escape. */
export function elegirEnPagina(opciones, { documento = globalThis.document } = {}) {
  return new Promise((resolver) => {
    if (abierta || !documento?.body) { resolver(null); return; }
    abierta = true;
    const antes = documento.activeElement ?? null;
    const fondo = documento.createElement('div');
    fondo.className = 'formulario-fondo confirmar-fondo';
    fondo.innerHTML = htmlElegirAlSoltar({ opciones });
    const cerrar = (k) => {
      if (!abierta) return;
      abierta = false;
      documento.removeEventListener('keydown', alTeclado, true);
      fondo.remove();
      try { antes?.focus?.({ preventScroll: true }); } catch { /* sin foco al que volver */ }
      resolver(k);
    };
    const alTeclado = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault?.();
      e.stopPropagation?.();
      e.stopImmediatePropagation?.();
      cerrar(null);
    };
    fondo.addEventListener('click', (e) => {
      const boton = e.target?.closest?.('[data-soltar-elegir]');
      if (boton) {
        e.preventDefault?.();
        const k = boton.getAttribute('data-soltar-elegir');
        cerrar(k === 'no' ? null : Number(k));
        return;
      }
      if (e.target === fondo) cerrar(null);
    });
    documento.addEventListener('keydown', alTeclado, true);
    documento.body.append(fondo);
    fondo.querySelector('[data-soltar-elegir="no"]')?.focus?.();
  });
}
