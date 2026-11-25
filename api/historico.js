// Serie historica diaria por ticker, para los indicadores por periodo y el panel
// de rotacion. Prueba bCBA y cae a nYSE, igual que /api/precios, pero DICE de
// cual de las dos vino: la de nYSE esta en dolares y la de bCBA en pesos, y
// hasta ahora las dos se devolvian igual. El cliente las guardaba en la misma
// columna sin distinguirlas: quedaron 12 dias de TSLA a ~$400 entre precios de
// ~$40.000 (el YTD daba +10.165%) y dos tickers enteros, BBVA y DRAM, en
// dolares. El fallback hace falta --esos dos solo existen en nYSE--, lo que
// faltaba era la etiqueta.
import { getIOLSerie } from './_iol.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tickers, desde, hasta } = req.query;
  if (!tickers) return res.status(400).json({ error: 'tickers param required' });

  const hoy = new Date().toISOString().slice(0, 10);
  const haceUnAnio = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const d = desde || haceUnAnio;
  const h = hasta || hoy;

  const lista = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const series = {};
  const meta = {};
  const fallas = {};

  await Promise.allSettled(lista.map(async ticker => {
    let r = await getIOLSerie(ticker, d, h, 'bCBA');
    r.mercado = 'bCBA';
    if (!r.puntos.length) { r = await getIOLSerie(ticker, d, h, 'nYSE'); r.mercado = 'nYSE'; }
    if (r.puntos.length) {
      series[ticker] = r.puntos;
      meta[ticker] = { mercado: r.mercado, moneda: r.mercado === 'nYSE' ? 'USD' : 'ARS',
                       ajuste: r.ajuste, n: r.puntos.length,
                       desde: r.puntos[0].fecha, hasta: r.puntos[r.puntos.length - 1].fecha };
    } else {
      fallas[ticker] = r.error ?? 'sin datos';
    }
  }));

  return res.status(200).json({ desde: d, hasta: h, meta, fallas, series });
}
