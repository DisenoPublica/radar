// Actualización diaria de redes desde Meltwater: todos los días a las 10:30 (hora argentina).
// Es la ÚNICA función que consulta a Meltwater. El tablero lee lo guardado.
import { refrescarRedes } from './_redes-core.js';

export default async () => {
  const r = await refrescarRedes('programada');
  return new Response(JSON.stringify(r, null, 2), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};

export const config = { schedule: '30 13 * * *' };
