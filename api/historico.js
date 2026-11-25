// Serie historica diaria por ticker, para los indicadores por periodo y el panel
// de rotacion. Prueba bCBA y cae a nYSE, igual que /api/precios.
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
    // Antes, si bCBA no contestaba se pedia la misma serie a nYSE y se devolvia
    // como si nada. Pero esa viene en DOLARES y el cliente la guarda en la misma
    // tabla que la de pesos: quedaron 12 dias de TSLA a ~$400 entre precios de
    // ~$40.000, y con eso el YTD daba +10.165%. Una serie de otra plaza no es la
    // misma serie. Si bCBA no tiene, el ticker sale en `fallas` y la pantalla lo
    // dice, que es mejor que un numero en la unidad equivocada.
    const r = await getIOLSerie(ticker, d, h, 'bCBA');
    r.mercado = 'bCBA';
    if (r.puntos.length) {
      series[ticker] = r.puntos;
      meta[ticker] = { mercado: r.mercado, ajuste: r.ajuste, n: r.puntos.length,
                       desde: r.puntos[0].fecha, hasta: r.puntos[r.puntos.length - 1].fecha };
    } else {
      fallas[ticker] = r.error ?? 'sin datos';
    }
  }));

  return res.status(200).json({ desde: d, hasta: h, meta, fallas, series });
}
