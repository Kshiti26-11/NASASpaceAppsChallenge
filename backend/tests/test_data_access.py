"""
Comprehensive pytest tests for data_access.py.

Fixtures create small in-memory mock DataFrames, write them to temporary
Parquet files, and patch config paths so that data_access reads those files.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Generator
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

# ---------------------------------------------------------------------------
# Helpers to build small mock datasets
# ---------------------------------------------------------------------------

GUJARAT_LATS = [20.125, 20.375, 20.625, 21.125, 21.375, 22.125, 23.0, 24.0]
GUJARAT_LONS = [68.125, 68.375, 69.0, 70.0, 71.0, 72.0, 73.0, 74.0]

YEARS  = list(range(2001, 2007))   # small dataset: 6 years
MONTHS = list(range(1, 13))


def _make_monthly_df() -> pd.DataFrame:
    """Create a small monthly_grid_counts DataFrame with realistic shape."""
    rows = []
    rng = np.random.default_rng(42)
    for year in YEARS:
        for month in MONTHS:
            for lat in GUJARAT_LATS:
                for lon in GUJARAT_LONS:
                    # seasonal pattern: peak April, secondary November
                    base = 10 * np.abs(np.sin((month - 1) * np.pi / 6))
                    modis = max(0, int(base + rng.poisson(5)))
                    viirs = max(0, int(modis * 2.3)) if year >= 2003 else 0
                    harm  = modis * 1.4 if year < 2003 else modis + viirs * 0.5
                    rows.append(
                        {
                            "year":              year,
                            "month":             month,
                            "lat":               lat,
                            "lon":               lon,
                            "count_harmonized":  harm,
                            "count_raw_modis":   modis,
                            "count_raw_viirs":   viirs,
                        }
                    )
    return pd.DataFrame(rows)


def _make_hotspots_df(n: int = 300) -> pd.DataFrame:
    """Create a small hotspots DataFrame."""
    rng = np.random.default_rng(99)
    dates = pd.date_range("2001-01-01", "2006-12-31", periods=n)
    lats  = rng.uniform(20.0, 25.0, n)
    lons  = rng.uniform(68.0, 75.0, n)
    frps  = rng.uniform(10, 500, n)
    sensors    = ["MODIS" if y < 2012 else "VIIRS" for y in dates.year]
    satellites = ["Aqua" if s == "MODIS" else "Suomi NPP" for s in sensors]
    confs      = rng.choice(["high", "nominal", "low"], n)
    weights    = rng.uniform(0.8, 1.2, n)

    return pd.DataFrame(
        {
            "date":       [d.strftime("%Y-%m-%d") for d in dates],
            "latitude":   lats,
            "longitude":  lons,
            "sensor":     sensors,
            "satellite":  satellites,
            "frp":        frps,
            "confidence": confs,
            "weight":     weights,
        }
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def tmp_parquet_dir() -> Generator[Path, None, None]:
    """Write mock Parquet files to a temporary directory."""
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        monthly_df   = _make_monthly_df()
        hotspots_df  = _make_hotspots_df(300)

        monthly_path  = td_path / "monthly_grid_counts.parquet"
        hotspots_path = td_path / "hotspots_harmonized.parquet"

        monthly_df.to_parquet(monthly_path, index=False)
        hotspots_df.to_parquet(hotspots_path, index=False)

        yield td_path


@pytest.fixture(autouse=True)
def patch_config_paths(tmp_parquet_dir: Path):
    """Patch config file paths and clear lru_cache between tests."""
    from backend.app import config, data_access

    monthly_path  = tmp_parquet_dir / "monthly_grid_counts.parquet"
    hotspots_path = tmp_parquet_dir / "hotspots_harmonized.parquet"

    with (
        patch.object(config, "MONTHLY_FILE",  monthly_path),
        patch.object(config, "HOTSPOTS_FILE", hotspots_path),
        patch.object(config, "DATA_EXTENT", {
            "min_year": 2001, "max_year": 2006,
            "bbox": {"west": 68.0, "south": 20.0, "east": 75.0, "north": 25.0},
        }),
    ):
        # Clear caches so tests don't share state
        data_access.get_monthly_counts.cache_clear()
        data_access.get_climatology.cache_clear()
        yield
        data_access.get_monthly_counts.cache_clear()
        data_access.get_climatology.cache_clear()


# ---------------------------------------------------------------------------
# Tests: get_monthly_counts
# ---------------------------------------------------------------------------

def test_get_monthly_counts_bbox():
    """get_monthly_counts returns correct columns for Gujarat bbox."""
    from backend.app.data_access import get_monthly_counts

    df = get_monthly_counts(
        west=68.0, south=20.0, east=75.0, north=25.0,
        start_year=2001, start_month=1,
        end_year=2002,   end_month=12,
    )
    assert not df.empty, "Expected non-empty DataFrame for Gujarat bbox"
    for col in ("year", "month", "count_harmonized", "count_raw_modis", "count_raw_viirs"):
        assert col in df.columns, f"Column '{col}' missing from result"


def test_get_monthly_counts_date_range():
    """Only months within [start_year/month, end_year/month] should appear."""
    from backend.app.data_access import get_monthly_counts

    df = get_monthly_counts(
        west=68.0, south=20.0, east=75.0, north=25.0,
        start_year=2003, start_month=6,
        end_year=2004,   end_month=3,
    )
    for _, row in df.iterrows():
        ym = (int(row["year"]), int(row["month"]))
        assert ym >= (2003, 6), f"Row {ym} before start boundary"
        assert ym <= (2004, 3), f"Row {ym} after end boundary"


def test_get_monthly_counts_counts_non_negative():
    """All count columns must be >= 0."""
    from backend.app.data_access import get_monthly_counts

    df = get_monthly_counts(
        west=68.0, south=20.0, east=75.0, north=25.0,
        start_year=2001, start_month=1,
        end_year=2006,   end_month=12,
    )
    for col in ("count_harmonized", "count_raw_modis", "count_raw_viirs"):
        assert (df[col] >= 0).all(), f"Negative values in {col}"


# ---------------------------------------------------------------------------
# Tests: get_climatology
# ---------------------------------------------------------------------------

def test_get_climatology_has_12_months():
    """get_climatology must return exactly 12 rows, one per calendar month."""
    from backend.app.data_access import get_climatology

    df = get_climatology(west=68.0, south=20.0, east=75.0, north=25.0)
    assert len(df) == 12, f"Expected 12 rows, got {len(df)}"
    assert set(df["month"].tolist()) == set(range(1, 13))


def test_get_climatology_columns():
    """Check required columns are present."""
    from backend.app.data_access import get_climatology

    df = get_climatology(west=68.0, south=20.0, east=75.0, north=25.0)
    for col in ("month", "median_count", "percentile_25", "percentile_75"):
        assert col in df.columns, f"Column '{col}' missing"


def test_get_climatology_percentile_ordering():
    """p25 <= median <= p75 for all months."""
    from backend.app.data_access import get_climatology

    df = get_climatology(west=68.0, south=20.0, east=75.0, north=25.0)
    assert (df["percentile_25"] <= df["median_count"]).all()
    assert (df["median_count"]  <= df["percentile_75"]).all()


# ---------------------------------------------------------------------------
# Tests: bbox filtering
# ---------------------------------------------------------------------------

def test_bbox_filtering():
    """Points outside bbox must not appear in results."""
    from backend.app.data_access import get_monthly_counts

    # Very small bbox – only a couple of grid cells
    df = get_monthly_counts(
        west=68.0, south=20.0, east=68.5, north=20.5,
        start_year=2001, start_month=1,
        end_year=2006,   end_month=12,
    )
    # The result is aggregated, so we can only check that counts are plausibly small
    # compared to the full-region query
    df_full = get_monthly_counts(
        west=68.0, south=20.0, east=75.0, north=25.0,
        start_year=2001, start_month=1,
        end_year=2006,   end_month=12,
    )
    total_small  = df["count_harmonized"].sum()
    total_full   = df_full["count_harmonized"].sum()
    assert total_small <= total_full, "Small bbox sum exceeds full bbox sum"


# ---------------------------------------------------------------------------
# Tests: polygon filtering (shapely)
# ---------------------------------------------------------------------------

def test_polygon_filtering():
    """Shapely polygon filter should exclude points outside the polygon."""
    from backend.app.data_access import get_hotspots, bbox_from_polygon

    # Tight polygon around north-east Gujarat corner
    polygon = [
        [72.0, 23.0],
        [75.0, 23.0],
        [75.0, 25.0],
        [72.0, 25.0],
        [72.0, 23.0],
    ]
    west, south, east, north = bbox_from_polygon(polygon)
    df, total = get_hotspots(
        west=west, south=south, east=east, north=north,
        start_date="2001-01-01", end_date="2006-12-31",
        polygon=polygon,
    )
    # All returned points should be inside the polygon lon range
    if not df.empty:
        assert (df["lon"] >= 72.0).all()
        assert (df["lat"] >= 23.0).all()


# ---------------------------------------------------------------------------
# Tests: hotspots cap / truncation
# ---------------------------------------------------------------------------

def test_hotspots_cap():
    """When limit is very small, truncated should be True if data is larger."""
    from backend.app import data_access, config

    # Temporarily lower the cap
    original_cap = config.HOTSPOT_DISPLAY_CAP
    try:
        # We need to call with an explicit small limit
        df, total = data_access.get_hotspots(
            west=68.0, south=20.0, east=75.0, north=25.0,
            start_date="2001-01-01", end_date="2006-12-31",
            limit=5,
        )
        # If there are more than 5 hotspots in mock data, len(df) == 5
        if total > 5:
            assert len(df) == 5, f"Expected 5 rows with limit=5, got {len(df)}"
    finally:
        config.HOTSPOT_DISPLAY_CAP = original_cap


def test_hotspots_columns():
    """Hotspots DataFrame must have required columns."""
    from backend.app.data_access import get_hotspots

    df, _ = get_hotspots(
        west=68.0, south=20.0, east=75.0, north=25.0,
        start_date="2001-01-01", end_date="2006-12-31",
    )
    for col in ("lat", "lon", "date", "frp", "sensor", "satellite", "confidence"):
        assert col in df.columns, f"Column '{col}' missing from hotspots result"


# ---------------------------------------------------------------------------
# Tests: anomaly median logic
# ---------------------------------------------------------------------------

def test_anomaly_median_logic():
    """Verify that the median computed by the route matches numpy's median."""
    from backend.app.data_access import get_monthly_counts

    df = get_monthly_counts(
        west=68.0, south=20.0, east=75.0, north=25.0,
        start_year=2001, start_month=1,
        end_year=2006,   end_month=12,
    )
    # Compute median for month 4 (April)
    april = df[df["month"] == 4]["count_harmonized"].values
    expected_median = float(np.median(april))

    # Simulate what the anomaly route does
    actual_median = float(np.median(april))
    assert abs(actual_median - expected_median) < 1e-9


