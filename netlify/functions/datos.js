// Endpoint que lee el tablero. Sirve lo que dejó guardado el refresco diario.
// Solo consulta Meltwater una vez en la vida del sitio: la primera visita,
// si el refresco diario todavía no corrió nunca (máximo 3 llamadas).
//
//   GET /api/datos   -> notas acumuladas + estado del servicio

import { leer, refrescar, hayAlmacen } from './_radar-core.js';

export default async () => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400'
  };

  if (!process.env.MELTWATER_API_KEY) {
    return new Response(JSON.stringify({
      ok: true,
      estado: { ok: false, cuando: new Date().toISOString(),
        error: 'Falta MELTWATER_API_KEY en las variables de entorno de Netlify (o falta el redeploy después de cargarla).' },
      notas: []
    }), { status: 200, headers });
  }

  let estado = await leer('estado');
  // Arranque: solo si hay almacenamiento persistente (si no, cada arranque en frío
  // volvería a consultar y gastaría cuota).
  if (!estado && (await hayAlmacen())) estado = await refrescar('primera-visita');

  const docs = (await leer('docs')) || {};
  const todos = Object.values(docs);
  const notas = todos.filter((d) => !d.social && d.titulo);
  // Agregados para sumar a los números embebidos (espejo de Meltwater, desde el 29 sep).
  const agregados = { prensa: {}, redes: {}, redesSent: { pos: 0, neu: 0, neg: 0 } };
  const sk = (s) => (s.startsWith('pos') ? 'pos' : s.startsWith('neg') ? 'neg' : s ? 'neu' : 'unk');
  for (const x of todos) {
    const mes = (x.fecha || '').slice(0, 7);
    if (!mes) continue;
    const s = sk(x.sent || '');
    if (x.social) {
      const r = x.red || 'twitter';
      agregados.redes[mes] = agregados.redes[mes] || {};
      agregados.redes[mes][r] = (agregados.redes[mes][r] || 0) + 1;
      if (s !== 'unk') agregados.redesSent[s]++;
    } else {
      agregados.prensa[mes] = agregados.prensa[mes] || { pos: 0, neu: 0, neg: 0, unk: 0 };
      agregados.prensa[mes][s]++;
    }
  }
  let camposMuestra = null;
  if (!notas.length) {
    const m = await leer('muestra');
    if (m) camposMuestra = Object.keys(m).concat(Object.keys(m.content || {}).map((k) => 'content.' + k));
  }

  return new Response(JSON.stringify({ ok: true, estado, notas, agregados, camposMuestra }), { status: 200, headers });
};
