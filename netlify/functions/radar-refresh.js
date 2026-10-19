// Refresco programado del RADAR EE. Netlify lo corre solo, todos los días.
// Costo: como máximo 3 llamadas de las 50 diarias de la cuenta de Meltwater.

import { refrescar } from './_radar-core.js';

export default async () => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (!process.env.MELTWATER_API_KEY) {
    return new Response(JSON.stringify({ ok: false, error: 'Falta MELTWATER_API_KEY.' }), { status: 500, headers });
  }
  const r = await refrescar('programada');
  return new Response(JSON.stringify(r, null, 2), { status: r.ok ? 200 : 502, headers });
};

// 13:30 UTC = 10:30 AM en Argentina. Media hora después de Pulso Empresarial,
// para no competir por la cuota en el mismo minuto.
export const config = { schedule: '30 13 * * *' };
