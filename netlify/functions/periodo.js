// Redes de un período, armadas con lo que guardó la actualización diaria (redes-refresh, 10:30).
// NO consulta a Meltwater: abrir el tablero o cambiar de período no gasta llamadas.
//
//   GET /api/periodo?desde=2026-09-01&hasta=2026-09-30
//
// Volumen por red: suma exacta de la serie diaria del período. Sentiment: el de cada mes, prorrateado
// por la parte del mes que cae en el período. Posteos destacados: los de los meses del período.
import { leer } from './_radar-core.js';
import { hoyAR, meses, REDES } from './_redes-core.js';

export default async (req) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=600' };
  const q = new URL(req.url).searchParams;
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const hoy = hoyAR();
  let desde = q.get('desde'), hasta = q.get('hasta');
  if (!ok(desde) || !ok(hasta)) return new Response(JSON.stringify({ ok: false, error: 'Faltan desde/hasta (AAAA-MM-DD)' }), { status: 400, headers });
  if (hasta > hoy) hasta = hoy;
  const redes = {}, faltan = [];
  Object.keys(REDES).forEach((k) => { redes[k] = { total: 0, pos: 0, neg: 0, neu: 0, unk: 0, dias: {} }; });
  let top = [], consultado = null, cubierto = 0;
  for (const m of meses(desde, hasta)) {
    const b = await leer('rm:' + m);
    if (!b) { faltan.push(m); continue; }
    cubierto++;
    if (!consultado || b.consultado > consultado) consultado = b.consultado;
    for (const [k, r] of Object.entries(b.redes || {})) {
      if (!redes[k]) continue;
      let enRango = 0;
      for (const [d, v] of Object.entries(r.dias || {})) if (d >= desde && d <= hasta) { redes[k].dias[d] = (redes[k].dias[d] || 0) + v; enRango += v; }
      const sinSerie = !Object.keys(r.dias || {}).length;
      const parte = sinSerie ? 1 : (r.total ? enRango / r.total : 0);
      const vol = sinSerie ? r.total : enRango;
      redes[k].total += vol;
      ['pos', 'neg', 'neu', 'unk'].forEach((s) => { redes[k][s] += (r[s] || 0) * parte; });
    }
    top = top.concat((b.top || []).filter((p) => p.fecha >= desde && p.fecha <= hasta));
  }
  if (!cubierto) {
    return new Response(JSON.stringify({ ok: false, error: 'Todavía no hay datos de redes guardados para este período. Se completan con la actualización diaria de las 10:30.', faltan }), { status: 200, headers });
  }
  Object.values(redes).forEach((r) => ['pos', 'neg', 'neu', 'unk'].forEach((s) => { r[s] = Math.round(r[s]); }));
  top.sort((a, b) => b.eng - a.eng);
  const estado = await leer('redes-estado');
  return new Response(JSON.stringify({ ok: true, desde, hasta, hoy, consultado, prensa: null, redes, top: top.slice(0, 100),
    faltan, actualizacion: estado ? estado.cuando : null, errores: [] }), { status: 200, headers });
};
