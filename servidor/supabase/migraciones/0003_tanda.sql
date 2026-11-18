-- La tanda (agram-equipo/CONTRATO_TANDA.md, 18-11): varios eventos que entran
-- todos o ninguno, con órdenes consecutivos y sin que nada de otro se cuele
-- entre medias. La función de borde (funciones/eventos, POST /eventos/tanda)
-- comprueba la marca, la forma y los topes; aquí solo se guarda, de una vez.
--
--   insertar_tanda(p_eje, p_filas) → (orden, recibido) por miembro, en orden.
--   p_filas: [{ id, autor, firma, cuerpo }, …] (de 1 a 32; la marca la mira la función de borde).
--   Si alguna fila ya estaba en el eje, no inserta ninguna y no devuelve nada (la función de borde lo lee como null).
--
-- Atómica: PostgREST llama a la función dentro de UNA transacción; si algo
-- falla a medias (un choque de clave que llegue a la vez, un check), la
-- transacción entera se deshace y no queda ninguna fila. `recibido` es el
-- now() de la transacción: el mismo para toda la tanda.
--
-- Órdenes consecutivos: `orden` sale de la secuencia de eventos (bigserial,
-- común a todos los ejes). Para que ninguna otra inserción tome un número entre
-- medias, la función bloquea la tabla en modo SHARE ROW EXCLUSIVE hasta el
-- final de la transacción: choca con las inserciones (ROW EXCLUSIVE, también
-- las de POST /eventos de uno en uno, que esperan) y con otra tanda, pero no con
-- las lecturas (ACCESS SHARE), que siguen y no ven la tanda hasta que se
-- confirma entera. Así GET /eventos nunca sirve media tanda.
--
-- SECURITY DEFINER: bloquear en ese modo exige más que el insert que tiene
-- service_role (UPDATE, DELETE o TRUNCATE, que a propósito no tiene: la tabla
-- es de solo añadir). La función corre como su dueño (quien aplica la
-- migración), con search_path fijo, y solo service_role puede llamarla.
-- Idempotente, como las otras migraciones.

create or replace function public.insertar_tanda(p_eje text, p_filas jsonb)
returns table (orden bigint, recibido timestamptz)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_fila jsonb;
  v_orden bigint;
  v_recibido timestamptz;
begin
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) < 1 or jsonb_array_length(p_filas) > 32 then
    raise exception 'insertar_tanda: p_filas debe ser una lista de 1 a 32 filas' using errcode = '22023';
  end if;

  lock table public.eventos in share row exclusive mode;
  -- Solo dentro de esta función (y de esta transacción) puede entrar un registro con contexto.tanda: el disparador de abajo.
  perform set_config('agram.insertando_tanda', 'si', true);

  -- Alguna ya estaba (un reintento, o dos a la vez): no se inserta ninguna.
  if exists (
    select 1
    from public.eventos e
    join jsonb_array_elements(p_filas) as f(fila) on e.id = f.fila->>'id'
    where e.eje = p_eje
  ) then
    return;
  end if;

  for v_fila in select f.fila from jsonb_array_elements(p_filas) with ordinality as f(fila, i) order by f.i loop
    insert into public.eventos as e (eje, id, autor, firma, cuerpo)
    values (p_eje, v_fila->>'id', v_fila->>'autor', v_fila->>'firma', v_fila->'cuerpo')
    returning e.orden, e.recibido into v_orden, v_recibido;
    orden := v_orden;
    recibido := v_recibido;
    return next;
  end loop;
  perform set_config('agram.insertando_tanda', '', true);
end;
$$;

revoke all on function public.insertar_tanda(text, jsonb) from public, anon, authenticated;
grant execute on function public.insertar_tanda(text, jsonb) to service_role;

-- Un miembro de una tanda nunca se guarda por el camino suelto (CONTRATO_TANDA), entre por donde entre: una fila cuyo
-- cuerpo lleva contexto.tanda solo se inserta desde insertar_tanda, que marca la transacción. La función de borde ya lo
-- rechaza antes (400 en POST /eventos; el almacén lo vuelve a mirar); esto es la última defensa, en la base.
create or replace function public.tanda_solo_entera() returns trigger
language plpgsql as $$
begin
  if jsonb_typeof(new.cuerpo->'contexto') = 'object' and (new.cuerpo->'contexto') ? 'tanda'
     and coalesce(current_setting('agram.insertando_tanda', true), '') <> 'si' then
    raise exception 'un miembro de una tanda no se guarda suelto: va entera por insertar_tanda' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists eventos_tanda_solo_entera on public.eventos;
create trigger eventos_tanda_solo_entera
  before insert on public.eventos
  for each row execute function public.tanda_solo_entera();
