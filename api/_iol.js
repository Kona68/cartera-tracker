// Cliente compartido de IOL. El guion bajo evita que Vercel lo publique como ruta.
// Variables de entorno necesarias: IOL_USER, IOL_PASS

let iolToken = null;
let iolTokenExpiry = 0;

export async function getIOLToken() {
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

export async function getIOLPrice(ticker, mercado = 'bCBA') {
  const token = await getIOLToken();
  const res = await fetch(
    `https://api.invertironline.com/api/v2/${mercado}/Titulos/${ticker}/Cotizacion`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.ultimoPrecio ?? data?.puntas?.[0]?.precioVenta ?? null;
}

// Serie diaria. IOL contesta la ajustada vacia para los CEDEARs y varias acciones,
// asi que se cae a sinAjustar: es la unica que trae datos para la mayoria del panel.
// Ojo que ahi los splits (YPFD partio 10:1) aparecen como un derrumbe que no existio;
// eso se corrige aparte, detectando el salto.
export async function getIOLSerie(ticker, desde, hasta, mercado = 'bCBA') {
  const token = await getIOLToken();
  const pedir = async (ajuste) => {
    const url = `https://api.invertironline.com/api/v2/${mercado}/Titulos/${ticker}/Cotizacion/seriehistorica/${desde}/${hasta}/${ajuste}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return { status: res.status, puntos: [] };
    const data = await res.json();
    if (!Array.isArray(data)) return { status: 'respuesta no es una lista', puntos: [] };
    // En ventanas largas IOL devuelve varios registros por dia (META: 1780 puntos en
    // 400 dias). Nos quedamos con el ultimo de cada rueda, o todo lo que cuenta ruedas
    // — 52 semanas, volatilidad, medias moviles — termina midiendo otra cosa.
    const porDia = new Map();
    for (const d of data) {
      if (!d?.fechaHora || !(d.ultimoPrecio > 0)) continue;
      const hora = String(d.fechaHora);
      const dia = hora.slice(0, 10);
      const previo = porDia.get(dia);
      if (!previo || hora > previo.hora) porDia.set(dia, { hora, precio: d.ultimoPrecio });
    }
    const puntos = [...porDia.entries()]
      .map(([fecha, v]) => ({ fecha, precio: v.precio }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { status: res.status, puntos };
  };

  let r = await pedir('ajustada');
  if (r.puntos.length) return { error: null, ajuste: 'ajustada', puntos: r.puntos };
  const sa = await pedir('sinAjustar');
  if (sa.puntos.length) return { error: null, ajuste: 'sinAjustar', puntos: sa.puntos };
  return { error: r.status === 200 ? sa.status : r.status, ajuste: null, puntos: [] };
}
