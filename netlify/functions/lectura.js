// Endpoint que lee el tablero: párrafos donde aparece Eduardo en cada nota leída.
//   GET /api/lectura
import { leer } from './_radar-core.js';

export default async () => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=900, stale-while-revalidate=86400' };
  const mapa = (await leer('lectura')) || {};
  const notas = {};
  for (const [k, L] of Object.entries(mapa)) notas[k] = L.st === 'ok' ? { st: 'ok', n: L.n, i: L.i, ps: L.ps, f: L.f } : { st: L.st };
  return new Response(JSON.stringify({ ok: true, estado: (await leer('lectura-estado')) || null, notas }), { status: 200, headers });
};
