// Lectura de la nota completa: abre cada nota en el sitio del medio y guarda los párrafos
// donde aparece Eduardo Elsztain. No usa llamadas de Meltwater.
import { leer, escribir } from './_radar-core.js';
import BASE from './_urls-base.js';

const EE_G = /\belsztain\b|eduardo (elstein|elsztein|elstain|einstein)|grupo elsztain/gi;
export const normUrl = (u) => String(u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', mdash: '—', ndash: '–', hellip: '…', iquest: '¿', iexcl: '¡', deg: '°', ordm: 'º', ordf: 'ª' };
const dec = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&([a-z]+);/gi, (m, k) => ENT[k] ?? m);
const limpio = (s) => dec(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

export function analizar(html) {
  let h = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe|figure|figcaption)\b[\s\S]*?<\/\1>/gi, ' ');
  const art = h.match(/<article\b[\s\S]*?<\/article>/gi);
  if (art && art.join('').length > 1500) h = art.join(' ');
  let ps = [...h.matchAll(/<(p|h2|h3|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => limpio(m[2])).filter((t) => t.length >= 40);
  if (ps.length < 3) ps = limpio(h.replace(/<br\s*\/?>/gi, '\n')).split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡“"])/).filter((t) => t.length >= 40);
  const vistos = new Set();
  ps = ps.filter((p) => { const k = p.slice(0, 80); if (vistos.has(k)) return false; vistos.add(k); return true; });
  if (!ps.length) return { st: 'vacia' };
  let n = 0, i = -1; const f = [];
  ps.forEach((p, k) => {
    const m = p.match(EE_G);
    if (!m) return;
    n += m.length;
    if (i < 0) i = k;
    if (f.length < 2) f.push(p.slice(0, 500));
  });
  return n ? { st: 'ok', n, i, ps: ps.length, f } : { st: 'sin', ps: ps.length };
}

export async function leerNota(url) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 7000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RadarEE/1.0; lectura de notas para monitoreo de prensa)',
      Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'es-AR,es;q=0.9' } });
    if (!r.ok) return { st: [401, 402, 403, 429, 451].includes(r.status) ? 'bloqueada' : 'error', c: r.status };
    const ct = r.headers.get('content-type') || '';
    if (!/html/i.test(ct)) return { st: 'error', c: 'tipo' };
    const buf = new Uint8Array(await r.arrayBuffer()).slice(0, 2500000);
    let cs = (ct.match(/charset=([\w-]+)/i) || [])[1];
    if (!cs) cs = (new TextDecoder('latin1').decode(buf.slice(0, 5000)).match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1];
    let html;
    try { html = new TextDecoder(cs || 'utf-8').decode(buf); } catch (_) { html = new TextDecoder('utf-8').decode(buf); }
    return analizar(html);
  } catch (e) {
    return { st: 'error', c: e.name === 'AbortError' ? 'tiempo' : 'red' };
  } finally { clearTimeout(to); }
}

// Cada corrida programada lee un lote, dentro del límite de 30 s de Netlify.
const PRESUPUESTO_MS = 15000, PARALELO = 8, REINTENTOS = 3, ESPERA_MS = 6 * 3600e3;

export async function refrescarLectura() {
  const t0 = Date.now();
  const mapa = (await leer('lectura')) || {};
  const docs = (await leer('ejes-docs')) || {};
  const lista = [], visto = new Set();
  const add = (url, fecha) => { const k = normUrl(url); if (!k || visto.has(k)) return; visto.add(k); lista.push({ url, k, fecha: fecha || '' }); };
  Object.values(docs).forEach((d) => { if (d.url && d.tp === 'Digital' && !/surl\.ejes\.com/.test(d.url)) add(d.url, d.fecha); });
  if (!Object.keys(docs).length) BASE.forEach(([u, f]) => add(u, f));
  const pend = lista.filter((x) => {
    const L = mapa[x.k];
    if (!L) return true;
    return L.st === 'error' && (L.r || 0) < REINTENTOS && Date.now() - (L.t || 0) > ESPERA_MS;
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  let leidas = 0;
  for (let j = 0; j < pend.length && Date.now() - t0 < PRESUPUESTO_MS; j += PARALELO) {
    const lote = pend.slice(j, j + PARALELO);
    const res = await Promise.all(lote.map((x) => leerNota(x.url)));
    lote.forEach((x, q) => { mapa[x.k] = Object.assign(res[q], { t: Date.now(), r: ((mapa[x.k] || {}).r || 0) + 1 }); });
    leidas += lote.length;
  }
  const cuenta = {};
  lista.forEach((x) => { const s = (mapa[x.k] || {}).st || 'pendiente'; cuenta[s] = (cuenta[s] || 0) + 1; });
  const estado = { cuando: new Date().toISOString(), leidasAhora: leidas, total: lista.length, cuenta,
    pendientes: Math.max(0, pend.length - leidas) };
  await escribir('lectura', mapa);
  await escribir('lectura-estado', estado);
  return estado;
}
