# /movements — Roadmap de mejoras

Estado al **2026-05-06**: implementado **Alt 2** (filtros por tipo / período / categoría / cuenta + summary bar de 3 KPIs + URL sync + deep-link desde el `CategoryDrillDownSheet`).

Las alternativas **Alt 3** y **Alt 4** se identificaron pero se difieren — este documento las captura para retomarlas sin volver a hacer el análisis desde cero.

---

## Alt 3 — Agrupación flexible

### Problema que resuelve

Hoy las filas de `/movements` siempre se agrupan por día (sticky headers + neto del día a la derecha). Esa es la vista correcta para escanear "qué hice ayer y hoy", pero **no responde** preguntas como:

- "En lo que va del mes, ¿cuánto en cada categoría?"
- "Pagos a Sedapal, ¿cuántas veces y cuánto?"
- "¿Cómo me fue por cuenta?"

Hoy esas preguntas se contestan saltando a `/dashboard` (donut + drill-down) o a `/insights`. Mantener al usuario en `/movements` con un toggle de agrupación reduce navegación.

### Diseño propuesto

Toggle pequeño al lado de la KPI bar — tres modos:

| Modo | Header del grupo | Subtítulo | Total a la derecha |
|---|---|---|---|
| **Día** (default actual) | "Hoy" / "Ayer" / "Mar 12 May" | — | Neto del día |
| **Categoría** | Nombre de la categoría con dot tinted | "N pagos" | Total acumulado |
| **Comercio** | Nombre del comercio + avatar | "N pagos · última fecha" | Total acumulado |

Cada grupo es **colapsable** (chevron). Default: todos abiertos.

### Por qué se difiere

1. Solapamiento con `/insights` y con el drill-down recién mergeado. Necesitamos un mes de uso real para ver si la pregunta "qué pasó por categoría en este rango" se resuelve mejor en `/movements` o en el drill-down del donut.
2. Riesgo de paralysis-by-options. Cuatro filtros + 3 modos de agrupación + búsqueda = densidad UI alta para un usuario nuevo.
3. Implementación no-trivial: hay que rehacer `groupByDay()` para que sea genérico (`groupBy<K>(rows, keyFn, headerFn, totalFn)`), refactorear `DayGroupSection` a un `Group<K>Section` parametrizado, y agregar el toggle persistido en URL.

### Cuándo retomarlo

Cualquiera de estas señales:

- Un usuario reporta "quisiera ver mis movimientos agrupados por categoría / por comercio".
- El drill-down del donut se queda corto (los users abren `/movements` desde ahí más de lo esperado).
- Empezamos a tener > 200 transacciones por mes y la agrupación por día se vuelve interminable.

### Componentes que tocaría

- `src/app/(tabs)/movements/page.tsx` — generalizar `groupByDay`, agregar `groupingMode` al estado y URL.
- `src/components/kane/MovementsFiltersBar.tsx` — agregar toggle de agrupación.
- Ningún cambio de schema ni de data layer.

---

## Alt 4 — Selección múltiple + acciones masivas

### Problema que resuelve

Casos puntuales pero costosos hoy:

- "Importé un Excel viejo y quedó todo en categoría 'Otros' — necesito mover 40 rows a 'Comida'."
- "Limpiar transacciones duplicadas tras un fallo del OCR."
- "Archivar todo el historial de pruebas antes de invitar a un amigo."

Hoy hay que hacer una row a la vez — long-press → archivar → undo si me equivoqué. **40 archives = 40 long-presses + 40 confirmaciones.**

### Diseño propuesto

Long-press cualquier row (gesto que **ya existe** y abre el `TransactionActionSheet`) gana una opción extra: **"Seleccionar varios"**.

Al tocarla:

1. Header reemplaza al `AppHeader`: "← N seleccionados" + tres botones a la derecha.
2. Cada row gana un checkbox a la izquierda. El long-press inicial queda preseleccionado.
3. Tap en cualquier otra row la añade/quita de la selección.
4. Tap en el header con `←` sale del modo selección.

Acciones masivas en el header del modo:

- **Archivar** — archive bulk con un solo undo toast ("40 movimientos archivados").
- **Cambiar categoría** → abre `CategoryFilterPicker` (single-select) y aplica a todos.
- **Cambiar cuenta** → abre `AccountFilterPicker` y aplica a todos.

