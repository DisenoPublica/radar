# RADAR EE — deploy en Netlify

Mismo esquema que Pulso Empresarial. Subí **esta carpeta entera** y el tablero se
actualiza solo todos los días a las **10:30** desde la búsqueda **29072735** de Meltwater.

## 1. Subir

Entrá a **app.netlify.com/drop** y arrastrá esta carpeta.

Si ya tenías el sitio del radar creado: entrá al sitio → **Deploys** → arrastrá la
carpeta en el recuadro de abajo que dice *"Drag and drop your site output folder here"*.
Así conserva la dirección y las variables.

## 2. Variables de entorno

En **Site configuration → Environment variables**:

| Variable | Valor |
|---|---|
| `MELTWATER_API_KEY` | el mismo token que usa Pulso Empresarial |
| `MELTWATER_SEARCH_ID` | `29072735` |

**Base reiniciada (19 oct 2026):** el tablero ya no trae notas embebidas. Borrá `MELTWATER_DESDE` si la tenías cargada. En el primer refresco el servicio borra lo guardado y vuelve a descargar desde el 1 ene 2026, solo con la búsqueda actual (Eduardo Elsztain).

Para ponerse al día más rápido, cargá `RADAR_TOPE` = `10` durante unos días (10 llamadas diarias en vez de 3) y después borrala.

## 3. Redeploy

**Deploys → Trigger deploy → Deploy site.** Las variables solo se aplican en el
deploy siguiente a haberlas cargado.

## 4. Comprobar

Abrí el sitio → pestaña **Fuente de datos**. El primer panel dice:

- **Verde "Se actualiza solo"** y cuántas notas nuevas se sumaron.
- **Ámbar "poniéndose al día"**: anda; completa lo que falta en los días siguientes.
- **Rojo**: dice el motivo exacto.
- **Gris "no detectado"**: la función no se publicó.

Detalle técnico: `https://TU-SITIO.netlify.app/api/datos`

## Cuota de Meltwater

La cuenta tiene **50 llamadas por día, compartidas con Pulso Empresarial**. Pulso usa
~13 a las 10:00; el radar usa **como máximo 3** a las 10:30. Abrir el tablero no gasta
llamadas.

Si hoy ya aparece un error 429, es la cuota del día agotada por la versión anterior
del radar: se libera sola y mañana a las 10:30 trae las notas.
