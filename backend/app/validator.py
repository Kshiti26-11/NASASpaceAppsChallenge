"""
Validator module – run once at startup to validate both Parquet files and
update config.DATA_EXTENT with real extents from the data.

Uses DuckDB for efficient on-disk queries without loading full files into RAM.
"""

from __future__ import annotations

import logging
from pathlib import Path

import duckdb

from . import config

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _connect() -> duckdb.DuckDBPyConnection:
    """Return a fresh in-process DuckDB connection."""
    return duckdb.connect(database=":memory:")


def _check_file_exists(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(
            f"Required data file not found: {path}\n"
            f"Run scripts/generate_mock_data.py to generate mock data, "
            f"or update HOTSPOTS_FILE / MONTHLY_FILE in backend/app/config.py."
        )


def _check_columns(
    con: duckdb.DuckDBPyConnection,
    parquet_path: Path,
    required_col_values: list[str],
    friendly_name: str,
) -> None:
    """Raise ValueError if any required column is missing from the parquet file."""
    result = con.execute(
        f"SELECT column_name FROM parquet_schema('{parquet_path}')"
    ).fetchall()
    actual_cols = {row[0] for row in result}
    missing = [c for c in required_col_values if c not in actual_cols]
    if missing:
        raise ValueError(
            f"{friendly_name} ({parquet_path.name}) is missing required columns: "
            f"{missing}.\n"
            f"Actual columns found: {sorted(actual_cols)}.\n"
            f"Update the column mapping in backend/app/config.py to match."
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_and_update_extent() -> None:
    """
    Validate both Parquet files and update config.DATA_EXTENT in-place.

    Raises
    ------
    FileNotFoundError
        If either Parquet file is absent.
    ValueError
        If required columns are missing or values are out of valid ranges.
    """
    hotspots_path = config.HOTSPOTS_FILE
    monthly_path  = config.MONTHLY_FILE

    # ── 1. File existence ──────────────────────────────────────────────────
    _check_file_exists(hotspots_path)
    _check_file_exists(monthly_path)

    con = _connect()

    # ── 2. Required column checks ─────────────────────────────────────────
    _check_columns(
        con,
        hotspots_path,
        list(config.HOTSPOT_COLS.values()),
        "Hotspots file",
    )
    _check_columns(
        con,
        monthly_path,
        list(config.MONTHLY_COLS.values()),
        "Monthly grid file",
    )

    hc = config.HOTSPOT_COLS
    mc = config.MONTHLY_COLS

    # ── 3. Hotspots value-range checks ────────────────────────────────────
    _validate_hotspot_ranges(con, hotspots_path, hc)

    # ── 4. Monthly grid value-range checks ───────────────────────────────
    _validate_monthly_ranges(con, monthly_path, mc)

    # ── 5. Date column parseability ───────────────────────────────────────
    _validate_date_column(con, hotspots_path, hc["date"])

    # ── 6. Compute and update DATA_EXTENT ────────────────────────────────
    _update_data_extent(con, monthly_path, hotspots_path, mc, hc)

    con.close()
    logger.info(
        "Validation passed. DATA_EXTENT updated: %s", config.DATA_EXTENT
    )


def _validate_hotspot_ranges(
    con: duckdb.DuckDBPyConnection,
    path: Path,
    hc: dict,
) -> None:
    lat_col = hc["lat"]
    lon_col = hc["lon"]

    bad_lat = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{path}') "
        f"WHERE {lat_col} < -90 OR {lat_col} > 90"
    ).fetchone()[0]
    if bad_lat > 0:
        raise ValueError(
            f"Hotspots file: {bad_lat} rows have {lat_col} outside [-90, 90]."
        )

    bad_lon = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{path}') "
        f"WHERE {lon_col} < -180 OR {lon_col} > 180"
    ).fetchone()[0]
    if bad_lon > 0:
        raise ValueError(
            f"Hotspots file: {bad_lon} rows have {lon_col} outside [-180, 180]."
        )

    frp_col = hc["frp"]
    bad_frp = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{path}') "
        f"WHERE {frp_col} IS NOT NULL AND {frp_col} < 0"
    ).fetchone()[0]
    if bad_frp > 0:
        raise ValueError(
            f"Hotspots file: {bad_frp} rows have negative {frp_col} values."
        )


