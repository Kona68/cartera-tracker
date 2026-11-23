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

// CIK verificado uno por uno contra data.sec.gov/submissions. Va escrito y no
// leído del índice oficial porque www.sec.gov devuelve 403 a los clientes que no
// ponen un mail de contacto en el User-Agent, y no corresponde poner el del dueño.
const CIK = {
  NVDA:'0001045810', MU:'0000723125', META:'0001326801', GOOGL:'0001652044',
  TSLA:'0001318605', MELI:'0001099590', NU:'0001691493', YPF:'0000904851',
  SPCX:'0001181412',
  KO:'0000021344', WMT:'0000104169', PG:'0000080424', JNJ:'0000200406',
  PEP:'0000077476', MCD:'0000063908', COST:'0000909832', CL:'0000021665',
  MO:'0000764180', ABBV:'0001551152', VZ:'0000732712', PM:'0001413329',
  MRK:'0000310158', UNH:'0000731766',
};

const resueltos = {};

// Para un ticker que no está en el mapa se usa el buscador de texto completo,
// que sí responde: sus resultados traen "NOMBRE (TICKER) (CIK 00000...)".
async function resolverCik(simbolo) {
  if (CIK[simbolo]) return CIK[simbolo];
  if (resueltos[simbolo]) return resueltos[simbolo];
  const url = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(simbolo)}%22&forms=10-K,20-F`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) return null;
  const d = await res.json();
  for (const h of (d?.hits?.hits || [])) {
    for (const nombre of (h._source?.display_names || [])) {
      const m = nombre.match(/\(([^()]*)\)\s*\(CIK (\d{10})\)/);
      if (m && m[1].split(',').map(x => x.trim().toUpperCase()).includes(simbolo)) {
        resueltos[simbolo] = m[2];
        return m[2];
      }
    }
  }
  return null;
}

// Todo tiene que salir del MISMO ejercicio. Tomar el último valor de cada
// concepto por separado daba disparates: META con el resultado operativo de 2025
// y los ingresos de 2017 mostraba 204% de margen, y MU 1177%. Primero se fija el
// cierre con un concepto ancla y después se busca cada dato EN ese cierre.
const FORMAS = ['10-K', '20-F', '40-F'];

function hechosAnuales(facts, conceptos) {
  const salida = [];
  for (const taxo of ['us-gaap', 'ifrs-full']) {
    const g = facts[taxo]; if (!g) continue;
    for (const c of conceptos) {
      const nodo = g[c]; if (!nodo) continue;
      const unidad = nodo.units['USD'] || Object.values(nodo.units)[0];
      if (!unidad) continue;
      for (const h of unidad) {
        if (FORMAS.includes(h.form) && h.fp === 'FY') salida.push({ ...h, concepto: c });
      }
    }
  }
  return salida;
}

// Las fechas de cierre no caen siempre el mismo día (NVIDIA cierra un domingo
// distinto cada año), así que se acepta una ventana de tres semanas.
const cerca = (a, b) => Math.abs(new Date(a) - new Date(b)) <= 21 * 864e5;

function enCierre(facts, conceptos, cierre) {
  const h = hechosAnuales(facts, conceptos).filter(x => cerca(x.end, cierre));
  if (!h.length) return null;
  // Si el mismo dato viene en varias presentaciones, gana la más reciente.
  h.sort((a, b) => (b.filed || '').localeCompare(a.filed || ''));
  return h[0].val;
}

function cierreMasReciente(facts, conceptos) {
  const h = hechosAnuales(facts, conceptos);
  if (!h.length) return null;
  h.sort((a, b) => a.end.localeCompare(b.end));
  return h[h.length - 1].end;
}

function cierrePrevio(facts, conceptos, cierre) {
  const h = hechosAnuales(facts, conceptos).filter(x => x.end < cierre && !cerca(x.end, cierre));
  if (!h.length) return null;
  h.sort((a, b) => a.end.localeCompare(b.end));
  return h[h.length - 1].end;
}

export async function traerSec(ticker) {
  const simbolo = SIMBOLO[ticker] || ticker;
  let cik;
  try { cik = await resolverCik(simbolo); }
  catch (e) { return { error: String(e.message || e) }; }
  if (!cik) return { error: 'no se encontró su CIK: puede no presentar ante la SEC' };

  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: UA });
  if (!res.ok) return { error: `EDGAR contestó ${res.status}` };
  const d = await res.json();
  const f = d.facts || {};

  const INGRESOS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
                    'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenue'];
  const NETO = ['NetIncomeLoss', 'ProfitLoss'];

  // El ejercicio lo fija el resultado neto, que lo presentan todos.
  const cierre = cierreMasReciente(f, NETO);
  if (!cierre) return { error: 'sin estados financieros anuales en EDGAR' };
  const previo = cierrePrevio(f, NETO, cierre);

  const ingresos  = enCierre(f, INGRESOS, cierre);
  const neto      = enCierre(f, NETO, cierre);
  const operativo = enCierre(f, ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'], cierre);
  const activos   = enCierre(f, ['Assets'], cierre);
  const patrim    = enCierre(f, ['StockholdersEquity', 'Equity',
                                 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], cierre);
  const pasivos   = enCierre(f, ['Liabilities'], cierre);
  const pasivoCte = enCierre(f, ['LiabilitiesCurrent', 'CurrentLiabilities'], cierre);
  const caja      = enCierre(f, ['NetCashProvidedByUsedInOperatingActivities',
                                 'CashFlowsFromUsedInOperatingActivities'], cierre);
  const deuda     = enCierre(f, ['LongTermDebtNoncurrent', 'LongTermDebt', 'NoncurrentPortionOfBorrowings'], cierre);

  const ingresosPrev = previo ? enCierre(f, INGRESOS, previo) : null;
  const netoPrev     = previo ? enCierre(f, NETO, previo) : null;

  if (ingresos === null && neto === null) return { error: 'sin estados financieros usables en EDGAR' };

  // ROCE: resultado operativo sobre el capital que de verdad emplea el negocio.
  // Es la vara de Terry Smith y la que no da ninguna fuente gratis ya calculada.
  const capitalEmpleado = (activos !== null && pasivoCte !== null) ? activos - pasivoCte : null;

  // Un cociente con el denominador negativo no mide nada: YPF con resultado neto
  // negativo daba una "conversión a caja" de -6,21x, que no quiere decir nada.
  const ratio = (a, b) => (a !== null && b !== null && b > 0) ? a / b : null;

  return {
    datos: {
      ticker, simbolo,
      nombre: d.entityName || null,
      cierre,
      ingresos_ttm: ingresos,
      resultado_neto: neto,
      resultado_operativo: operativo,
      activos, patrimonio: patrim, pasivos,
      deuda_largo: deuda,
      caja_operativa: caja,
      margen_neto: ratio(neto, ingresos),
      margen_operativo: ratio(operativo, ingresos),
      roe: ratio(neto, patrim),
      roa: ratio(neto, activos),
      roce: ratio(operativo, capitalEmpleado),
      conversion_caja: ratio(caja, neto),
      deuda_patrimonio: ratio(deuda, patrim),
      crec_ingresos: (ingresos !== null && ingresosPrev) ? ingresos / ingresosPrev - 1 : null,
      crec_ganancias: (neto !== null && netoPrev && netoPrev > 0) ? neto / netoPrev - 1 : null,
      fuente: 'sec',
      actualizado_at: new Date().toISOString(),
    },
  };
}

export { SIMBOLO, ETFS };
