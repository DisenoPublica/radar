# RADAR EE — deploy en Netlify

Subí **esta carpeta entera** a la raíz del repo (rama `main`). Netlify publica solo.

## Fuentes
- **Prensa:** Excel de EJES. Se suben en la página **/cargar** del sitio (`https://irsa-radaree.netlify.app/cargar`),
  protegida con una clave. Acepta .xlsx, .xls y .csv. Las notas se suman al instante. Una nota repetida en dos Excel cuenta una vez (por ID de EJES);
  subir un archivo con el mismo nombre reemplaza al anterior; "Quitar" saca sus notas del tablero.
- **Redes:** Meltwater, búsqueda 29072735 (Twitter/X, Facebook, Instagram, TikTok), consultada por período.

## Variables de entorno (Netlify → Site configuration → Environment variables)
| Variable | Valor |
|---|---|
| `CARGA_CLAVE` | clave que usa el equipo para subir Excel en /cargar |
| `MELTWATER_API_KEY` | (ya cargada) token de Meltwater, solo para redes |

Variables que ya no se usan y se pueden borrar: `MELTWATER_DESDE`, `RADAR_TOPE`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`.

## Comprobar
- `https://irsa-radaree.netlify.app/cargar`: lista de archivos cargados y notas de cada uno.
- En el tablero, al pie de **Metodología**, el estado del servicio.

## Funciones
- `ejes`: endpoint `/api/ejes` que lee el tablero.
- `carga`: recibe los Excel de la página /cargar (`/api/carga`).
- `periodo`: redes de Meltwater por período (`/api/periodo`).
- `lectura-refresh` / `lectura`: lee la nota completa en el sitio del medio (solo notas online).
