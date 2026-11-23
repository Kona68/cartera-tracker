// Fundamentals por empresa, desde SEC EDGAR.
//
// Hasta ahora el tracker medía sólo precios: alcanzaba para ver concentración y
// rotación, y no para contestar si la empresa es buena. Una llamada por ticker
// devuelve margen, ROE, ROA, ROCE, conversion a caja y crecimiento, calculados
// sobre el balance presentado. Sin clave: la SEC solo pide identificarse.
//
// Los fundamentals cambian una vez por trimestre, asi que se guardan en Supabase
// y la pantalla lee de ahi.

import { traerSec, ETFS } from './_sec.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tickers } = req.query;
  if (!tickers) return res.status(400).json({ error: 'tickers param required' });

  const lista = [...new Set(tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))];
  const datos = {}, saltados = {};

  // En serie y no en paralelo: la SEC limita a 10 pedidos por segundo.
  for (const t of lista) {
    if (ETFS.has(t)) { saltados[t] = 'es un ETF: no tiene balance propio'; continue; }
    try {
      const r = await traerSec(t);
      if (r.datos) datos[t] = r.datos;
      else saltados[t] = r.error;
    } catch (e) {
      saltados[t] = String(e);
    }
  }

  return res.status(200).json({
    pedidos: lista.length,
    traidos: Object.keys(datos).length,
    saltados,
    datos,
  });
}
