// Serie historica del dolar MEP. Sin esto, el rendimiento en dolares no se puede
// calcular: hace falta la cotizacion de las dos puntas del periodo, no la de hoy.
// Un CEDEAR que sube 30% en pesos con el MEP subiendo 10% rindio 18% en dolares.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { desde } = req.query;
  const d = desde || new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);

  try {
    const r = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa');
    if (!r.ok) return res.status(502).json({ error: 'la fuente contestó ' + r.status });
    const data = await r.json();
    if (!Array.isArray(data)) return res.status(502).json({ error: 'respuesta inesperada' });

    const puntos = data
      .filter(x => x?.fecha >= d && x?.venta > 0)
      .map(x => ({ fecha: x.fecha, precio: x.venta }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    return res.status(200).json({ desde: d, n: puntos.length, puntos });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
}
