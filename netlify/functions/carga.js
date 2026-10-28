// Carga de Excel de EJES desde la página /cargar.
//   GET    /api/carga                         lista de archivos cargados
//   POST   /api/carga?nombre=archivo.xlsx     cuerpo: el archivo (binario). Encabezado x-clave.
//   DELETE /api/carga?id=U…                   borra un archivo y sus notas. Encabezado x-clave.
// La clave se define en Netlify con la variable CARGA_CLAVE.
import { leer } from './_radar-core.js';
import { cargarArchivo, borrarArchivo } from './_ejes-core.js';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const r = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers });

export default async (req) => {
  const q = new URL(req.url).searchParams;
  if (req.method === 'GET') {
    const archivos = Object.values((await leer('ejes-archivos')) || {}).sort((a, b) => String(b.t).localeCompare(String(a.t)));
    return r({ ok: true, clave: !!process.env.CARGA_CLAVE, archivos, estado: await leer('ejes-estado') });
  }
  if (!process.env.CARGA_CLAVE) return r({ ok: false, error: 'Falta la variable CARGA_CLAVE en Netlify.' }, 500);
  if ((req.headers.get('x-clave') || '') !== process.env.CARGA_CLAVE) return r({ ok: false, error: 'Clave incorrecta.' }, 401);
  try {
    if (req.method === 'POST') {
      const nombre = (q.get('nombre') || 'ejes.xlsx').slice(0, 160);
      if (!/\.(xlsx|csv)$/i.test(nombre)) return r({ ok: false, error: 'Solo se aceptan archivos .xlsx o .csv.' }, 400);
      const buf = Buffer.from(await req.arrayBuffer());
      if (!buf.length) return r({ ok: false, error: 'El archivo está vacío.' }, 400);
      return r(Object.assign({ ok: true }, await cargarArchivo(nombre, buf)));
    }
    if (req.method === 'DELETE') return r(Object.assign({ ok: true }, await borrarArchivo(q.get('id') || '')));
    return r({ ok: false, error: 'Método no permitido' }, 405);
  } catch (e) {
    return r({ ok: false, error: String(e.message || e).slice(0, 240) }, 400);
  }
};