### Por qué se difiere

1. **Frecuencia baja**: la mayoría de los users no van a usar selección múltiple jamás.
2. **Conflicto con long-press**: hoy long-press abre el action sheet directo. Hay que decidir: ¿reemplazar el action sheet con un menú que tenga "Seleccionar varios"?, ¿o usar un nuevo gesto (drag, double-tap)?
3. Necesita endpoint Supabase nuevo o un fan-out de N updates desde el cliente. Ambos son baratos pero hay que implementarlos.
4. UI del modo selección es **frágil de navegación**: si el user navega afuera y vuelve, ¿persiste? ¿reset? ¿popup de confirmación si tiene seleccionados al salir?

### Cuándo retomarlo

Cualquiera de estas señales:

- Un usuario pide explícitamente bulk delete o bulk re-categorizar.
- Decidimos implementar **importación CSV** (v1.5) — ahí selección múltiple y bulk recategorizar son acompañantes naturales del import.
- El OCR genera duplicados con frecuencia y los users se quejan.

### Componentes que tocaría

- `src/app/(tabs)/movements/page.tsx` — nuevo state `selectionMode` + `selectedIds: Set<string>`. Header swap. Row checkbox.
- `src/components/kane/TransactionActionSheet.tsx` — agregar opción "Seleccionar varios" arriba.
- `src/lib/data/transactions.ts` — `bulkArchive(ids: string[])` + `bulkPatch(ids: string[], patch: { categoryId?, accountId? })`.
- Migración? No — el patch usa `update` con `IN (...)` y RLS scope auto.

---

## Otros descartados (para tener un solo lugar donde mirar)

| Idea | Por qué descartado | Posible regreso |
|---|---|---|
| **Mini timeline horizontal** (dots por día con altura = monto) | Muy bonito, poco uso real, alto costo visual | Cuando agreguemos `/insights` v2 con diagrama temporal |
| **Heatmap calendar (estilo GitHub)** | Información ya está en `/insights`; duplicarla satura | Si los usuarios piden "en qué días gastas más" |
| **Quick-edit inline** (long-tap el monto, edita en sitio) | Riesgo de errores accidentales caros (perdió un cero) | Improbable — `/capture?edit=` con form completo es más seguro |
| **Export CSV / PDF** | AGENTS.md lo difiere a v1.5 | v1.5 — ya planeado |
| **Filtro por comercio (`merchantId`)** | El drill-down del donut ya cubre el caso práctico | Si Alt 3 se implementa, va con el modo "Por comercio" |
| **Sort options** (monto ↓, monto ↑) | "Por día DESC" cubre el 99% del caso de "qué fue lo último" | Si los users piden ordenar por monto repetidamente |
| **Filtros guardados como presets** ("Solo Servicios este mes") | URL sync ya permite bookmark del mismo set | Solo si los users guardan los mismos filtros 3+ veces por semana |

---

## Estado actual de los filtros (post-Alt 2)

Como referencia para el siguiente PR — esto **ya está vivo** en `/movements`:

- **4 chips**: Todo / Gastos / Ingresos / **Transferencias**
- **3 dropdown pills**: Período · Categoría · Cuenta (con X para limpiar)
- **3 KPI cards**: Ingresos · Gastos · Balance — recalculados al filtrar
- **URL sync**: `?filter=gastos&period=mes&categoryId=X&accountId=Y&from=ISO&to=ISO&categoryLabel=...&accountLabel=...`
- **Deep-link desde el drill-down**: `CategoryDrillDownSheet` linkea a `/movements?categoryId=<id>&period=mes&filter=gastos`
- **Server-side filter de fechas**: el rango se aplica en la query Supabase, no en memoria
- **Lazy-load de los 3 sheets**: solo se descargan cuando el user toca un pill

Lo que **no** cambió:
- Layout de las rows (avatar + título + subtítulo + monto).
- Long-press → `TransactionActionSheet` con Editar / Eliminar.
- Tap → `TransactionDetailDrawer`.
- Búsqueda de texto libre (compone con todos los filtros).
- Cursor pagination "Cargar más".
- Sonner undo de 5s al archivar.
