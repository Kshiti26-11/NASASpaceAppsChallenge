# CONFIGURATION - Change data paths and column mappings here when switching to real data.
# Never hard-code column names anywhere else in the codebase.

import os
from pathlib import Path

# ── Data directory resolution ──────────────────────────────────────────────────
# Resolves data folder in order:
# 1. Environment variable DATA_DIR
# 2. backend/data (Vercel serverless bundle deployment)
# 3. ../data (Local monorepo root)
_env_data = os.environ.get("DATA_DIR")
if _env_data and Path(_env_data).is_dir():
    DATA_DIR = Path(_env_data)
else:
    _backend_dir = Path(__file__).resolve().parents[1]
    _root_dir    = Path(__file__).resolve().parents[2]
    if (_backend_dir / "data" / "hotspots_harmonized.parquet").exists():
        DATA_DIR = _backend_dir / "data"
    elif (_root_dir / "data" / "hotspots_harmonized.parquet").exists():
        DATA_DIR = _root_dir / "data"
    elif (_backend_dir / "data").is_dir():
        DATA_DIR = _backend_dir / "data"
    else:
        DATA_DIR = _root_dir / "data"

# ── File paths ─────────────────────────────────────────────────────────────────
# DATA NOTE: Change these paths to point to real Parquet files from the teammate's pipeline.
HOTSPOTS_FILE = DATA_DIR / "hotspots_harmonized.parquet"
MONTHLY_FILE  = DATA_DIR / "monthly_grid_counts.parquet"

# ── Column mapping for hotspots_harmonized.parquet ────────────────────────────
# DATA NOTE: If teammate renames columns, update ONLY this dict.
HOTSPOT_COLS = {
    "date":       "date",        # YYYY-MM-DD string or date
    "lat":        "latitude",
    "lon":        "longitude",
    "sensor":     "sensor",      # "MODIS" | "VIIRS"
    "satellite":  "satellite",   # e.g. "Aqua", "Terra", "Suomi NPP"
    "frp":        "frp",         # Fire Radiative Power (MW)
    "confidence": "confidence",  # string or numeric
    "weight":     "weight",      # harmonization weight
}

# ── Column mapping for monthly_grid_counts.parquet ────────────────────────────
# DATA NOTE: If teammate renames columns, update ONLY this dict.
MONTHLY_COLS = {
    "year":              "year",
    "month":             "month",
    "lat":               "lat",           # grid cell centre latitude
    "lon":               "lon",           # grid cell centre longitude
    "count_harmonized":  "count_harmonized",
    "count_raw_modis":   "count_raw_modis",
    "count_raw_viirs":   "count_raw_viirs",
}

# Alias used throughout the codebase for the primary count column
COLS = MONTHLY_COLS  # convenience alias

# ── Spatial / map settings ────────────────────────────────────────────────────
GRID_SIZE_DEG: float = 0.25          # grid cell size in degrees (matches File B)
DEFAULT_MAP_CENTER = [22.3, 71.5]    # Gujarat, India [lat, lon]
DEFAULT_MAP_ZOOM   = 7

# ── Data extent (overridden at startup by validator) ─────────────────────────
# These are updated by validator.py after reading the actual data.
DATA_EXTENT: dict = {
    "min_year": 2001,
    "max_year": 2024,
    "bbox": {"west": 68.0, "south": 20.0, "east": 75.0, "north": 25.0},
}

# ── API settings ──────────────────────────────────────────────────────────────
HOTSPOT_DISPLAY_CAP: int = 5_000     # max hotspot points sent to browser
CACHE_MAXSIZE:       int = 128       # LRU cache size for repeated identical queries

# ── Method note (shown in /api/meta and About page) ──────────────────────────
METHOD_NOTE = (
    "Harmonized counts use a cross-sensor scaling factor derived from the "
    "2012-present MODIS/VIIRS overlap period. Raw MODIS and VIIRS counts are "
    "provided for transparency. Scale factors may vary by region and season. "
    "METHOD DETAIL: to be filled from teammate's method note."
)
