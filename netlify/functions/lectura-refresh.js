// Lectura de notas completas, programada cada 10 minutos. No usa llamadas de Meltwater.
// Lee las notas online de los Excel de EJES (las de TV, radio y gráfica no tienen texto en la web).
import { refrescarLectura } from './_lectura-core.js';

export default async () => {
  const r = await refrescarLectura();
  return new Response(JSON.stringify(r, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};

export const config = { schedule: '*/10 * * * *' };
