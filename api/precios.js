// Vercel Function — intermediario para IOL y dolarito MEP
// Variables de entorno necesarias: IOL_USER, IOL_PASS
import { getIOLPrice } from './_iol.js';

async function getMEP() {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/bolsa');
    if (!res.ok) return null;
    const data = await res.json();
    return data?.venta ?? null;
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tickers } = req.query;
  if (!tickers) return res.status(400).json({ error: 'tickers param required' });

  const tickerList = tickers.split(',').map(t => t.trim().toUpperCase());
  const result = { precios: {}, mep: null, error: null };

  result.mep = await getMEP();

  await Promise.allSettled(
    tickerList.map(async ticker => {
      let precio = await getIOLPrice(ticker, 'bCBA');
      if (!precio) precio = await getIOLPrice(ticker, 'nYSE');
      if (precio) result.precios[ticker] = precio;
    })
  );

  return res.status(200).json(result);
}
