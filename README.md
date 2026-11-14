# Harmonized Burning Activity Calendar

A web application for exploring NASA FIRMS active-fire hotspots harmonized across MODIS (2000s+) and VIIRS (2012+) sensors. Built for the NASA Space Apps–style hackathon challenge.

---

## Table of Contents
1. [Quick Start](#quick-start)
2. [Project Structure](#project-structure)
3. [Generating Mock Data](#generating-mock-data)
4. [Running the Backend](#running-the-backend)
5. [Running the Frontend](#running-the-frontend)
6. [Plugging in Real Data](#plugging-in-real-data)
7. [API Reference](#api-reference)
8. [Configuration](#configuration)
9. [Running Tests](#running-tests)
10. [Architecture Notes](#architecture-notes)

---

## Quick Start

### Prerequisites
- Python 3.11+ (with pip)
- Node.js 20+ (with npm or pnpm)

### 1. Clone / navigate to the project

```bash
cd fire-calendar
```

### 2. Generate mock data

```bash
# Install only the data-generation dependencies
pip install pandas numpy pyarrow

# Generate realistic mock Parquet files
python scripts/generate_mock_data.py
# Output: data/hotspots_harmonized.parquet  (~50 K rows)
#         data/monthly_grid_counts.parquet  (~9 K rows)
```

### 3. Start the backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API is now available at **http://localhost:8000**  
Swagger docs: **http://localhost:8000/docs**

### 4. Start the frontend

```bash
cd frontend

# Install dependencies
npm install
# or: pnpm install

# Start the dev server
npm run dev
# or: pnpm dev
```

Open **http://localhost:5173** in your browser.

---

## Project Structure

```
fire-calendar/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI app, startup, CORS
│   │   ├── config.py         # ★ ALL paths and column names live here
│   │   ├── data_access.py    # ★ ONLY module that reads Parquet
│   │   ├── validator.py      # Startup data validation
│   │   └── routes/
│   │       ├── meta.py
│   │       ├── calendar.py
│   │       ├── anomaly.py
│   │       ├── summary.py
│   │       ├── timeseries.py
│   │       └── hotspots.py
│   ├── tests/
│   │   ├── test_data_access.py
│   │   └── test_routes.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/              # Axios client + TypeScript types
│   │   ├── components/
│   │   │   ├── controls/     # Sidebar: bbox inputs, date pickers, draw
│   │   │   ├── map/          # Leaflet map + draw control
│   │   │   ├── charts/       # Plotly: calendar, anomaly, timeseries, seasonality
│   │   │   ├── cards/        # Summary stat cards
│   │   │   └── shared/       # Spinner, error, empty state, legend
│   │   ├── context/          # ThemeContext
│   │   ├── hooks/            # useMeta, useAnalysis
│   │   ├── pages/            # AnalysisPage, AboutPage
│   │   ├── styles/           # global.css
│   │   └── utils/            # colorscales, geo, format helpers
│   ├── package.json
│   └── vite.config.ts
├── data/                     # Parquet files go here (git-ignored)
│   ├── hotspots_harmonized.parquet
│   └── monthly_grid_counts.parquet
├── scripts/
│   └── generate_mock_data.py
├── docker-compose.yml        # Optional
└── README.md
```

---

## Generating Mock Data

```bash
# Default output to ./data/
python scripts/generate_mock_data.py

# Custom output directory
python scripts/generate_mock_data.py --output-dir /path/to/data
```

The script produces:

| File | Rows (approx.) | Period | Region |
|------|---------------|--------|--------|
| `hotspots_harmonized.parquet` | ~50 000 | 2001–2024 | Gujarat + surroundings |
| `monthly_grid_counts.parquet` | ~9 000 | 2001–2024 | Gujarat + surroundings |

Seasonal pattern: peak in March–May (pre-monsoon), secondary peak October–November.  
Extreme years: 2002, 2016, 2023 have ~1.5–2× counts.

---

## Running the Backend

```bash
cd backend
# (activate venv first)

# Development with auto-reload
uvicorn app.main:app --reload --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

The validator runs at startup and prints a clear error if data files are missing or malformed.

---

## Running the Frontend

```bash
cd frontend
npm run dev      # dev server on :5173
npm run build    # production build → dist/
npm run preview  # serve the built dist/
```

The Vite dev server proxies `/api/*` to `http://localhost:8000`, so no CORS issues during development.

---

## Plugging in Real Data

> **This is the ONLY change needed to switch from mock data to real data.**

### Step-by-step

1. **Drop the real Parquet files** into the `data/` directory:
   ```
   data/hotspots_harmonized.parquet
   data/monthly_grid_counts.parquet
   ```

2. **Open `backend/app/config.py`** — this is the only file you need to edit.

3. **Update the file paths** (if filenames differ):
   ```python
   HOTSPOTS_FILE = DATA_DIR / "your_actual_hotspots_file.parquet"
   MONTHLY_FILE  = DATA_DIR / "your_actual_monthly_file.parquet"
   ```

4. **Update the column maps** (if teammate used different column names):
   ```python
   HOTSPOT_COLS = {
       "date":       "actual_date_column_name",
       "lat":        "actual_lat_column_name",
       # ... etc
   }

   MONTHLY_COLS = {
       "year":             "actual_year_column_name",
       "count_harmonized": "actual_harmonized_count_column",
       # ... etc
   }
   ```

5. **Run the validator** to confirm the schema is correct:
   ```bash
   cd backend
   python -c "from app.validator import validate_all; validate_all()"
   ```
   The validator will print a clear message if any column is missing or out of range.

6. **Restart the backend** — the app reads live data, no rebuild needed.

### Column requirements

#### `hotspots_harmonized.parquet`
| Logical name | Default column | Type | Constraints |
|---|---|---|---|
| date | `date` | string YYYY-MM-DD | parseable |
| lat | `latitude` | float | −90 to 90 |
| lon | `longitude` | float | −180 to 180 |
| sensor | `sensor` | string | MODIS or VIIRS |
| satellite | `satellite` | string | — |
| frp | `frp` | float | ≥ 0 |
| confidence | `confidence` | string/int | — |
| weight | `weight` | float | ≥ 0 |

#### `monthly_grid_counts.parquet`
| Logical name | Default column | Type | Constraints |
|---|---|---|---|
| year | `year` | int | 2000–present |
| month | `month` | int | 1–12 |
| lat | `lat` | float | −90 to 90 |
| lon | `lon` | float | −180 to 180 |
| count_harmonized | `count_harmonized` | float/int | ≥ 0 |
| count_raw_modis | `count_raw_modis` | float/int | ≥ 0 |
| count_raw_viirs | `count_raw_viirs` | float/int | ≥ 0 |

---

## API Reference

All POST endpoints accept JSON with a `region` field:

```json
// Option A: bounding box
{ "region": { "bbox": { "west": 68.0, "south": 20.0, "east": 75.0, "north": 25.0 } } }

// Option B: GeoJSON polygon (lon,lat order)
{ "region": { "polygon": [[68,20],[75,20],[75,25],[68,25],[68,20]] } }
```

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/api/meta` | — | `{min_year, max_year, bbox, grid_size_deg, method_note}` |
| POST | `/api/calendar` | `region + start_date + end_date` | `[{year, month, count}]` |
| POST | `/api/anomaly` | `region + year + month` | `{year, month, current, median, anomaly_abs, anomaly_pct, percentile_rank, historical}` |
| POST | `/api/summary` | `region + start_date + end_date` | `{total_fires, peak_month, peak_year, peak_year_count, avg_per_year, trend_slope}` |
| POST | `/api/timeseries` | `region + start_date + end_date` | `[{date, count_harmonized, count_raw_modis, count_raw_viirs}]` |
| POST | `/api/hotspots` | `region + start_date + end_date` | `{points:[...], truncated, total_in_region}` |
| POST | `/api/hotspots-csv` | `region + start_date + end_date` | Streamed CSV download |

---

## Configuration

All tunable parameters live in `backend/app/config.py`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `HOTSPOTS_FILE` | `data/hotspots_harmonized.parquet` | Path to File A |
| `MONTHLY_FILE` | `data/monthly_grid_counts.parquet` | Path to File B |
| `HOTSPOT_COLS` | see file | Column name mapping for File A |
| `MONTHLY_COLS` | see file | Column name mapping for File B |
| `GRID_SIZE_DEG` | 0.25 | Grid cell size in degrees |
| `DEFAULT_MAP_CENTER` | [22.3, 71.5] | Gujarat, India |
| `DEFAULT_MAP_ZOOM` | 7 | — |
| `HOTSPOT_DISPLAY_CAP` | 5000 | Max points sent to browser |
| `CACHE_MAXSIZE` | 128 | LRU cache entries |

---

## Running Tests

```bash
cd backend
pytest tests/ -v
```

Tests cover:
- `data_access.py`: count aggregation, climatology median, bbox/polygon filtering, truncation cap
- Route shapes: all API endpoints return the expected JSON structure

---

## Architecture Notes

### Why DuckDB?
DuckDB reads Parquet files in-process without a database server. It column-prunes automatically and pushes `WHERE` filters into the scan. For typical regional queries this is fast enough for interactive use.

### Why no rescaling in the app?
The harmonized `count_harmonized` values in `monthly_grid_counts.parquet` are pre-computed by the data pipeline. The app treats them as ground truth and never applies additional scaling. The raw counts (`count_raw_modis`, `count_raw_viirs`) are shown only for transparency/education.

### Data flow
```
Parquet files → DuckDB scan → data_access.py functions → FastAPI routes → JSON/CSV → React frontend
                                       ↑
                              lru_cache here
```

### Coord order
- Leaflet: `[lat, lon]`
- GeoJSON (API input / output): `[lon, lat]`
- Internal Python / pandas / DuckDB: separate `lat`, `lon` columns

### Adding real data
See [Plugging in Real Data](#plugging-in-real-data). **No Python code changes needed** — only `config.py`.

---

## Optional: Docker

```bash
docker-compose up --build
# Backend:  http://localhost:8000
# Frontend: http://localhost:5173
```

See `docker-compose.yml` for configuration.
