// Fundamentals por empresa, desde Alpha Vantage.
//
// Hasta ahora el tracker medía sólo precios: alcanzaba para ver concentración y
// rotación, y no para contestar si la empresa es buena. Una llamada por ticker
// devuelve margen, ROE, ROA, P/E, P/B, EV/EBITDA y crecimiento ya calculados.
//
// Variable de entorno: ALPHAVANTAGE_KEY (gratis en alphavantage.co/support/#api-key)
//
// El plan gratuito permite 25 llamadas por día: por eso esto NO se llama solo.
// Los fundamentals cambian una vez por trimestre; se refrescan a mano y se
// guardan en Supabase, que es de donde los lee la pantalla.

import { traer, ETFS } from './_fundamentals.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = process.env.ALPHAVANTAGE_KEY;
  if (!key) return res.status(500).json({ error: 'falta ALPHAVANTAGE_KEY' });

  const { tickers } = req.query;
  if (!tickers) return res.status(400).json({ error: 'tickers param required' });

  const lista = [...new Set(tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))];
  const datos = {}, saltados = {};
  let limite = false;

  // En serie y no en paralelo: el plan gratuito corta por ráfaga.
  for (const t of lista) {
    if (ETFS.has(t)) { saltados[t] = 'es un ETF: no tiene balance propio'; continue; }
    if (limite) { saltados[t] = 'no se pidió: ya se había alcanzado el límite diario'; continue; }
    try {
      const r = await traer(t, key);
      if (r.datos) datos[t] = r.datos;
      else { saltados[t] = r.error; if (r.limite) limite = true; }
    } catch (e) {
      saltados[t] = String(e);
    }
  }

  return res.status(200).json({
    pedidos: lista.length,
    traidos: Object.keys(datos).length,
    limite_alcanzado: limite,
    saltados,
    datos,
  });
}
