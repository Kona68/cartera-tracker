// Precio de las criptos en pesos, por exchange.
//
// No se usa el precio en dólares por el MEP: el cripto en Argentina cotiza con
// su propia brecha. Al 24/11 BTC/USDT daba 59.478 y el MEP 1.743, o sea ARS
// 103,7 millones, mientras Binance lo valuaba a 108,7. Son cinco puntos que no
// se pueden tapar con el tipo de cambio financiero.
//
// CriptoYa publica el precio de cada exchange argentino y tiene a los dos que
// importan acá: binance y nexo. Sin clave.

const FUENTE = 'https://criptoya.com/api';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { monedas } = req.query;
  const lista = (monedas || 'BTC,ETH').split(',').map(m => m.trim().toUpperCase()).filter(Boolean);

  const precios = {}, fallas = {};

  await Promise.all(lista.map(async (m) => {
    try {
      const r = await fetch(`${FUENTE}/${m.toLowerCase()}/ars/1`);
      if (!r.ok) { fallas[m] = `la fuente contestó ${r.status}`; return; }
      const d = await r.json();
      const porExchange = {};
      for (const [nombre, v] of Object.entries(d)) {
        // bid es lo que te pagan si vendés: es el precio al que podés realizar.
        if (v && typeof v === 'object' && v.bid > 0) porExchange[nombre] = v.bid;
      }
      if (!Object.keys(porExchange).length) { fallas[m] = 'sin cotizaciones'; return; }
      precios[m] = porExchange;
    } catch (e) { fallas[m] = String(e); }
  }));

  // El precio en dólares, para poder mirar la cripto sin el ruido del peso.
  let usd = {};
  try {
    const simbolos = lista.map(m => `"${m}USDT"`).join(',');
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=[${encodeURIComponent(simbolos)}]`);
    if (r.ok) {
      for (const x of await r.json()) usd[x.symbol.replace('USDT', '')] = Number(x.price);
    }
  } catch (e) { /* el precio en pesos ya alcanza para valuar */ }

  return res.status(200).json({ precios, usd, fallas });
}
