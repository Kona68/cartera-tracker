// Refresco semanal de fundamentals, disparado por el cron de vercel.json.
//
// Va una vez por semana y no todos los días porque estos números cambian una
// vez por trimestre: pedirlos a diario no agregaría un dato.
//
// Variables de entorno: SUPABASE_SERVICE_KEY, CRON_SECRET (opcional).
import { traerSec, ETFS } from './_sec.js';

const SUPABASE_URL = 'https://ahkdtgjwiphksdacuddq.supabase.co';

function sb(path, opciones = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opciones,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  });
}

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'falta SUPABASE_SERVICE_KEY' });

  // Lo que hay en cartera y lo que está en seguimiento: las dos listas importan,
  // porque comparar contra un candidato sin sus números no sirve de nada.
  const rEstado = await sb('portfolio_state?id=eq.state&select=data');
  if (!rEstado.ok) return res.status(500).json({ error: 'no se pudo leer la cartera: ' + rEstado.status });
  const filas = await rEstado.json();
  const propios = (filas[0]?.data?.positions || [])
    .filter(p => p.tipo !== 'Crypto' && p.cant > 0)
    .map(p => p.ticket);

  const rWatch = await sb('watchlist?select=ticker');
  const mirando = rWatch.ok ? (await rWatch.json()).map(w => w.ticker) : [];

  const lista = [...new Set([...propios, ...mirando])].filter(t => !ETFS.has(t));
  if (!lista.length) return res.status(200).json({ ok: true, pedidos: 0 });

  const datos = [], saltados = {};
  for (const t of lista) {
    try {
      const r = await traerSec(t);
      if (r.datos) datos.push(r.datos);
      else saltados[t] = r.error;
    } catch (e) { saltados[t] = String(e); }
  }

  if (datos.length) {
    const up = await sb('fundamentals', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(datos),
    });
    if (!up.ok) return res.status(500).json({ error: 'no se pudo guardar: ' + (await up.text()) });
  }

  return res.status(200).json({
    ok: true, pedidos: lista.length, guardados: datos.length,
    saltados,
  });
}
