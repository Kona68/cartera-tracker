// Corre una vez por dia despues del cierre (cron en vercel.json) y avisa por mail
// cuando una posicion se da vuelta o cuando la perdida pasa el 10%.
//
// Avisa por CRUCE, no por estado: si ECOG queda tres meses en rojo, el mail llega
// el dia que cruza, no noventa veces. El estado anterior vive en alertas_estado.
//
// Variables de entorno: IOL_USER, IOL_PASS, SUPABASE_SERVICE_KEY, RESEND_API_KEY,
// ALERTA_EMAIL (opcional), CRON_SECRET (opcional, lo pone Vercel solo).
import { getIOLPrice } from './_iol.js';

const SUPABASE_URL = 'https://ahkdtgjwiphksdacuddq.supabase.co';
const UMBRAL_PERDIDA = -0.10;

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

function clasificar(pnl) {
  if (pnl <= UMBRAL_PERDIDA) return 'perdida10';
  if (pnl < 0) return 'negativa';
  return 'positiva';
}

function armarMail(disparos, fecha) {
  const fila = d => `
    <tr>
      <td style="padding:10px 14px;font-weight:600">${d.ticker}</td>
      <td style="padding:10px 14px">${d.tipo === 'perdida_10' ? 'Pasó el 10% de pérdida' : 'Se dio vuelta a negativo'}</td>
      <td style="padding:10px 14px;color:#c0392b;text-align:right">${(d.pnl * 100).toFixed(2)}%</td>
      <td style="padding:10px 14px;text-align:right">$ ${Math.round(d.precio).toLocaleString('es-AR')}</td>
    </tr>`;
  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px">
    <h2 style="margin:0 0 4px">Cartera · ${disparos.length} ${disparos.length === 1 ? 'aviso' : 'avisos'}</h2>
    <p style="color:#666;margin:0 0 20px;font-size:13px">Cierre del ${fecha}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #eee">
      <thead>
        <tr style="background:#fafafa;color:#666;font-size:12px;text-align:left">
          <th style="padding:10px 14px">Ticker</th>
          <th style="padding:10px 14px">Qué pasó</th>
          <th style="padding:10px 14px;text-align:right">vs PPC</th>
          <th style="padding:10px 14px;text-align:right">Precio</th>
        </tr>
      </thead>
      <tbody>${disparos.map(fila).join('')}</tbody>
    </table>
    <p style="color:#888;font-size:12px;margin-top:20px">
      Se avisa una sola vez por cruce. Si vuelve a positivo y se da vuelta de nuevo, volvés a recibirlo.
    </p>
    <p style="margin-top:20px"><a href="https://cartera-tracker.vercel.app" style="color:#0077ff;font-size:13px">Abrir la cartera</a></p>
  </div>`;
}

export default async function handler(req, res) {
  // Vercel firma la llamada del cron. Si CRON_SECRET no esta puesto, no se exige nada.
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: 'no autorizado' });
  }
  if (!process.env.SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'falta SUPABASE_SERVICE_KEY' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'falta RESEND_API_KEY' });

  const rEstado = await sb('portfolio_state?id=eq.state&select=data');
  if (!rEstado.ok) return res.status(500).json({ error: 'no se pudo leer la cartera: ' + rEstado.status });
  const filas = await rEstado.json();
  const posiciones = (filas[0]?.data?.positions || []).filter(p => p.tipo !== 'Crypto' && p.cant > 0 && p.ppc > 0);
  if (!posiciones.length) return res.status(200).json({ ok: true, revisadas: 0, disparos: [] });

  const rPrevio = await sb('alertas_estado?select=ticker,estado');
  const previo = Object.fromEntries(((await rPrevio.json()) || []).map(f => [f.ticker, f.estado]));

  const disparos = [];
  const nuevoEstado = [];

  for (const p of posiciones) {
    let precio = await getIOLPrice(p.ticket, 'bCBA');
    if (!precio) precio = await getIOLPrice(p.ticket, 'nYSE');
    if (!precio) continue;

    const pnl = precio / p.ppc - 1;
    const estado = clasificar(pnl);
    const antes = previo[p.ticket] || 'positiva';

    // Primera corrida: se guarda el estado sin avisar, o llegaria un mail con todo
    // lo que ya venia en rojo desde antes.
    const esPrimera = !(p.ticket in previo);
    if (!esPrimera) {
      if (antes === 'positiva' && estado !== 'positiva') {
        disparos.push({ ticker: p.ticket, tipo: 'se_dio_vuelta', pnl, precio });
      }
      if (antes !== 'perdida10' && estado === 'perdida10') {
        disparos.push({ ticker: p.ticket, tipo: 'perdida_10', pnl, precio });
      }
    }
    nuevoEstado.push({ ticker: p.ticket, pnl_pct: pnl, estado, actualizado_at: new Date().toISOString() });
  }

  await sb('alertas_estado', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(nuevoEstado),
  });

  if (!disparos.length) {
    return res.status(200).json({ ok: true, revisadas: nuevoEstado.length, disparos: [] });
  }

  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  const mail = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERTA_FROM || 'onboarding@resend.dev',
      to: process.env.ALERTA_EMAIL || 'fkonaszuk8@gmail.com',
      subject: `Cartera · ${disparos.map(d => d.ticker).join(', ')} ${disparos.length === 1 ? 'necesita' : 'necesitan'} una mirada`,
      html: armarMail(disparos, hoy),
    }),
  });

  const detalleMail = mail.ok ? null : await mail.text();

  await sb('alertas_log', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(disparos.map(d => ({ ticker: d.ticker, tipo: d.tipo, pnl_pct: d.pnl }))),
  });

  return res.status(200).json({
    ok: mail.ok,
    revisadas: nuevoEstado.length,
    disparos: disparos.map(d => ({ ticker: d.ticker, tipo: d.tipo, pnl: d.pnl })),
    errorMail: detalleMail,
  });
}
