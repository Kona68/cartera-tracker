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
      const bids = Object.values(porExchange);
      if (!bids.length) { fallas[m] = 'sin cotizaciones'; return; }

      // La mediana de todos los exchanges, y no la punta de uno: el 24/11
      // Binance marcaba BTC a 91,4 millones mientras el resto estaba en 104.
      // Una punta floja de un solo lugar no puede mover la valuación.
      bids.sort((a, b) => a - b);
      const med = bids.length % 2
        ? bids[(bids.length - 1) / 2]
        : (bids[bids.length / 2 - 1] + bids[bids.length / 2]) / 2;

      // Se avisa quién se fue lejos, para que un precio raro no pase callado.
      const lejos = {};
      for (const [n, v] of Object.entries(porExchange)) {
        const dif = v / med - 1;
        if (Math.abs(dif) > 0.08) lejos[n] = Math.round(dif * 1000) / 10;
      }

      precios[m] = { mediana: med, exchanges: porExchange, n: bids.length, lejos };
    } catch (e) { fallas[m] = String(e); }
  }));

  // El precio en dólares, para poder mirar la cripto sin el ruido del peso.
  // Uno por uno: el pedido con varios símbolos a la vez quedaba mal armado y
  // volvía vacío sin decir por qué.
  const usd = {};
  await Promise.all(lista.map(async (m) => {
    try {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${m}USDT`);
      if (!r.ok) return;
      const d = await r.json();
      if (d && d.price) usd[m] = Number(d.price);
    } catch (e) { /* el precio en pesos ya alcanza para valuar */ }
  }));

  return res.status(200).json({ precios, usd, fallas });
}
