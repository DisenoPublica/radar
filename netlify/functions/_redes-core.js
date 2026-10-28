// Redes desde Meltwater, UNA vez por día (función programada redes-refresh, 10:30 hora argentina).
// Abrir el tablero o cambiar de período NO consulta a Meltwater: /api/periodo arma el período con lo guardado.
//
// Se guarda un bloque por mes ('rm:AAAA-MM') con volumen y sentiment por red, serie diaria y posteos destacados.
// Cada corrida: actualiza el mes en curso, cierra el mes anterior si quedó incompleto y completa meses
// faltantes (los más recientes primero), hasta REDES_MESES_POR_DIA meses extra por corrida.
// Costo: ~5 llamadas por mes consultado (4 redes + destacados). Cuota compartida con Pulso Empresarial.
import { leer, escribir, SEARCH_ID } from './_radar-core.js';

const API = 'https://api.meltwater.com/v3';
const TZ = 'America/Argentina/Buenos_Aires';
const INICIO = '2026-01';
// YouTube y LinkedIn no están disponibles en analytics para esta cuenta (responden 400): no se piden.
export const REDES = { twitter: ['twitter', 'x'], facebook: ['facebook'], instagram: ['instagram'], tiktok: ['tiktok'] };
const EXTRA = Math.max(0, Math.min(6, Number(process.env.REDES_MESES_POR_DIA || 3)));

export const hoyAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const masUnDia = (d) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
export const finMes = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
export function meses(desde, hasta) {
  const out = []; let [y, m] = desde.slice(0, 7).split('-').map(Number);
  const [yh, mh] = hasta.slice(0, 7).split('-').map(Number);
  while (y < yh || (y === yh && m <= mh)) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

async function analytics(source, desde, hasta) {
  const u = API + '/analytics/' + SEARCH_ID + '?source=' + source + '&start=' + desde + 'T00:00:00&end=' + masUnDia(hasta) + 'T00:00:00&tz=' + encodeURIComponent(TZ);
  const res = await fetch(u, { headers: { apikey: process.env.MELTWATER_API_KEY, Accept: 'application/json' } });
  if (!res.ok) { const e = new Error(source + ' ' + res.status + ': ' + (await res.text()).slice(0, 160)); e.status = res.status; throw e; }
  return res.json();
}
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
async function topPosteos(desde, hasta) {
  const res = await fetch(API + '/search/' + SEARCH_ID, {
    method: 'POST',
    headers: { apikey: process.env.MELTWATER_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ start: desde + 'T00:00:00', end: masUnDia(hasta) + 'T00:00:00', tz: TZ, page: 1, page_size: 100,
      sort_by: 'engagement', sort_order: 'desc', template: { name: 'api.json' } })
  });
  if (!res.ok) { const e = new Error('top ' + res.status); e.status = res.status; throw e; }
  const j = await res.json();
  const docs = (j.result && j.result.documents) || j.documents || [];
  return docs.map((d) => {
    const a = d.author || {}, src = d.source || {}, c = d.content || {}, m = d.metrics || d.social_metrics || {};
    const url = d.url || c.url || '';
    const red = (/twitter|x\.com/.test(url) && 'twitter') || (/instagram/.test(url) && 'instagram') || (/facebook/.test(url) && 'facebook') ||
      (/tiktok/.test(url) && 'tiktok') || null;
    const eng = Number((m.engagement && (m.engagement.total ?? m.engagement)) || 0);
    return { red, handle: a.handle || a.username || '', nombre: a.name || a.handle || src.name || '', eng,
      alcance: Number(m.reach || src.reach || 0), texto: String(c.opening_text || c.body || c.title || d.title || '').slice(0, 280),
      url, fecha: String(d.published_date || d.date || '').slice(0, 10) };
  }).filter((p) => p.red && p.handle);
}

async function consultarMes(mes, hoy) {
  const desde = mes + '-01', fm = finMes(mes), hasta = fm < hoy ? fm : hoy;
  const redes = {}, errores = [];
  let llamadas = 0, cupo = false;
  for (const [k, alias] of Object.entries(REDES)) {
    for (const s of alias) {
      llamadas++;
      try { redes[k] = leerAnalytics(await analytics(s, desde, hasta)); break; }
      catch (e) { errores.push(e.message); if (e.status === 429) { cupo = true; break; } }
    }
    if (cupo) break;
  }
  let top = [];
  if (!cupo) { llamadas++; try { top = await topPosteos(desde, hasta); } catch (e) { errores.push(e.message); if (e.status === 429) cupo = true; } }
  return { mes, desde, hasta, completo: hasta === fm, consultado: new Date().toISOString(), redes, top, errores, llamadas, cupo };
}

export async function refrescarRedes(origen) {
  const t0 = Date.now(), hoy = hoyAR(), actual = hoy.slice(0, 7);
  if (!process.env.MELTWATER_API_KEY) {
    const e = { ok: false, cuando: new Date().toISOString(), origen, error: 'Falta MELTWATER_API_KEY' };
    await escribir('redes-estado', e); return e;
  }
  const todos = meses(INICIO, hoy);
  const guardados = {};
  for (const m of todos) guardados[m] = await leer('rm:' + m);
  // Orden: mes en curso, meses guardados incompletos, y meses faltantes (más recientes primero).
  const cola = [actual];
  todos.slice().reverse().forEach((m) => { if (m !== actual && guardados[m] && !guardados[m].completo) cola.push(m); });
  const faltan = todos.slice().reverse().filter((m) => m !== actual && !guardados[m]);
  cola.push(...faltan.slice(0, EXTRA));
  let llamadas = 0, error = null; const hechos = [];
  for (const m of cola) {
    if (Date.now() - t0 > 22000) break;
    const r = await consultarMes(m, hoy);
    llamadas += r.llamadas;
    if (Object.keys(r.redes).length) { const { llamadas: _l, cupo: _c, ...guardar } = r; await escribir('rm:' + m, guardar); hechos.push(m); }
    if (r.cupo) { error = 'Meltwater respondió 429: se agotó el cupo diario de llamadas. Mañana sigue.'; break; }
    if (!Object.keys(r.redes).length && r.errores.length) { error = r.errores[0]; }
  }
  const disponibles = [];
  for (const m of todos) if (hechos.includes(m) || guardados[m]) disponibles.push(m);
  const estado = { ok: !error || hechos.length > 0, cuando: new Date().toISOString(), origen, llamadas, actualizados: hechos,
    disponibles, faltan: todos.filter((m) => !disponibles.includes(m)), error };
  await escribir('redes-estado', estado);
  return estado;
}
