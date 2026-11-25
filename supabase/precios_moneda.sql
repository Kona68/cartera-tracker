-- Aplicada el 25/11/2026 por MCP. El archivo queda como registro.
--
-- Una serie de otra plaza no viene en la misma unidad, y hasta ahora se guardaba
-- en la misma columna sin decirlo. /api/historico caia a nYSE cuando bCBA no
-- contestaba: quedaron 12 dias de TSLA en dolares entre precios en pesos (ya
-- borrados, el YTD de TSLA daba +10.165%) y dos tickers del watchlist, BBVA y
-- DRAM, con la serie ENTERA en dolares. Esos dos no estan rotos por dentro
-- --los rendimientos salen bien, porque un cociente no tiene unidad-- pero al
-- pasar la pantalla a dolares se los dividia por el MEP otra vez.
-- Sacar el fallback a nYSE no sirve: son los unicos tickers que existen ahi.
-- La serie dice en que moneda esta y la pantalla convierte con el MEP del dia.
alter table precios_historicos
  add column if not exists moneda text not null default 'ARS';

alter table precios_historicos
  drop constraint if exists precios_historicos_moneda_chk;
alter table precios_historicos
  add constraint precios_historicos_moneda_chk check (moneda in ('ARS', 'USD'));

update precios_historicos set moneda = 'USD' where ticker in ('BBVA', 'DRAM');

do $$
declare n_usd int; n_mezcla int;
begin
  select count(*) into n_usd from precios_historicos where moneda = 'USD';
  if n_usd <> 393 then
    raise exception 'esperaba 393 filas en dolares (336 BBVA + 57 DRAM) y hay %', n_usd;
  end if;

  -- Ningun ticker puede tener las dos monedas: eso es justo lo que paso con TSLA.
  select count(*) into n_mezcla from (
    select ticker from precios_historicos group by ticker having count(distinct moneda) > 1) q;
  if n_mezcla > 0 then
    raise exception '% ticker(s) con la serie partida en dos monedas', n_mezcla;
  end if;
end $$;
