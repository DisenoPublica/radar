// Núcleo del RADAR EE: consulta a Meltwater, acumulación de notas y persistencia.
// Mismo esquema que Pulso Empresarial: se arma una vez por día y se guarda;
// abrir el tablero NO gasta llamadas.
//
// CUOTA: la cuenta de Meltwater tiene 50 llamadas por día, COMPARTIDAS con
// Pulso Empresarial (que usa ~13 a las 10:00). Cada página de resultados cuenta
// como 1 llamada. Este tablero usa como máximo RADAR_TOPE (3 por defecto).

const API = 'https://api.meltwater.com/v3';
export const SEARCH_ID = process.env.MELTWATER_SEARCH_ID || '29072735';
const TZ = 'America/Argentina/Buenos_Aires';
const TOPE = Math.max(1, Math.min(10, Number(process.env.RADAR_TOPE || 3)));
const PAGE = 100;
// El HTML trae el histórico (solo menciones de Eduardo) hasta el 28 sep; se descarga desde el 29 sep.
const EMBEBIDO_HASTA = '2026-09-29';
// Cambiar esta marca borra lo guardado y vuelve a descargar desde cero.
const VERSION_BASE = 'elsztain-2026-10-20';
const INICIO_BASE = '2026-09-29';

// ---------------------------------------------------------------------------
// Persistencia: Netlify Blobs si está disponible; si no, memoria del proceso.
// ---------------------------------------------------------------------------
const memoria = {};
async function store() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore('radar-ee');
  } catch (_) { return null; }
}
export async function leer(k) {
  const s = await store();
  if (s) { try { const v = await s.get(k, { type: 'json' }); if (v != null) return v; } catch (_) {} }
  return memoria[k] ?? null;
}
export async function escribir(k, v) {
  memoria[k] = v;
  const s = await store();
  if (s) { try { await s.setJSON(k, v); } catch (_) {} }
}
export async function hayAlmacen() { return !!(await store()); }

// ---------------------------------------------------------------------------
const pick = (...v) => v.find((x) => x !== undefined && x !== null && x !== '');
const txt = (v) => (typeof v === 'string' ? v : '');
const dia = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const sumarDias = (f, n) => new Date(new Date(f + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);

async function pagina(start, end, page) {
  const res = await fetch(API + '/search/' + SEARCH_ID, {
    method: 'POST',
    headers: { apikey: process.env.MELTWATER_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start, end, tz: TZ, page, page_size: PAGE,
      sort_by: 'date', sort_order: 'asc', template: { name: 'api.json' }
    })
  });
  if (!res.ok) {
    const e = new Error('Meltwater ' + res.status + ': ' + (await res.text()).slice(0, 220));
    e.status = res.status;
    throw e;
  }
  const j = await res.json();
  return (j.result && j.result.documents) || j.documents || [];
}

// Forma chica y estable. La clasificación (tema, activos, sentiment) la hace el tablero.
function normalizar(d) {
  const src = d.source || {}, c = d.content || {}, a = d.author || {};
  const m = d.metrics || src.metrics || {}, en = d.enrichments || {};
  const tipo = String(pick(d.content_type, src.information_type, src.type, '')).toLowerCase();
  const url = pick(d.url, c.url, '');
  return {
    id: String(pick(d.id, d.document_id, url, Math.random())),
    fecha: String(pick(d.published_date, d.date, '')).slice(0, 10),
    medio: pick(src.name, src.title, src.url, '—'),
    titulo: txt(pick(c.title, d.title, '')),
    texto: txt(pick(c.opening_text, c.summary, c.body, '')).slice(0, 600),
    autor: txt(pick(a.name, a.handle, '')),
    handle: txt(pick(a.handle, a.username, '')),
    eng: Number(pick(m.engagement && (m.engagement.total ?? m.engagement), (d.social_metrics || {}).engagement, 0)) || 0,
    url,
    sent: (() => { const s = pick(en.sentiment, d.sentiment, ''); return String((s && typeof s === 'object') ? (s.label || s.value || s.sentiment || s.polarity || '') : s).toLowerCase(); })(),
    alcance: Number(pick(m.reach, m.audience, src.reach, 0)) || 0,
    ave: Number(pick(m.ave, m.advertising_value_equivalency, 0)) || 0,
    // Por API, X/Twitter solo trae el ID del posteo, sin texto: no sirve para la tabla.
    social: /social|twitter|facebook|instagram|tiktok|youtube|reddit|linkedin|x\.com/.test(tipo + ' ' + url),
    red: (/twitter|x\.com/.test(tipo + ' ' + url) && 'twitter') || (/facebook/.test(tipo + ' ' + url) && 'facebook') ||
      (/instagram/.test(tipo + ' ' + url) && 'instagram') || (/youtube|youtu\.be/.test(tipo + ' ' + url) && 'youtube') ||
      (/linkedin/.test(tipo + ' ' + url) && 'linkedin') || (/tiktok/.test(tipo + ' ' + url) && 'tiktok') || null
  };
}

