// Números exactos de Meltwater para un período: volumen, sentiment y serie diaria
// por fuente (prensa y cada red), más los posteos con más interacciones.
//
//   GET /api/periodo?desde=2026-09-01&hasta=2026-09-30
//
// Cada período se guarda: si ya terminó, para siempre; si incluye hoy, por 3 horas.

import { leer, escribir, SEARCH_ID } from './_radar-core.js';

const API = 'https://api.meltwater.com/v3';
const TZ = 'America/Argentina/Buenos_Aires';
// Fuentes de prensa y redes que se consultan por separado al endpoint de analytics.
const PRENSA = ['news', 'broadcast'];
const REDES = { twitter: ['twitter', 'x'], facebook: ['facebook'], instagram: ['instagram'], youtube: ['youtube'], linkedin: ['linkedin'], tiktok: ['tiktok'] };

const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const masUnDia = (d) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

async function analytics(source, desde, hasta) {
  const u = API + '/analytics/' + SEARCH_ID + '?source=' + source + '&start=' + desde + 'T00:00:00&end=' + masUnDia(hasta) + 'T00:00:00&tz=' + encodeURIComponent(TZ);
  const res = await fetch(u, { headers: { apikey: process.env.MELTWATER_API_KEY, Accept: 'application/json' } });
  if (!res.ok) { const e = new Error(source + ' ' + res.status + ': ' + (await res.text()).slice(0, 160)); e.status = res.status; throw e; }
  return res.json();
}

// La respuesta trae volume, sentiment y una serie temporal; se lee con tolerancia a variantes de nombre.
function leerAnalytics(j) {
  const s = j.sentiment || {};
  const n = (o) => Number((o && (o.document_count ?? o.count)) || 0);
  const out = { total: n(j.volume) || 0, pos: n(s.positive), neg: n(s.negative), neu: n(s.neutral), unk: n(s.unknown), dias: {} };
  if (!out.total) out.total = out.pos + out.neg + out.neu + out.unk;
  const serie = j.time_series || j.timeseries || (j.volume && (j.volume.time_series || j.volume.daily)) || j.daily || [];
  const arr = Array.isArray(serie) ? serie : (serie.daily || serie.by_day || serie.days || []);
  for (const p of arr) {
    const d = String(p.date || p.timestamp || p.key || '').slice(0, 10);
    const v = Number(p.document_count ?? p.count ?? p.value ?? 0);
    if (d) out.dias[d] = (out.dias[d] || 0) + v;
  }
  return out;
}

function sumar(a, b) {
  if (!a) return b;
  const r = { total: a.total + b.total, pos: a.pos + b.pos, neg: a.neg + b.neg, neu: a.neu + b.neu, unk: a.unk + b.unk, dias: { ...a.dias } };
  for (const d in b.dias) r.dias[d] = (r.dias[d] || 0) + b.dias[d];
  return r;
}

async function topPosteos(desde, hasta) {
  const res = await fetch(API + '/search/' + SEARCH_ID, {
    method: 'POST',
    headers: { apikey: process.env.MELTWATER_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ start: desde + 'T00:00:00', end: masUnDia(hasta) + 'T00:00:00', tz: TZ, page: 1, page_size: 100,
      sort_by: 'engagement', sort_order: 'desc', template: { name: 'api.json' } })
  });
  if (!res.ok) throw new Error('top ' + res.status);
  const j = await res.json();
  const docs = (j.result && j.result.documents) || j.documents || [];
  return docs.map((d) => {
    const a = d.author || {}, src = d.source || {}, c = d.content || {}, m = d.metrics || d.social_metrics || {};
    const url = d.url || c.url || '';
    const red = (/twitter|x\.com/.test(url) && 'twitter') || (/instagram/.test(url) && 'instagram') || (/facebook/.test(url) && 'facebook') ||
      (/youtube|youtu\.be/.test(url) && 'youtube') || (/linkedin/.test(url) && 'linkedin') || (/tiktok/.test(url) && 'tiktok') || null;
    const eng = Number((m.engagement && (m.engagement.total ?? m.engagement)) || 0);
    return { red, handle: a.handle || a.username || '', nombre: a.name || a.handle || src.name || '', eng,
      alcance: Number(m.reach || src.reach || 0), texto: String(c.opening_text || c.body || c.title || d.title || '').slice(0, 280),
      url, fecha: String(d.published_date || d.date || '').slice(0, 10) };
  }).filter((p) => p.red && p.handle);
}

export default async (req) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=900' };
  const q = new URL(req.url).searchParams;
  const hoy = hoyAR();
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  let desde = q.get('desde'), hasta = q.get('hasta');
  if (!ok(desde) || !ok(hasta)) return new Response(JSON.stringify({ ok: false, error: 'Faltan desde/hasta (AAAA-MM-DD)' }), { status: 400, headers });
  if (hasta > hoy) hasta = hoy;
  if (!process.env.MELTWATER_API_KEY) return new Response(JSON.stringify({ ok: false, error: 'Falta MELTWATER_API_KEY' }), { status: 200, headers });

  const key = 'periodo:' + desde + ':' + hasta;
  const guardado = await leer(key);
  const vigente = guardado && (hasta < hoy || Date.now() - new Date(guardado.consultado).getTime() < 3 * 3600e3);
  if (vigente) return new Response(JSON.stringify(guardado), { status: 200, headers });

  const errores = [];
  let prensa = null;
  for (const s of PRENSA) {
    try { prensa = sumar(prensa, leerAnalytics(await analytics(s, desde, hasta))); } catch (e) { errores.push(e.message); }
  }
  const redes = {};
  for (const [k, alias] of Object.entries(REDES)) {
    for (const s of alias) {
      try { redes[k] = leerAnalytics(await analytics(s, desde, hasta)); break; } catch (e) { errores.push(e.message); }
    }
  }
  let top = [];
  try { top = await topPosteos(desde, hasta); } catch (e) { errores.push(e.message); }

  if (!prensa && !Object.keys(redes).length) {
    if (guardado) return new Response(JSON.stringify({ ...guardado, aviso: 'Meltwater no respondió; se muestra la última consulta guardada.', errores }), { status: 200, headers });
    return new Response(JSON.stringify({ ok: false, error: errores[0] || 'Meltwater no respondió', errores }), { status: 200, headers });
  }
  const out = { ok: true, desde, hasta, hoy, consultado: new Date().toISOString(), prensa, redes, top, errores };
  try { await escribir(key, out); } catch (e) {}
  return new Response(JSON.stringify(out), { status: 200, headers });
};
