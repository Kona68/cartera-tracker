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

// El CEDEAR y el subyacente no siempre se llaman igual.
const SIMBOLO = { YPFD: 'YPF' };

// Un ETF no tiene balance: pedirle margen o ROE no tiene sentido.
const ETFS = new Set(['SPY', 'QQQ', 'EWZ', 'URA', 'XLE', 'DIA', 'IWM', 'EEM', 'ARKK']);

const num = (v) => {
  if (v === undefined || v === null || v === 'None' || v === '-' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function traer(ticker, key) {
  const simbolo = SIMBOLO[ticker] || ticker;
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(simbolo)}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) return { error: `la fuente contestó ${res.status}` };
  const d = await res.json();

  // Alpha Vantage no usa códigos de error: avisa con un texto y HTTP 200.
  if (d.Note || d.Information) return { error: 'límite de llamadas alcanzado', limite: true };
  if (d['Error Message']) return { error: 'símbolo no reconocido' };
  if (!d.Symbol) return { error: 'sin datos para ese símbolo' };

  return {
    datos: {
      ticker, simbolo,
      nombre: d.Name || null,
      sector: d.Sector || null,
      industria: d.Industry || null,
      market_cap: num(d.MarketCapitalization),
      pe: num(d.PERatio),
      forward_pe: num(d.ForwardPE),
      peg: num(d.PEGRatio),
      price_to_book: num(d.PriceToBookRatio),
      price_to_sales: num(d.PriceToSalesRatioTTM),
      ev_ebitda: num(d.EVToEBITDA),
      margen_operativo: num(d.OperatingMarginTTM),
      margen_neto: num(d.ProfitMargin),
      roe: num(d.ReturnOnEquityTTM),
      roa: num(d.ReturnOnAssetsTTM),
      crec_ingresos: num(d.QuarterlyRevenueGrowthYOY),
      crec_ganancias: num(d.QuarterlyEarningsGrowthYOY),
      ingresos_ttm: num(d.RevenueTTM),
      ebitda: num(d.EBITDA),
      eps: num(d.EPS),
      dividend_yield: num(d.DividendYield),
      beta: num(d.Beta),
      fuente: 'alphavantage',
      actualizado_at: new Date().toISOString(),
    },
  };
}

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