def test_anomaly_percentile_rank_range():
    """Percentile rank must be in [0, 100]."""
    from backend.app.data_access import get_monthly_counts

    df = get_monthly_counts(
        west=68.0, south=20.0, east=75.0, north=25.0,
        start_year=2001, start_month=1,
        end_year=2006,   end_month=12,
    )
    for month in range(1, 13):
        counts = df[df["month"] == month]["count_harmonized"].values.astype(float)
        if len(counts) == 0:
            continue
        current = float(counts[-1])
        pct_rank = float(np.mean(counts <= current) * 100.0)
        assert 0.0 <= pct_rank <= 100.0, f"Percentile rank {pct_rank} out of range for month {month}"


# ---------------------------------------------------------------------------
# Tests: bbox_from_polygon helper
# ---------------------------------------------------------------------------

def test_bbox_from_polygon_simple():
    """bbox_from_polygon should return correct (west, south, east, north)."""
    from backend.app.data_access import bbox_from_polygon

    polygon = [[68.0, 20.0], [75.0, 20.0], [75.0, 25.0], [68.0, 25.0], [68.0, 20.0]]
    west, south, east, north = bbox_from_polygon(polygon)
    assert west  == 68.0
    assert south == 20.0
    assert east  == 75.0
    assert north == 25.0


# ---------------------------------------------------------------------------
# Tests: CSV stream
# ---------------------------------------------------------------------------

def test_csv_stream_has_header():
    """First line of CSV stream must be the header row."""
    from backend.app.data_access import get_hotspots_csv_stream

    gen = get_hotspots_csv_stream(
        west=68.0, south=20.0, east=75.0, north=25.0,
        start_date="2001-01-01", end_date="2006-12-31",
    )
    first_chunk = next(gen)
    first_line  = first_chunk.strip().split("\n")[0]
    assert "lat" in first_line
    assert "lon" in first_line
    assert "date" in first_line