export async function refrescar(origen) {
  const t0 = Date.now();
  // Reinicio: arranca siempre el 29 sep 2026 (ignora MELTWATER_DESDE). La marca de versión
  // se guarda recién cuando entra la primera nota, así un 429 no deja el reinicio a medias.
  const reinicio = (await leer('version')) !== VERSION_BASE;
  const acumulado = reinicio ? {} : ((await leer('docs')) || {});
  const cursor = reinicio ? { desde: INICIO_BASE } : ((await leer('cursor')) || {});
  const env = process.env.MELTWATER_DESDE || EMBEBIDO_HASTA;
  const desde = cursor.desde || env;
  const end = dia(1) + 'T00:00:00';

  let llamadas = 0, nuevos = 0, ultima = null, alDia = false, error = null, muestra = null;
  try {
    for (let page = 1; page <= TOPE; page++) {
      if (Date.now() - t0 > 8000) break;
      llamadas++;
      const docs = await pagina(desde + 'T00:00:00', end, page);
      if (!muestra && docs[0]) muestra = docs[0];
      for (const raw of docs) {
        const d = normalizar(raw);
        if (!d.fecha) continue;
        if (!acumulado[d.id]) nuevos++;
        acumulado[d.id] = d;
        if (!ultima || d.fecha > ultima) ultima = d.fecha;
      }
      if (docs.length < PAGE) { alDia = true; break; }
    }
  } catch (e) {
    error = e.status === 429
      ? 'Meltwater respondió 429: se agotaron las 50 llamadas diarias de la cuenta (compartidas con Pulso Empresarial). Reintenta solo mañana a las 10:00.'
      : (e.status === 401 || e.status === 403)
        ? 'Meltwater respondió ' + e.status + ': el token no es válido o no tiene acceso a la búsqueda ' + SEARCH_ID + '.'
        : e.status === 404
          ? 'Meltwater respondió 404: la búsqueda ' + SEARCH_ID + ' no existe para esta cuenta.'
          : String(e.message || e).slice(0, 220);
  }

  // Al día: mañana pide desde ayer (los duplicados se descartan).
  // A medias: sigue desde la última fecha traída; si no avanzó, salta un día.
  let proximo = desde;
  if (alDia) proximo = dia(-1);
  else if (ultima) proximo = ultima > desde ? ultima : sumarDias(desde, 1);

  // La búsqueda ya no trae menciones solo de IRSA: se purgan las que quedaron guardadas
  // de la versión anterior (sin Elsztain ni sus variantes en título o texto). Las redes no se tocan.
  const EE = /elsztain|elstein|elsztein|elstain|eduardo einstein/i;
  let purgadas = 0;
  for (const k of Object.keys(acumulado)) {
    const d = acumulado[k];
    // La búsqueda ya es solo de Eduardo: se conservan todas las notas aunque el extracto no lo nombre.
    void d; void EE;
  }
  const corte = dia(-400);
  for (const k of Object.keys(acumulado)) if (acumulado[k].fecha < corte) delete acumulado[k];

  await escribir('docs', acumulado);
  await escribir('cursor', { desde: proximo });
  if (reinicio && nuevos > 0) await escribir('version', VERSION_BASE);
  if (muestra) await escribir('muestra', muestra);

  const estado = {
    ok: !error || nuevos > 0,
    parcial: !!error || !alDia,
    cuando: new Date().toISOString(),
    origen, llamadas, nuevos, purgadas, reinicio, base: VERSION_BASE,
    total: Object.keys(acumulado).length,
    proximoDesde: proximo,
    searchId: SEARCH_ID,
    error
  };
  await escribir('estado', estado);
  return estado;
}
