// Vercel Function — intermediario para IOL y dolarito MEP
// Variables de entorno necesarias: IOL_USER, IOL_PASS

let iolToken = null;
let iolTokenExpiry = 0;

async function getIOLToken() {
  if (iolToken && Date.now() < iolTokenExpiry) return iolToken;

  const res = await fetch('https://api.invertironline.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: process.env.IOL_USER,
      password: process.env.IOL_PASS,
      grant_type: 'password',
    }),
  });

  if (!res.ok) throw new Error('IOL auth failed: ' + res.status);
  const data = await res.json();
  iolToken = data.access_token;
  iolTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return iolToken;
}

async function getIOLPrice(ticker, mercado = 'bCBA') {
  const token = await getIOLToken();
  const res = await fetch(
    `https://api.invertironline.com/api/v2/${mercado}/Titulos/${ticker}/Cotizacion`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.ultimoPrecio ?? data?.puntas?.[0]?.precioVenta ?? null;
}

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
