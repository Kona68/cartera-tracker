// Serie historica diaria por ticker, para los indicadores por periodo y el panel
// de rotacion. Prueba bCBA y cae a nYSE, igual que /api/precios.
import { getIOLSerie, getIOLToken } from './_iol.js';

// Devuelve lo que contesta IOL sin tocar, para poder ver por que un ticker no trae serie.
async function crudo(ticker, desde, hasta, mercado, ajuste) {
  const token = await getIOLToken();
  const url = `https://api.invertironline.com/api/v2/${mercado}/Titulos/${ticker}/Cotizacion/seriehistorica/${desde}/${hasta}/${ajuste}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const txt = await res.text();
  return { mercado, ajuste, status: res.status, muestra: txt.slice(0, 600) };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tickers, desde, hasta, debug } = req.query;
  if (!tickers) return res.status(400).json({ error: 'tickers param required' });

  const hoy = new Date().toISOString().slice(0, 10);
  const haceUnAnio = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const d = desde || haceUnAnio;
  const h = hasta || hoy;

  if (debug) {
    const t = tickers.split(',')[0].trim().toUpperCase();
    const pruebas = [];
    for (const mercado of ['bCBA', 'nYSE']) {
      for (const ajuste of ['ajustada', 'sinAjustar']) {
        try { pruebas.push(await crudo(t, d, h, mercado, ajuste)); }
        catch (e) { pruebas.push({ mercado, ajuste, error: String(e) }); }
      }
    }
    return res.status(200).json({ ticker: t, desde: d, hasta: h, pruebas });
  }

  const lista = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
  const series = {};
  const fallas = {};

  await Promise.allSettled(lista.map(async ticker => {
    let r = await getIOLSerie(ticker, d, h, 'bCBA');
    if (!r.puntos.length) r = await getIOLSerie(ticker, d, h, 'nYSE');
    if (r.puntos.length) series[ticker] = r.puntos;
    else fallas[ticker] = r.error ?? 'sin datos';
  }));

  return res.status(200).json({ desde: d, hasta: h, series, fallas });
}
