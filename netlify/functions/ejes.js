// Endpoint que lee el tablero: notas de prensa de los Excel de EJES cargados en /cargar.
//   GET /api/ejes
import { leer } from './_radar-core.js';
import { estadoEjes } from './_ejes-core.js';

export default async () => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  const estado = (await leer('ejes-estado')) || (await estadoEjes('lectura'));
  const archivos = Object.values((await leer('ejes-archivos')) || {}).sort((a, b) => String(b.t).localeCompare(String(a.t)));
  const notas = Object.values((await leer('ejes-docs')) || {});
  return new Response(JSON.stringify({ ok: true, estado, archivos, notas }), { status: 200, headers });
};
