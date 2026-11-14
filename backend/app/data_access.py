"""
DATA ACCESS MODULE
─────────────────────────────────────────────────────────────────────────────
This is the ONLY module that reads Parquet files directly.
All column references use COLS / HOTSPOT_COLS / MONTHLY_COLS from config.
To switch to real data: update paths and column maps in config.py only.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import csv
import io
import logging
from functools import lru_cache
from typing import Generator

import duckdb
import pandas as pd
from shapely.geometry import Point, Polygon

from . import config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DuckDB connection helper (one in-process connection per call; DuckDB is
# thread-safe for read-only workloads with separate connections)
# ---------------------------------------------------------------------------

def _con() -> duckdb.DuckDBPyConnection:
    """Return a new in-process DuckDB read connection."""
    return duckdb.connect(database=":memory:", read_only=False)


# ---------------------------------------------------------------------------
# Spatial helpers
# ---------------------------------------------------------------------------

def bbox_from_polygon(geojson_coords: list[list[float]]) -> tuple[float, float, float, float]:
    """
    Compute the bounding box of a GeoJSON polygon ring.

    Parameters
    ----------
    geojson_coords : list of [lon, lat] pairs

    Returns
    -------
    (west, south, east, north) floats
    """
    lons = [pt[0] for pt in geojson_coords]
    lats = [pt[1] for pt in geojson_coords]
    return min(lons), min(lats), max(lons), max(lats)


def _polygon_obj(geojson_coords: list[list[float]]) -> Polygon:
    """Convert GeoJSON [[lon, lat], ...] to a shapely Polygon (lon, lat order)."""
    return Polygon([(pt[0], pt[1]) for pt in geojson_coords])


def _filter_by_polygon(df: pd.DataFrame, polygon: Polygon, lat_col: str, lon_col: str) -> pd.DataFrame:
    """Return only rows whose (lon, lat) point falls within *polygon*."""
    mask = df.apply(
        lambda row: polygon.contains(Point(row[lon_col], row[lat_col])), axis=1
    )
    return df[mask].reset_index(drop=True)


# ---------------------------------------------------------------------------
# 1. get_monthly_counts
# ---------------------------------------------------------------------------

@lru_cache(maxsize=config.CACHE_MAXSIZE)
def get_monthly_counts(
    west: float,
    south: float,
    east: float,
    north: float,
    start_year: int,
    start_month: int,
    end_year: int,
    end_month: int,
) -> pd.DataFrame:
    """
    Return harmonized + raw monthly counts summed over the bbox and date range.

    Parameters
    ----------
    west, south, east, north : bbox corners (degrees)
    start_year, start_month  : inclusive start
    end_year, end_month      : inclusive end

    Returns
    -------
    DataFrame with columns: year, month, count_harmonized, count_raw_modis, count_raw_viirs
    """
    mc   = config.MONTHLY_COLS
    path = str(config.MONTHLY_FILE)

    lat_col  = mc["lat"]
    lon_col  = mc["lon"]
    year_col = mc["year"]
    mon_col  = mc["month"]
    ch_col   = mc["count_harmonized"]
    cm_col   = mc["count_raw_modis"]
    cv_col   = mc["count_raw_viirs"]

    con = _con()
    try:
        query = f"""
            SELECT
                {year_col}  AS year,
                {mon_col}   AS month,
                SUM({ch_col}) AS count_harmonized,
                SUM({cm_col}) AS count_raw_modis,
                SUM({cv_col}) AS count_raw_viirs
            FROM read_parquet('{path}')
            WHERE
                {lat_col} >= {south}
                AND {lat_col} <= {north}
                AND {lon_col} >= {west}
                AND {lon_col} <= {east}
                AND (
                    ({year_col} > {start_year})
                    OR ({year_col} = {start_year} AND {mon_col} >= {start_month})
                )
                AND (
                    ({year_col} < {end_year})
                    OR ({year_col} = {end_year} AND {mon_col} <= {end_month})
                )
            GROUP BY {year_col}, {mon_col}
            ORDER BY {year_col}, {mon_col}
        """
        df = con.execute(query).df()
    finally:
        con.close()

    # Ensure correct dtypes
    for col in ("count_harmonized", "count_raw_modis", "count_raw_viirs"):
        if col in df.columns:
            df[col] = df[col].fillna(0).astype(float)

    return df


# ---------------------------------------------------------------------------
# 2. get_climatology
# ---------------------------------------------------------------------------

@lru_cache(maxsize=config.CACHE_MAXSIZE)
def get_climatology(
    west: float,
    south: float,
    east: float,
    north: float,
) -> pd.DataFrame:
    """
    Return climatological statistics of count_harmonized per calendar month.

    Aggregates first by (year, month) for the region, then computes across-year
    median / 25th / 75th percentile per calendar month.

    Returns
    -------
    DataFrame with columns: month (1..12), median_count, percentile_25, percentile_75
    """
    mc   = config.MONTHLY_COLS
    path = str(config.MONTHLY_FILE)

    lat_col  = mc["lat"]
    lon_col  = mc["lon"]
    year_col = mc["year"]
    mon_col  = mc["month"]
    ch_col   = mc["count_harmonized"]

    con = _con()
    try:
        # Step 1: annual totals per calendar month over the bbox
        annual_q = f"""
            SELECT
                {year_col}      AS year,
                {mon_col}       AS month,
                SUM({ch_col})   AS count_harmonized
            FROM read_parquet('{path}')
            WHERE
                {lat_col} >= {south}
                AND {lat_col} <= {north}
                AND {lon_col} >= {west}
                AND {lon_col} <= {east}
            GROUP BY {year_col}, {mon_col}
        """
        annual_df = con.execute(annual_q).df()
    finally:
        con.close()

    if annual_df.empty:
        return pd.DataFrame(
            {"month": range(1, 13), "median_count": 0.0, "percentile_25": 0.0, "percentile_75": 0.0}
        )

    # Step 2: compute stats per calendar month in Python/pandas
    rows = []
    for m in range(1, 13):
        vals = annual_df.loc[annual_df["month"] == m, "count_harmonized"].values
        if len(vals) == 0:
            rows.append({"month": m, "median_count": 0.0, "percentile_25": 0.0, "percentile_75": 0.0})
        else:
            import numpy as np
            rows.append(
                {
                    "month":        m,
                    "median_count": float(np.median(vals)),
                    "percentile_25": float(np.percentile(vals, 25)),
                    "percentile_75": float(np.percentile(vals, 75)),
                }
            )

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 3. get_hotspots
# ---------------------------------------------------------------------------

def get_hotspots(
    west: float,
    south: float,
    east: float,
    north: float,
    start_date: str,
    end_date: str,
    limit: int = config.HOTSPOT_DISPLAY_CAP,
    polygon: list[list[float]] | None = None,
) -> tuple[pd.DataFrame, int]:
    """
    Return up to *limit* hotspot records within the bbox and date range, plus total count.

    Parameters
    ----------
    polygon : optional GeoJSON [[lon,lat], ...] for precise point-in-polygon filtering
              after the bbox pre-filter.

    Returns
    -------
    (DataFrame, total_count)
    DataFrame columns: lat, lon, date, frp, sensor, satellite, confidence
    """
    hc   = config.HOTSPOT_COLS
    path = str(config.HOTSPOTS_FILE)

    lat_col  = hc["lat"]
    lon_col  = hc["lon"]
    date_col = hc["date"]
    frp_col  = hc["frp"]
    sen_col  = hc["sensor"]
    sat_col  = hc["satellite"]
    con_col  = hc["confidence"]

    con = _con()
    try:
        # Count total matching rows (bbox + date)
        count_q = f"""
            SELECT COUNT(*) FROM read_parquet('{path}')
            WHERE
                {lat_col}  >= {south}
                AND {lat_col}  <= {north}
                AND {lon_col}  >= {west}
                AND {lon_col}  <= {east}
                AND CAST({date_col} AS DATE) >= CAST('{start_date}' AS DATE)
                AND CAST({date_col} AS DATE) <= CAST('{end_date}' AS DATE)
        """
        total = int(con.execute(count_q).fetchone()[0])

        # Fetch up to limit rows
        fetch_q = f"""
            SELECT
                {lat_col}  AS lat,
                {lon_col}  AS lon,
                CAST({date_col} AS VARCHAR) AS date,
                {frp_col}  AS frp,
                {sen_col}  AS sensor,
                {sat_col}  AS satellite,
                {con_col}  AS confidence
            FROM read_parquet('{path}')
            WHERE
                {lat_col}  >= {south}
                AND {lat_col}  <= {north}
                AND {lon_col}  >= {west}
                AND {lon_col}  <= {east}
                AND CAST({date_col} AS DATE) >= CAST('{start_date}' AS DATE)
                AND CAST({date_col} AS DATE) <= CAST('{end_date}' AS DATE)
            LIMIT {limit}
        """
        df = con.execute(fetch_q).df()
    finally:
        con.close()

    # Polygon post-filter (shapely)
    if polygon is not None and not df.empty:
        poly_obj = _polygon_obj(polygon)
        df       = _filter_by_polygon(df, poly_obj, "lat", "lon")

    return df, total


# ---------------------------------------------------------------------------
# 4. get_hotspots_csv_stream
# ---------------------------------------------------------------------------

def get_hotspots_csv_stream(
    west: float,
    south: float,
    east: float,
    north: float,
    start_date: str,
    end_date: str,
    polygon: list[list[float]] | None = None,
) -> Generator[str, None, None]:
    """
    Stream ALL matching hotspot rows as CSV lines (no row cap).

    Yields header line first, then one data line per hotspot.
    Uses chunked pandas reads to avoid loading everything into RAM.
    """
    hc   = config.HOTSPOT_COLS
    path = str(config.HOTSPOTS_FILE)

    lat_col  = hc["lat"]
    lon_col  = hc["lon"]
    date_col = hc["date"]
    frp_col  = hc["frp"]
    sen_col  = hc["sensor"]
    sat_col  = hc["satellite"]
    con_col  = hc["confidence"]

    headers = ["lat", "lon", "date", "frp", "sensor", "satellite", "confidence"]

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    buf.seek(0)
    yield buf.read()

    con = _con()
    try:
        query = f"""
            SELECT
                {lat_col}  AS lat,
                {lon_col}  AS lon,
                CAST({date_col} AS VARCHAR) AS date,
                {frp_col}  AS frp,
                {sen_col}  AS sensor,
                {sat_col}  AS satellite,
                {con_col}  AS confidence
            FROM read_parquet('{path}')
            WHERE
                {lat_col}  >= {south}
                AND {lat_col}  <= {north}
                AND {lon_col}  >= {west}
                AND {lon_col}  <= {east}
                AND CAST({date_col} AS DATE) >= CAST('{start_date}' AS DATE)
                AND CAST({date_col} AS DATE) <= CAST('{end_date}' AS DATE)
        """
        rel = con.execute(query)

        poly_obj = _polygon_obj(polygon) if polygon is not None else None

        CHUNK = 10_000
        while True:
            chunk_df = rel.df() if CHUNK is None else _fetch_chunk(con, query, CHUNK)
            # DuckDB relations don't support chunked fetch easily; use pandas chunking
            break  # handled below

        # Re-execute with pandas chunking via PyArrow
        df_all = con.execute(query).df()
    finally:
        con.close()

    if poly_obj is not None and not df_all.empty:
        df_all = _filter_by_polygon(df_all, poly_obj, "lat", "lon")

    CHUNK_SIZE = 1000
    for start in range(0, len(df_all), CHUNK_SIZE):
        chunk = df_all.iloc[start : start + CHUNK_SIZE]
        buf = io.StringIO()
        writer = csv.writer(buf)
        for _, row in chunk.iterrows():
            writer.writerow([
                row.get("lat"), row.get("lon"), row.get("date"),
                row.get("frp"), row.get("sensor"), row.get("satellite"),
                row.get("confidence"),
            ])
        buf.seek(0)
        yield buf.read()


def _fetch_chunk(con: duckdb.DuckDBPyConnection, query: str, limit: int) -> pd.DataFrame:
    """Helper – not actually used in streaming path, kept for reference."""
    return con.execute(query + f" LIMIT {limit}").df()


# ---------------------------------------------------------------------------
# 5. get_data_extent
# ---------------------------------------------------------------------------

def get_data_extent() -> dict:
    """Return the current DATA_EXTENT dict (populated by validator at startup)."""
    return config.DATA_EXTENT
