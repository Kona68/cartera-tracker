# north

Tracker de cartera de inversiones, de uso personal. **No es una demo: los
números que muestra son plata real.**

> Este repositorio es **público**. Acá no va información personal: ni montos,
> ni nombres de agentes de bolsa, ni tenencias, ni deudas. Todo eso vive en la
> base, detrás del login. Si hace falta dejar contexto con datos reales, va en
> la conversación, no en el repo.

## Cómo está armado

- **`index.html`** — toda la app, en un archivo. JavaScript sin frameworks ni
  build. Se sirve estático.
- **`api/`** — funciones de Vercel. Son el único lugar donde viven las
  credenciales, por variables de entorno. **Nunca en el repo.**
- **Supabase** — Postgres con RLS.
- **Vercel** — publica `main` sola en cada push.

Se entra con **magic link**. Las políticas de RLS están atadas al mail del
dueño, no al rol `authenticated`: si se colara otro usuario, tampoco vería
nada. El rol `anon` no puede leer ninguna tabla salvo `latido`.

## Antes de tocar nada

**El entorno tiene una trampa**: si Xcode no tiene la licencia aceptada,
`/usr/bin/python3` y `/usr/bin/git` fallan con "You have not agreed to the
Xcode license agreements". Los binarios de adentro de Xcode funcionan igual:

    /Applications/Xcode.app/Contents/Developer/usr/bin/python3
    /Applications/Xcode.app/Contents/Developer/usr/bin/git

`node` no está instalado. Para verificar cambios en el JS se usa chequeo
estático: que los `getElementById` tengan su `id` en el HTML, que las funciones
llamadas existan, y que llaves y paréntesis cierren.

## Las reglas que no se negocian

**Si un número no se puede saber, la pantalla lo dice.** Nunca un cero
inventado. Vale para los fundamentals que faltan, para las series que arrancan
tarde y para los precios estimados, que van marcados como tales.

**Un estado defendible e invisible es un bug.** El caso que más caro salió: el
guardado en la nube fallaba y la app mostraba "Guardado local (sin conexión)"
en gris, que desaparecía a los dos segundos. Se perdió una semana de carga. Hoy
el fallo es un cartel rojo que no se va hasta resolverlo, y antes de guardar se
compara contra la marca de tiempo del servidor para no pisar algo más nuevo.

**El resumen del custodio le gana a lo que diga el tracker.** Cuando el reparto
por agente no suma lo que dice la posición, la pantalla lo muestra en vez de
taparlo.

**IOL no ajusta los splits, ni en la serie que llama "ajustada".** Sin
corregir, un papel con un split 10:1 llegó a informar -89% anual cuando había
hecho +13%. Se detecta por el salto de un día para otro (más de 1,6x o menos de
0,625x) y se lleva el tramo viejo a las unidades de hoy.

**Un punto por rueda.** En ventanas largas IOL devuelve varios registros por
día: un ticker llegó a dar 1.780 puntos en 400 días. Contar ruedas sobre eso
rompe la ventana de 52 semanas, la volatilidad y las medias móviles.

**Todo del mismo ejercicio.** En los fundamentals se tomaba el último valor de
cada concepto por separado y una empresa mostró 204,8% de margen operativo
mezclando resultado de un año con ingresos de ocho años antes. El ejercicio lo
fija el resultado neto y cada dato se busca EN ese cierre, con ventana de tres
semanas porque no todas cierran el mismo día.

**Un cociente con denominador negativo es null, no un número.** Una empresa con
pérdida informaba una "conversión a caja" de -6,21x.

**El rendimiento en dólares usa el tipo de cambio de las dos puntas del
período**, nunca el de hoy.

**La cripto no se convierte por el MEP.** El cripto argentino tiene su propia
brecha, que llegó a ser de cinco puntos. Se usa el precio en pesos de los
exchanges locales.

**Y no la punta de un solo exchange: la mediana.** Un exchange marcó BTC 12%
abajo del resto. Se usa la mediana de los 23 y se avisa quién se fue más de 8%.

**Comprar y vender tienen que tocar todo lo que corresponde**: la posición, el
PPC, el reparto por custodio, la liquidez y el historial. Borrar una venta
devuelve los nominales. Las fechas se guardan en ISO (`2026-11-24`) y nunca en
formato local, porque mezclados el historial se ordena mal.

**Corregir no es vender.** El editor de posiciones cambia lo que está cargado y
no genera venta, ni P&L realizado, ni movimiento de liquidez. Muestra el
impacto antes de guardar, porque bajar una cantidad baja la tenencia aunque la
rentabilidad en porcentaje no se mueva.

## De dónde sale cada dato

| | fuente | clave |
|---|---|---|
| `api/precios` | IOL, cotización + dólar MEP de dolarapi | `IOL_USER`, `IOL_PASS` |
| `api/historico` | IOL serie diaria, con corrección de split | las mismas |
| `api/mep` | argentinadatos, serie histórica del MEP | no |
| `api/cripto` | CriptoYa (pesos) + CoinGecko (dólares) | no |
| `api/fundamentals` | SEC EDGAR | no |
| `api/latido` | Supabase, para que no se pause | no |
| `api/alertas` | IOL + Resend | `RESEND_API_KEY`, `SUPABASE_SERVICE_KEY` |

**Lo que se probó y no sirve**, para no volver a intentarlo:

- **Alpha Vantage para fundamentals es pago.** El endpoint OVERVIEW devuelve
  "This is a premium endpoint". Ojo con la clave `demo`: contesta una respuesta
  enlatada de IBM y hace creer que funciona.
- **`www.sec.gov` devuelve 403** a los clientes que no ponen un mail de
  contacto en el User-Agent, y no corresponde poner el del dueño. Por eso el
  mapa de CIK está escrito en `api/_sec.js`, verificado uno por uno contra
  `data.sec.gov/submissions`. Para un ticker nuevo se usa `efts.sec.gov`, que
  sí responde.
- **Yahoo Finance y StockAnalysis** bloquean el acceso automático.
- **Binance bloquea los pedidos desde Vercel.**
- **Vercel no aplica una variable de entorno nueva** a los deploys que ya
  existen: hay que volver a desplegar.
- **Supabase pausa los proyectos gratuitos** tras una semana sin actividad. Ya
  pasó una vez y la app dejó de abrir. Por eso está el cron del latido, diario.

## El modelo de datos

Todo el estado de la cartera es **una fila jsonb** en `portfolio_state`, con
`id = 'state'`. Las claves: `positions`, `compras`, `ventas`, `liquidez`,
`retiros`, `aportes`, `manualHist`, `tc`.

Cada posición puede llevar `custodios`, que es el reparto por agente, y marcar
`garantia` en los títulos inmovilizados.

Las demás tablas: `precios_historicos` (serie diaria corregida, con el crudo al
lado para poder auditar), `splits`, `watchlist`, `fundamentals`,
`alertas_estado`, `alertas_log`, `latido`.

**Antes de cada cambio de datos se guarda un backup** en una fila
`backup_<fecha>_<motivo>`. Conviene no borrarlos.

## Cómo probar

No hay suite automática. Lo que se hace:

1. Chequeo estático del JS (ids, funciones, balance de llaves).
2. Un arnés local: se copia `index.html`, se le tapan las llamadas a Supabase
   con datos de prueba y se puentea el login, apuntando los `/api/` a
   producción. Nunca se commitea.
3. Después del deploy, verificar contra la URL real. **Ojo con la caché del
   CDN**: durante la propagación devuelve mezclado la versión vieja y la
   nueva, así que conviene pedir varias veces antes de concluir que algo falló.
