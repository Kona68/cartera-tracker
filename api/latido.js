// Mantiene despierto el proyecto de Supabase.
//
// El plan gratuito pausa los proyectos tras una semana sin actividad, y eso ya
// pasó: el 20/11 la app no abría porque la base estaba dormida desde agosto.
// Una consulta diaria alcanza para que no vuelva a pasar.
//
// No necesita ninguna clave de servidor: la tabla "latido" tiene una fila vacía
// que cualquiera puede leer. Todo lo demás sigue cerrado por RLS.

const SUPABASE_URL = 'https://ahkdtgjwiphksdacuddq.supabase.co';
const PUBLICA = 'sb_publishable_uRaUHjPrvMZqHcDJ1H3E6g_l1_4oGcy';

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== `Bearer ${secreto}` && req.query.manual !== '1') {
    return res.status(401).json({ error: 'no autorizado' });
  }

  const t0 = Date.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/latido?select=ultimo&limit=1`, {
      headers: { apikey: PUBLICA, Authorization: `Bearer ${PUBLICA}` },
    });
    const ms = Date.now() - t0;

    if (!r.ok) {
      return res.status(200).json({
        despierta: false, estado: r.status, ms,
        detalle: await r.text(),
        // Un proyecto pausado tarda unos minutos en volver, y lo despierta el
        // propio pedido: por eso se informa y no se reintenta acá.
        nota: 'La base no contestó bien. Si estaba pausada, este mismo pedido la empieza a despertar.',
      });
    }
    return res.status(200).json({ despierta: true, ms, filas: (await r.json()).length });
  } catch (e) {
    return res.status(200).json({ despierta: false, ms: Date.now() - t0, detalle: String(e) });
  }
}