def _validate_monthly_ranges(
    con: duckdb.DuckDBPyConnection,
    path: Path,
    mc: dict,
) -> None:
    lat_col   = mc["lat"]
    lon_col   = mc["lon"]
    month_col = mc["month"]
    count_cols = [mc["count_harmonized"], mc["count_raw_modis"], mc["count_raw_viirs"]]

    bad_lat = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{path}') "
        f"WHERE {lat_col} < -90 OR {lat_col} > 90"
    ).fetchone()[0]
    if bad_lat > 0:
        raise ValueError(
            f"Monthly grid file: {bad_lat} rows have {lat_col} outside [-90, 90]."
        )

    bad_lon = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{path}') "
        f"WHERE {lon_col} < -180 OR {lon_col} > 180"
    ).fetchone()[0]
    if bad_lon > 0:
        raise ValueError(
            f"Monthly grid file: {bad_lon} rows have {lon_col} outside [-180, 180]."
        )

    bad_month = con.execute(
        f"SELECT COUNT(*) FROM read_parquet('{path}') "
        f"WHERE {month_col} < 1 OR {month_col} > 12"
    ).fetchone()[0]
    if bad_month > 0:
        raise ValueError(
            f"Monthly grid file: {bad_month} rows have {month_col} outside [1, 12]."
        )

    for col in count_cols:
        bad_count = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{path}') "
            f"WHERE {col} IS NOT NULL AND {col} < 0"
        ).fetchone()[0]
        if bad_count > 0:
            raise ValueError(
                f"Monthly grid file: {bad_count} rows have negative values in column '{col}'."
            )


def _validate_date_column(
    con: duckdb.DuckDBPyConnection,
    path: Path,
    date_col: str,
) -> None:
    """Check that the date column in hotspots can be cast to DATE."""
    try:
        bad = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{path}') "
            f"WHERE TRY_CAST({date_col} AS DATE) IS NULL AND {date_col} IS NOT NULL"
        ).fetchone()[0]
        if bad > 0:
            raise ValueError(
                f"Hotspots file: {bad} rows have unparseable date values in '{date_col}'. "
                f"Expected YYYY-MM-DD format."
            )
    except duckdb.CatalogException as exc:
        raise ValueError(
            f"Hotspots file: could not query date column '{date_col}': {exc}"
        ) from exc


def _update_data_extent(
    con: duckdb.DuckDBPyConnection,
    monthly_path: Path,
    hotspots_path: Path,
    mc: dict,
    hc: dict,
) -> None:
    """Compute actual extents from the data and update config.DATA_EXTENT."""
    year_col = mc["year"]
    lat_col  = mc["lat"]
    lon_col  = mc["lon"]

    row = con.execute(
        f"SELECT MIN({year_col}), MAX({year_col}), "
        f"MIN({lat_col}), MAX({lat_col}), "
        f"MIN({lon_col}), MAX({lon_col}) "
        f"FROM read_parquet('{monthly_path}')"
    ).fetchone()

    min_year, max_year = int(row[0]), int(row[1])
    min_lat,  max_lat  = float(row[2]), float(row[3])
    min_lon,  max_lon  = float(row[4]), float(row[5])

    # Expand bbox by half a grid cell so edges are inclusive
    half = config.GRID_SIZE_DEG / 2.0

    config.DATA_EXTENT = {
        "min_year": min_year,
        "max_year": max_year,
        "bbox": {
            "west":  round(min_lon - half, 6),
            "south": round(min_lat - half, 6),
            "east":  round(max_lon + half, 6),
            "north": round(max_lat + half, 6),
        },
    }
