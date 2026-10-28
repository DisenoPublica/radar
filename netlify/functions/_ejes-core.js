// EJES: arma la base de notas de prensa con los Excel de EJES que se suben en la página /cargar
// (función carga.js). Los archivos subidos solo se borran desde esa página.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { leer, escribir } from './_radar-core.js';

// ---------- Lectura de XLSX / CSV sin dependencias ----------
function unzip(buf, quiere) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('el archivo no es un .xlsx válido');
  const n = buf.readUInt16LE(e + 10), out = {};
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const metodo = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const nombre = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    p += 46 + nl + xl + cl;
    if (!quiere(nombre)) continue;
    const ini = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const datos = buf.slice(ini, ini + csize);
    out[nombre] = (metodo === 0 ? datos : zlib.inflateRawSync(datos)).toString('utf8');
  }
  return out;
}
const dec = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export function filasXlsx(buf) {
  const z = unzip(buf, (n) => n === 'xl/sharedStrings.xml' || n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const strs = [...(z['xl/sharedStrings.xml'] || '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => dec(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, '').replace(/<[^>]+>/g, '')));
  // Primera hoja según el libro; si no, la de número más bajo.
  let hoja = null;
  const rels = z['xl/_rels/workbook.xml.rels'] || '';
  const rid = ((z['xl/workbook.xml'] || '').match(/<sheet [^>]*r:id="([^"]+)"/) || [])[1];
  if (rid) { const t = (rels.match(new RegExp('Id="' + rid + '"[^>]*Target="([^"]+)"')) || rels.match(new RegExp('Target="([^"]+)"[^>]*Id="' + rid + '"')) || [])[1];
    if (t) hoja = 'xl/' + t.replace(/^\/?xl\//, '').replace(/^\//, ''); }
  if (!hoja || !z[hoja]) hoja = Object.keys(z).filter((k) => /worksheets\/sheet\d+/.test(k)).sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))[0];
  if (!hoja) throw new Error('el .xlsx no tiene hojas');
  const filas = [];
  for (const r of z[hoja].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const c = {};
    for (const x of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = (x[3] || '').match(/<v>([\s\S]*?)<\/v>/), is = (x[3] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/);
      c[x[1]] = /t="s"/.test(x[2]) && v ? strs[+v[1]] : dec(v ? v[1] : is ? is[1] : '');
    }
    filas.push(c);
  }
  return filas;
}
export function filasCsv(txt) {
  const l0 = txt.split('\n')[0];
  const sep = (l0.match(/;/g) || []).length > (l0.match(/,/g) || []).length ? ';' : ',';
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"' && txt[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') q = false; else campo += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n') { fila.push(campo.replace(/\r$/, '')); filas.push(fila); fila = []; campo = ''; } else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const L = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  return filas.map((f) => Object.fromEntries(f.map((v, i) => [L(i), v])));
}

// ---------- Formato EJES → nota del tablero ----------
const fechaDe = (v) => {
  const s = String(v || '').trim();
  if (/^\d+(\.\d+)?$/.test(s) && +s > 30000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5).toISOString().slice(0, 10);
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
};
const num = (v) => { const s = String(v || '').trim(); if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s)) return +s; const n = parseFloat(s.replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
export function notasEjes(filas, fileId) {
  const hi = filas.slice(0, 15).findIndex((f) => { const v = Object.values(f).map((x) => String(x).trim().toUpperCase()); return v.includes('TITULO') && v.includes('MEDIO'); });
  if (hi < 0) throw new Error('no se encontró la fila de encabezados (TITULO, MEDIO, FECHA…)');
  const col = {};
  for (const [k, v] of Object.entries(filas[hi])) { const n = String(v).trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); if (!(n in col)) col[n] = k; }
  const g = (f, n) => String(f[col[n]] ?? '').trim();
  const out = [];
  for (const f of filas.slice(hi + 1)) {
    const fecha = fechaDe(g(f, 'FECHA')), titulo = g(f, 'TITULO'), medio = g(f, 'MEDIO');
    if (!fecha || fecha < '2000' || (!titulo && !medio)) continue;
    const cm2 = num(g(f, 'CM2')), dur = g(f, 'DURACION');
    const url = g(f, 'LINK') || g(f, 'MULTIMEDIA');
    const id = g(f, 'ID') || crypto.createHash('sha1').update(fecha + '|' + medio + '|' + titulo + '|' + url).digest('hex').slice(0, 16);
    out.push({ id: 'E' + id, fecha, medio, titulo, prog: g(f, 'PROGRAMA'),
      texto: [g(f, 'PRECOPETE'), g(f, 'COPETE')].filter(Boolean).join(' — ').slice(0, 700),
      autor: g(f, 'ENTREVISTADO'), cargo: g(f, 'CARGO'), url,
      tp: cm2 > 0 ? 'Gráfica' : dur ? 'TV / Radio' : 'Digital',
      tier: Number(g(f, 'TIER')) || 3, alcance: num(g(f, 'AUDIENCIA')), ave: num(g(f, 'VALOR NOTICIA')),
      etiqueta: g(f, 'ETIQUETA'), f: fileId });
  }
  return out;
}

export async function estadoEjes(origen, extra) {
  const archivos = (await leer('ejes-archivos')) || {};
  const docs = (await leer('ejes-docs')) || {};
  // Notas o archivos que hayan quedado de la lectura de Drive (ya no se usa) salen de la base.
  let limpio = false;
  for (const id of Object.keys(archivos)) if (!String(id).startsWith('U')) { delete archivos[id]; limpio = true; }
  for (const k of Object.keys(docs)) if (!String(docs[k].f || '').startsWith('U')) { delete docs[k]; limpio = true; }
  if (limpio) { await escribir('ejes-docs', docs); await escribir('ejes-archivos', archivos); }
  const estado = Object.assign({ ok: true, error: null }, extra || {}, { cuando: new Date().toISOString(), origen,
    archivos: Object.keys(archivos).length, notas: Object.keys(docs).length,
    conError: Object.values(archivos).filter((x) => x.err).length });
  await escribir('ejes-estado', estado);
  return estado;
}

// ---------- Carga directa (página /cargar) ----------
export async function cargarArchivo(nombre, buf) {
  const id = 'U' + crypto.createHash('sha1').update(String(nombre).trim().toLowerCase()).digest('hex').slice(0, 15);
  const filas = /\.csv$/i.test(nombre) ? filasCsv(buf.toString('utf8').replace(/^\uFEFF/, '')) : filasXlsx(buf);
  const ns = notasEjes(filas, id);
  if (!ns.length) throw new Error('el archivo no tiene notas con fecha y título');
  const archivos = (await leer('ejes-archivos')) || {};
  const docs = (await leer('ejes-docs')) || {};
  const reemplaza = !!archivos[id];
  for (const k of Object.keys(docs)) if (docs[k].f === id) delete docs[k];
  let nuevas = 0;
  for (const d of ns) { if (!docs[d.id]) nuevas++; docs[d.id] = d; }
  const fs = ns.map((d) => d.fecha).sort();
  archivos[id] = { id, n: nombre, m: new Date().toISOString(), filas: ns.length, nuevas, t: new Date().toISOString(), o: 'carga',
    desde: fs[0], hasta: fs[fs.length - 1] };
  await escribir('ejes-docs', docs);
  await escribir('ejes-archivos', archivos);
  await estadoEjes('carga');
  return { id, nombre, notas: ns.length, nuevas, repetidas: ns.length - nuevas, reemplaza, desde: fs[0], hasta: fs[fs.length - 1] };
}
export async function borrarArchivo(id) {
  const archivos = (await leer('ejes-archivos')) || {};
  const docs = (await leer('ejes-docs')) || {};
  if (!archivos[id] || archivos[id].o !== 'carga') throw new Error('archivo no encontrado');
  delete archivos[id];
  let n = 0;
  for (const k of Object.keys(docs)) if (docs[k].f === id) { delete docs[k]; n++; }
  await escribir('ejes-docs', docs);
  await escribir('ejes-archivos', archivos);
  await estadoEjes('carga');
  return { id, borradas: n };
}
