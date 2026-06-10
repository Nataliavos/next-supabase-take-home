# Medallo Take Home

Next.js app with local [Supabase](https://supabase.com) development via Docker.

## Submission

Coffee health dataset loaded into `coffee_health_records` and exposed as a filterable, paginated table at [http://localhost:3000](http://localhost:3000) (Server Component + URL-driven filters: country, gender, sleep quality, stress level, age/BMI/coffee intake ranges).

**Run locally** (first time: `pnpm install` and `pnpm setup:env` to write `.env.local`):

```bash
pnpx supabase db reset   # migrations + seed.sql (notes table)
pnpm import:coffee       # loads 10,000 rows (idempotent upsert)
pnpm dev                 # Supabase + Next.js → http://localhost:3000
```

**Documentation:**

- [Database design & ingestion](docs/database-design.md) — schema, import pipeline, idempotency
- [Architecture decisions](docs/architecture-decisions.md) — filtering, pagination, scale trade-offs

---

## Setup (English)

### System requirements

Install the following before working on this repository:

| Requirement | Version | Install |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | 24 or later | [nodejs.org/en/download](https://nodejs.org/en/download) |
| [Docker](https://www.docker.com/) | Latest stable | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| [pnpm](https://pnpm.io/) | 10 or later | [pnpm.io/installation](https://pnpm.io/installation) |

Docker must be running before you start the development server. Supabase runs locally in Docker containers.

Verify your versions:

```bash
node --version   # v24.x or later
docker --version
pnpm --version   # 10.x or later
```

### Installation

1. Clone the repository and enter the project directory:

   ```bash
   git clone <repository-url>
   cd take-home
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables by running the setup script:

   ```bash
   pnpm setup:env
   ```

   This starts local Supabase, reads credentials from `supabase status -o env`, and writes them to `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SECRET_KEY=
   ```

   `.env.local` is gitignored and is the file Next.js loads at development time. Do not commit secrets.

   To configure manually instead, copy `.env.example` to `.env.local` and fill in the values yourself.

### Running the app

Start Supabase and the Next.js dev server together:

```bash
pnpm dev
```

This runs `supabase start` and `next dev` concurrently. Open [http://localhost:3000](http://localhost:3000) once both services are ready.

To run services separately:

```bash
pnpm dev:supabase   # Start local Supabase (Docker)
pnpm dev:next       # Start Next.js only
```

### Other commands

```bash
pnpm setup:env   # Start Supabase and write .env.local
pnpm build      # Production build
pnpm start      # Run production server
pnpm lint       # Run ESLint
pnpm test       # Run tests in watch mode
pnpm test:run   # Run tests once
```

---

## Exercise (English)

After completing setup, build a feature that loads the coffee health dataset into Supabase and displays it in a filterable table in the Next.js app.

### Dataset

The file `data/synthetic_coffee_health_10000.csv` contains **10,000 rows** of synthetic health and coffee consumption data. Each row has these columns:

| Column | Type |
| --- | --- |
| `ID` | integer |
| `Age` | integer |
| `Gender` | text |
| `Country` | text |
| `Coffee_Intake` | decimal |
| `Caffeine_mg` | decimal |
| `Sleep_Hours` | decimal |
| `Sleep_Quality` | text |
| `BMI` | decimal |
| `Heart_Rate` | integer |
| `Stress_Level` | text |
| `Physical_Activity_Hours` | decimal |
| `Health_Issues` | text |
| `Occupation` | text |
| `Smoking` | integer (0 or 1) |
| `Alcohol_Consumption` | integer (0 or 1) |

### Part 1 — Load the data into Supabase

1. Design a Postgres table (or tables) that stores this dataset. Add a migration under `supabase/migrations/` and/or a schema file under `supabase/schemas/`.
2. Load all 10,000 rows from the CSV into your local database. You may use any reasonable approach — for example, a seed script, a one-off loader script, or Postgres `COPY`.
3. Apply your changes locally:

   ```bash
   pnpx supabase db reset   # runs migrations and seed.sql
   ```

   Or run only the steps you need (`supabase migration up`, custom import script, etc.).

4. Verify the row count in the database matches the CSV (10,000 rows).

The starter project includes a sample `notes` table and Supabase client helpers in `lib/supabase/`. You can keep, replace, or extend these as you see fit.

### Part 2 — Render a filterable table in Next.js

Build a page in the Next.js app that displays the loaded data in a table and lets the user filter it.

At minimum, support filtering on a few meaningful columns — for example, country, gender, sleep quality, stress level, or numeric ranges (age, coffee intake, BMI). You decide which filters are most useful and how they should behave (exact match, multi-select, min/max, etc.).

UI components are available in `components/ui/` (including `table`, `input`, `button`, and others). Use them or replace them with your own.

### Part 3 — Think about scale

10,000 rows is small for Postgres but large enough to expose naive UI and query patterns. **Design with scale in mind** — assume the dataset could grow to hundreds of thousands or millions of rows.

Document any trade-offs or assumptions in your submission. We are interested in how you reason about performance, not in one specific library choice.

### Using AI

AI-assisted development is welcome. You may use coding assistants, chatbots, or other AI tools while working on this exercise.

During review, we will assume you understand your submission and can explain your approach — why you made certain choices, how the solution works, and what trade-offs you considered. Use AI however helps you, but make sure you could walk us through the code without it.

### What to deliver

- Working local setup: data loaded, table visible at [http://localhost:3000](http://localhost:3000) (or a route you add).
- Brief notes on your schema, import approach, filtering strategy, and scale decisions.

---

## Configuración (Español)

### Requisitos del sistema

Instala lo siguiente antes de trabajar en este repositorio:

| Requisito | Versión | Instalación |
| --- | --- | --- |
| [Node.js](https://nodejs.org/) | 24 o superior | [nodejs.org/en/download](https://nodejs.org/en/download) |
| [Docker](https://www.docker.com/) | Última versión estable | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |
| [pnpm](https://pnpm.io/) | 10 o superior | [pnpm.io/installation](https://pnpm.io/installation) |

Docker debe estar en ejecución antes de iniciar el servidor de desarrollo. Supabase se ejecuta localmente en contenedores Docker.

Verifica tus versiones:

```bash
node --version   # v24.x o superior
docker --version
pnpm --version   # 10.x o superior
```

### Instalación

1. Clona el repositorio y entra al directorio del proyecto:

   ```bash
   git clone <url-del-repositorio>
   cd take-home
   ```

2. Instala las dependencias:

   ```bash
   pnpm install
   ```

3. Configura las variables de entorno ejecutando el script de configuración:

   ```bash
   pnpm setup:env
   ```

   Esto inicia Supabase localmente, lee las credenciales de `supabase status -o env` y las escribe en `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SECRET_KEY=
   ```

   `.env.local` está en `.gitignore` y es el archivo que Next.js carga en desarrollo. No subas secretos al repositorio.

   Para configurar manualmente, copia `.env.example` a `.env.local` y completa los valores tú mismo.

### Ejecutar la aplicación

Inicia Supabase y el servidor de desarrollo de Next.js juntos:

```bash
pnpm dev
```

Esto ejecuta `supabase start` y `next dev` en paralelo. Abre [http://localhost:3000](http://localhost:3000) cuando ambos servicios estén listos.

Para ejecutar los servicios por separado:

```bash
pnpm dev:supabase   # Iniciar Supabase local (Docker)
pnpm dev:next       # Iniciar solo Next.js
```

### Otros comandos

```bash
pnpm setup:env   # Iniciar Supabase y escribir .env.local
pnpm build      # Compilación de producción
pnpm start      # Servidor de producción
pnpm lint       # Ejecutar ESLint
pnpm test       # Ejecutar pruebas en modo watch
pnpm test:run   # Ejecutar pruebas una vez
```

---

## Ejercicio (Español)

Después de completar la configuración, construye una funcionalidad que cargue el conjunto de datos de salud y café en Supabase y lo muestre en una tabla con filtros en la aplicación Next.js.

### Conjunto de datos

El archivo `data/synthetic_coffee_health_10000.csv` contiene **10,000 filas** de datos sintéticos sobre salud y consumo de café. Cada fila tiene estas columnas:

| Columna | Tipo |
| --- | --- |
| `ID` | entero |
| `Age` | entero |
| `Gender` | texto |
| `Country` | texto |
| `Coffee_Intake` | decimal |
| `Caffeine_mg` | decimal |
| `Sleep_Hours` | decimal |
| `Sleep_Quality` | texto |
| `BMI` | decimal |
| `Heart_Rate` | entero |
| `Stress_Level` | texto |
| `Physical_Activity_Hours` | decimal |
| `Health_Issues` | texto |
| `Occupation` | texto |
| `Smoking` | entero (0 o 1) |
| `Alcohol_Consumption` | entero (0 o 1) |

### Parte 1 — Cargar los datos en Supabase

1. Diseña una tabla (o tablas) en Postgres para almacenar este conjunto de datos. Añade una migración en `supabase/migrations/` y/o un archivo de esquema en `supabase/schemas/`.
2. Carga las 10,000 filas del CSV en tu base de datos local. Puedes usar cualquier enfoque razonable — por ejemplo, un script de seed, un script de carga puntual o `COPY` de Postgres.
3. Aplica los cambios localmente:

   ```bash
   pnpx supabase db reset   # ejecuta migraciones y seed.sql
   ```

   O ejecuta solo los pasos que necesites (`supabase migration up`, script de importación personalizado, etc.).

4. Verifica que el conteo de filas en la base de datos coincida con el CSV (10,000 filas).

El proyecto inicial incluye una tabla de ejemplo `notes` y helpers de cliente Supabase en `lib/supabase/`. Puedes conservarlos, reemplazarlos o extenderlos según prefieras.

### Parte 2 — Mostrar una tabla con filtros en Next.js

Construye una página en la aplicación Next.js que muestre los datos cargados en una tabla y permita filtrarlos.

Como mínimo, implementa filtros sobre algunas columnas relevantes — por ejemplo, país, género, calidad del sueño, nivel de estrés o rangos numéricos (edad, consumo de café, IMC). Tú decides qué filtros son más útiles y cómo deben comportarse (coincidencia exacta, selección múltiple, mínimo/máximo, etc.).

Hay componentes de UI disponibles en `components/ui/` (incluidos `table`, `input`, `button` y otros). Úsalos o reemplázalos por los tuyos.

### Parte 3 — Piensa en la escala

10,000 filas es poco para Postgres, pero suficiente para exponer patrones ingenuos en la UI y en las consultas. **Diseña pensando en la escala** — asume que el conjunto de datos podría crecer a cientos de miles o millones de filas.

Documenta cualquier compromiso o supuesto en tu entrega. Nos interesa cómo razonas sobre el rendimiento, no una biblioteca concreta.

### Uso de IA

El desarrollo asistido por IA es bienvenido. Puedes usar asistentes de código, chatbots u otras herramientas de IA mientras trabajas en este ejercicio.

Durante la revisión, asumiremos que entiendes tu entrega y que puedes explicar tu enfoque — por qué tomaste ciertas decisiones, cómo funciona la solución y qué compromisos consideraste. Usa la IA como te ayude, pero asegúrate de que podrías repasar el código con nosotros sin depender de ella.

### Qué entregar

- Configuración local funcional: datos cargados, tabla visible en [http://localhost:3000](http://localhost:3000) (o en una ruta que añadas).
- Notas breves sobre tu esquema, enfoque de importación, estrategia de filtrado y decisiones de escala.
