-- Cierra portfolio_state: hoy cualquiera con la key publicable puede leer y sobrescribir
-- la cartera. Despues de esto, solo el dueño autenticado.
--
-- Se ata al mail y no al uuid del usuario a proposito: si alguna vez borras y recreas
-- el usuario, el uuid cambia y las politicas dejarian de valer; el mail sigue siendo el mismo.

drop policy if exists "Public read"   on public.portfolio_state;
drop policy if exists "Public write"  on public.portfolio_state;
drop policy if exists "Public update" on public.portfolio_state;

create policy "Dueño lee" on public.portfolio_state
  for select to authenticated
  using ((select auth.jwt() ->> 'email') = 'fkonaszuk8@gmail.com');

create policy "Dueño inserta" on public.portfolio_state
  for insert to authenticated
  with check ((select auth.jwt() ->> 'email') = 'fkonaszuk8@gmail.com');

create policy "Dueño actualiza" on public.portfolio_state
  for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'fkonaszuk8@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'fkonaszuk8@gmail.com');

-- Sin politica de delete: nadie puede borrar filas, igual que hasta ahora.

-- Aplicado el 19/8/2026. Se agrego ademas esto: RLS ya frena las filas, pero anon
-- seguia teniendo el grant y la tabla aparecia en el esquema de GraphQL publico.
revoke all on public.portfolio_state from anon;
