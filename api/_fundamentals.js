// Traductor y normalizador de fundamentals de Alpha Vantage.
// Lo usan el endpoint a pedido y el cron semanal, para que no se dupliquen ni se
// desincronicen los nombres de los campos.

// El CEDEAR y el subyacente no siempre se llaman igual.
const SIMBOLO = { YPFD: 'YPF' };

// Un ETF no tiene balance: pedirle margen o ROE no tiene sentido.
const ETFS = new Set(['SPY', 'QQQ', 'EWZ', 'URA', 'XLE', 'DIA', 'IWM', 'EEM', 'ARKK']);

const num = (v) => {
  if (v === undefined || v === null || v === 'None' || v === '-' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function traer(ticker, key) {
  const simbolo = SIMBOLO[ticker] || ticker;
  const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${encodeURIComponent(simbolo)}&apikey=${key}`;
  const res = await fetch(url);
  if (!res.ok) return { error: `la fuente contestó ${res.status}` };
  const d = await res.json();

  // Alpha Vantage no usa códigos de error: avisa con un texto y HTTP 200, y usa
  // el mismo campo para el límite diario y para "este endpoint ahora es pago".
  // Se devuelve el mensaje textual: traducirlo a ciegas mandó a buscar el
  // problema equivocado.
  if (d.Note || d.Information) {
    const msg = String(d.Note || d.Information);
    const esLimite = /rate limit|call frequency|25 requests|per day/i.test(msg);
    return { error: msg.slice(0, 300), limite: esLimite };
  }
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


export { SIMBOLO, ETFS };
