// Fundamentals desde SEC EDGAR: oficial, gratis y sin clave.
//
// Se intentó primero con Alpha Vantage y su endpoint OVERVIEW resultó pago: la
// prueba con la clave "demo" devuelve una respuesta enlatada de IBM y eso hizo
// creer que funcionaba. EDGAR, además, es mejor dato: sale del balance
// presentado, no del resumen de un tercero.
//
// Sin clave, pero la SEC pide identificarse en el User-Agent y limita a 10
// pedidos por segundo.

const UA = { 'User-Agent': 'cartera-tracker/1.0', 'Accept-Encoding': 'gzip, deflate' };

// El CEDEAR y el emisor no siempre se llaman igual.
const SIMBOLO = { YPFD: 'YPF' };

// Un ETF no presenta balance.
const ETFS = new Set(['SPY', 'QQQ', 'EWZ', 'URA', 'XLE', 'DIA', 'IWM', 'EEM', 'ARKK']);

let cacheCik = null, cacheCikAt = 0;

async function mapaCik() {
  if (cacheCik && Date.now() - cacheCikAt < 864e5) return cacheCik;
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: UA });
  if (!res.ok) throw new Error('no se pudo leer el índice de CIK: ' + res.status);
  const d = await res.json();
  const m = {};
  for (const v of Object.values(d)) m[v.ticker] = String(v.cik_str).padStart(10, '0');
  cacheCik = m; cacheCikAt = Date.now();
  return m;
}

// Último cierre anual de un concepto. Se recorren las dos taxonomías porque los
// emisores extranjeros (NU, YPF) presentan en IFRS y no en US-GAAP.
function anual(facts, conceptos) {
  for (const taxo of ['us-gaap', 'ifrs-full']) {
    const g = facts[taxo]; if (!g) continue;
    for (const c of conceptos) {
      const nodo = g[c]; if (!nodo) continue;
      const unidad = nodo.units['USD'] || Object.values(nodo.units)[0];
      if (!unidad) continue;
      const cierres = unidad.filter(x => ['10-K', '20-F', '40-F'].includes(x.form) && x.fp === 'FY');
      if (!cierres.length) continue;
      const orden = cierres.sort((a, b) => a.end.localeCompare(b.end));
      return { valor: orden[orden.length - 1].val, fecha: orden[orden.length - 1].end,
               previo: orden.length > 1 ? orden[orden.length - 2].val : null, concepto: c };
    }
  }
  return null;
}

const div = (a, b) => (a !== null && a !== undefined && b) ? a / b : null;

export async function traerSec(ticker) {
  const simbolo = SIMBOLO[ticker] || ticker;
  let cik;
  try { cik = (await mapaCik())[simbolo]; }
  catch (e) { return { error: String(e.message || e) }; }
  if (!cik) return { error: 'no presenta ante la SEC (o cotiza con otro símbolo)' };

  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: UA });
  if (!res.ok) return { error: `EDGAR contestó ${res.status}` };
  const d = await res.json();
  const f = d.facts || {};

  const ingresos = anual(f, ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
                             'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenue']);
  const neto     = anual(f, ['NetIncomeLoss', 'ProfitLoss']);
  const operativo= anual(f, ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities']);
  const activos  = anual(f, ['Assets']);
  const patrim   = anual(f, ['StockholdersEquity', 'Equity',
                             'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
  const pasivos  = anual(f, ['Liabilities']);
  const pasivoCte= anual(f, ['LiabilitiesCurrent', 'CurrentLiabilities']);
  const caja     = anual(f, ['NetCashProvidedByUsedInOperatingActivities',
                             'CashFlowsFromUsedInOperatingActivities']);
  const deuda    = anual(f, ['LongTermDebtNoncurrent', 'LongTermDebt', 'NoncurrentPortionOfBorrowings']);

  if (!ingresos && !neto) return { error: 'sin estados financieros usables en EDGAR' };

  // ROCE: resultado operativo sobre el capital que de verdad emplea el negocio.
  // Es la vara de Terry Smith y la que no da ninguna fuente gratis ya calculada.
  const capitalEmpleado = (activos && pasivoCte) ? activos.valor - pasivoCte.valor : null;

  return {
    datos: {
      ticker, simbolo,
      nombre: d.entityName || null,
      cierre: ingresos?.fecha || neto?.fecha || null,
      ingresos_ttm: ingresos?.valor ?? null,
      resultado_neto: neto?.valor ?? null,
      resultado_operativo: operativo?.valor ?? null,
      activos: activos?.valor ?? null,
      patrimonio: patrim?.valor ?? null,
      pasivos: pasivos?.valor ?? null,
      deuda_largo: deuda?.valor ?? null,
      caja_operativa: caja?.valor ?? null,
      margen_neto: div(neto?.valor, ingresos?.valor),
      margen_operativo: div(operativo?.valor, ingresos?.valor),
      roe: div(neto?.valor, patrim?.valor),
      roa: div(neto?.valor, activos?.valor),
      roce: div(operativo?.valor, capitalEmpleado),
      conversion_caja: div(caja?.valor, neto?.valor),
      deuda_patrimonio: div(deuda?.valor, patrim?.valor),
      crec_ingresos: (ingresos?.previo) ? ingresos.valor / ingresos.previo - 1 : null,
      crec_ganancias: (neto?.previo && neto.previo > 0) ? neto.valor / neto.previo - 1 : null,
      fuente: 'sec',
      actualizado_at: new Date().toISOString(),
    },
  };
}

export { SIMBOLO, ETFS };
