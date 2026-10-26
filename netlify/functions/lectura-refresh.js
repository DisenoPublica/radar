// Lectura de notas completas, programada cada 10 minutos. No usa llamadas de Meltwater.
// Cada corrida lee unas 100 notas; las 2.000 de la base se completan en unas 4 horas.
import { refrescarLectura } from './_lectura-core.js';

export default async () => {
  const r = await refrescarLectura();
  return new Response(JSON.stringify(r, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};

export const config = { schedule: '*/10 * * * *' };
