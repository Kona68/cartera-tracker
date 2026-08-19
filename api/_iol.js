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

// Serie diaria ajustada. Sin ajustar, un split como el de YPFD parte el grafico al medio.
export async function getIOLSerie(ticker, desde, hasta, mercado = 'bCBA') {
  const token = await getIOLToken();
  const url = `https://api.invertironline.com/api/v2/${mercado}/Titulos/${ticker}/Cotizacion/seriehistorica/${desde}/${hasta}/ajustada`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return { error: res.status, puntos: [] };
  const data = await res.json();
  if (!Array.isArray(data)) return { error: 'respuesta no es una lista', puntos: [] };
  const puntos = data
    .filter(d => d?.fechaHora && d?.ultimoPrecio)
    .map(d => ({ fecha: String(d.fechaHora).slice(0, 10), precio: d.ultimoPrecio }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { error: null, puntos };
}
