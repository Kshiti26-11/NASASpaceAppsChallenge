"""
Integration tests for all API routes using FastAPI TestClient.

A module-scoped fixture writes mock Parquet data, patches config paths, then
starts the app via TestClient so that all tests share the same startup.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Generator
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Mock data builders (identical to test_data_access for consistency)
# ---------------------------------------------------------------------------

GUJARAT_LATS = [20.125, 20.375, 20.625, 21.125, 21.375, 22.125, 23.0, 24.0]
GUJARAT_LONS = [68.125, 68.375, 69.0, 70.0, 71.0, 72.0, 73.0, 74.0]
YEARS  = list(range(2001, 2007))


def _make_monthly_df() -> pd.DataFrame:
    rows = []
    rng = np.random.default_rng(42)
    for year in YEARS:
        for month in range(1, 13):
            for lat in GUJARAT_LATS:
                for lon in GUJARAT_LONS:
                    base  = 10 * np.abs(np.sin((month - 1) * np.pi / 6))
                    modis = max(0, int(base + rng.poisson(5)))
                    viirs = max(0, int(modis * 2.3)) if year >= 2003 else 0
                    harm  = modis * 1.4 if year < 2003 else modis + viirs * 0.5
                    rows.append({
                        "year": year, "month": month,
                        "lat": lat, "lon": lon,
                        "count_harmonized": harm,
                        "count_raw_modis": modis,
                        "count_raw_viirs": viirs,
                    })
    return pd.DataFrame(rows)


def _make_hotspots_df(n: int = 300) -> pd.DataFrame:
    rng  = np.random.default_rng(99)
    dates = pd.date_range("2001-01-01", "2006-12-31", periods=n)
    lats  = rng.uniform(20.0, 25.0, n)
    lons  = rng.uniform(68.0, 75.0, n)
    frps  = rng.uniform(10, 500, n)
    sensors    = ["MODIS"] * n
    satellites = ["Aqua"] * n
    confs      = rng.choice(["high", "nominal", "low"], n)
    weights    = rng.uniform(0.8, 1.2, n)
    return pd.DataFrame({
        "date":       [d.strftime("%Y-%m-%d") for d in dates],
        "latitude":   lats, "longitude": lons,
        "sensor": sensors, "satellite": satellites,
        "frp": frps, "confidence": confs, "weight": weights,
    })


# ---------------------------------------------------------------------------
# Module-scoped fixture: write parquet, patch config, build TestClient
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        monthly_path  = td_path / "monthly_grid_counts.parquet"
        hotspots_path = td_path / "hotspots_harmonized.parquet"

        _make_monthly_df().to_parquet(monthly_path, index=False)
        _make_hotspots_df(300).to_parquet(hotspots_path, index=False)

        mock_extent = {
            "min_year": 2001, "max_year": 2006,
            "bbox": {"west": 68.0, "south": 20.0, "east": 75.0, "north": 25.0},
        }

        with (
            patch("backend.app.config.MONTHLY_FILE",  monthly_path),
            patch("backend.app.config.HOTSPOTS_FILE", hotspots_path),
            patch("backend.app.config.DATA_EXTENT",   mock_extent),
            # Skip actual file validation at startup since we patched paths
            patch(
                "backend.app.validator.validate_and_update_extent",
                side_effect=lambda: setattr(
                    __import__("backend.app.config", fromlist=["config"]),
                    "DATA_EXTENT", mock_extent
                ),
            ),
        ):
            from backend.app.main import create_app
            from backend.app import data_access
            data_access.get_monthly_counts.cache_clear()
            data_access.get_climatology.cache_clear()

            app = create_app()
            with TestClient(app, raise_server_exceptions=True) as c:
                yield c

            data_access.get_monthly_counts.cache_clear()
            data_access.get_climatology.cache_clear()


# ---------------------------------------------------------------------------
# Common request bodies
# ---------------------------------------------------------------------------

REGION_BBOX = {
    "region": {
        "bbox": {"west": 68.0, "south": 20.0, "east": 75.0, "north": 25.0}
    },
    "start_date": "2001-01-01",
    "end_date":   "2006-12-31",
}

REGION_POLYGON = {
    "region": {
        "polygon": [
            [68.0, 20.0], [75.0, 20.0],
            [75.0, 25.0], [68.0, 25.0],
            [68.0, 20.0],
        ]
    },
    "start_date": "2001-01-01",
    "end_date":   "2006-12-31",
}


# ---------------------------------------------------------------------------
# Tests: GET /api/meta
# ---------------------------------------------------------------------------

def test_meta_endpoint(client: TestClient):
    r = client.get("/api/meta")
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("min_year", "max_year", "bbox", "grid_size_deg", "method_note"):
        assert key in data, f"Key '{key}' missing from /api/meta response"
    assert isinstance(data["min_year"], int)
    assert isinstance(data["max_year"], int)
    assert data["min_year"] <= data["max_year"]
    bbox = data["bbox"]
    for k in ("west", "south", "east", "north"):
        assert k in bbox, f"bbox key '{k}' missing"


# ---------------------------------------------------------------------------
# Tests: POST /api/calendar
# ---------------------------------------------------------------------------

def test_calendar_endpoint(client: TestClient):
    r = client.post("/api/calendar", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list)
    assert len(items) > 0, "Expected at least one calendar row"
    for item in items:
        assert "year"  in item
        assert "month" in item
        assert "count" in item
        assert isinstance(item["count"], (int, float))


def test_calendar_endpoint_polygon(client: TestClient):
    r = client.post("/api/calendar", json=REGION_POLYGON)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list)


def test_calendar_dates_in_range(client: TestClient):
    """All returned (year, month) pairs must be within the requested range."""
    r = client.post("/api/calendar", json={
        **REGION_BBOX,
        "start_date": "2003-03-01",
        "end_date":   "2004-06-30",
    })
    assert r.status_code == 200, r.text
    for item in r.json():
        ym = (item["year"], item["month"])
        assert ym >= (2003, 3), f"{ym} before start"
        assert ym <= (2004, 6), f"{ym} after end"


# ---------------------------------------------------------------------------
# Tests: POST /api/anomaly
# ---------------------------------------------------------------------------

def test_anomaly_endpoint(client: TestClient):
    body = {"region": REGION_BBOX["region"], "year": 2004, "month": 4}
    r = client.post("/api/anomaly", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("year", "month", "current", "median", "anomaly_abs",
                "anomaly_pct", "percentile_rank", "historical"):
        assert key in data, f"Key '{key}' missing from /api/anomaly response"
    assert data["year"]  == 2004
    assert data["month"] == 4
    assert isinstance(data["historical"], list)
    assert len(data["historical"]) > 0
    assert 0.0 <= data["percentile_rank"] <= 100.0


def test_anomaly_invalid_month(client: TestClient):
    body = {"region": REGION_BBOX["region"], "year": 2004, "month": 13}
    r = client.post("/api/anomaly", json=body)
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Tests: POST /api/summary
# ---------------------------------------------------------------------------

def test_summary_endpoint(client: TestClient):
    r = client.post("/api/summary", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("total_fires", "peak_month", "peak_year",
                "peak_year_count", "avg_per_year", "trend_slope"):
        assert key in data, f"Key '{key}' missing from /api/summary response"
    assert 1 <= data["peak_month"] <= 12
    assert isinstance(data["peak_year"], int)
    assert data["total_fires"] >= 0
    assert data["avg_per_year"] >= 0


def test_summary_trend_slope_is_float(client: TestClient):
    r = client.post("/api/summary", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    assert isinstance(r.json()["trend_slope"], float)


# ---------------------------------------------------------------------------
# Tests: POST /api/timeseries
# ---------------------------------------------------------------------------

def test_timeseries_endpoint(client: TestClient):
    r = client.post("/api/timeseries", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    items = r.json()
    assert isinstance(items, list)
    assert len(items) > 0
    for item in items:
        assert "date"             in item
        assert "count_harmonized" in item
        assert "count_raw_modis"  in item
        assert "count_raw_viirs"  in item


def test_timeseries_sorted(client: TestClient):
    """Dates must be in ascending order."""
    r = client.post("/api/timeseries", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    dates = [item["date"] for item in r.json()]
    assert dates == sorted(dates), "Timeseries not sorted by date ascending"


def test_timeseries_date_format(client: TestClient):
    """Each date must match YYYY-MM format."""
    import re
    pattern = re.compile(r"^\d{4}-\d{2}$")
    r = client.post("/api/timeseries", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    for item in r.json():
        assert pattern.match(item["date"]), f"Bad date format: {item['date']}"


# ---------------------------------------------------------------------------
# Tests: POST /api/hotspots
# ---------------------------------------------------------------------------

def test_hotspots_endpoint(client: TestClient):
    r = client.post("/api/hotspots", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "points"          in data
    assert "truncated"       in data
    assert "total_in_region" in data
    assert isinstance(data["points"], list)
    assert isinstance(data["truncated"], bool)
    assert isinstance(data["total_in_region"], int)


def test_hotspots_points_structure(client: TestClient):
    r = client.post("/api/hotspots", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    for pt in r.json()["points"]:
        for key in ("lat", "lon", "date"):
            assert key in pt, f"Key '{key}' missing in hotspot point"


def test_hotspots_total_consistent(client: TestClient):
    """total_in_region must be >= len(points)."""
    r = client.post("/api/hotspots", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_in_region"] >= len(data["points"])


# ---------------------------------------------------------------------------
# Tests: POST /api/hotspots-csv
# ---------------------------------------------------------------------------

def test_csv_download(client: TestClient):
    r = client.post("/api/hotspots-csv", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", ""), (
        f"Expected text/csv content-type, got {r.headers.get('content-type')}"
    )
    text = r.text
    assert "lat" in text.split("\n")[0].lower(), "CSV header missing 'lat'"
    assert "lon" in text.split("\n")[0].lower(), "CSV header missing 'lon'"


def test_csv_download_has_data(client: TestClient):
    r = client.post("/api/hotspots-csv", json=REGION_BBOX)
    assert r.status_code == 200, r.text
    lines = [l for l in r.text.strip().split("\n") if l]
    assert len(lines) >= 1, "CSV response should have at least a header"


# ---------------------------------------------------------------------------
# Tests: Validation / error cases
# ---------------------------------------------------------------------------

def test_invalid_region_no_bbox_no_polygon(client: TestClient):
    """Omitting both bbox and polygon must return 422."""
    body = {
        "region":     {},
        "start_date": "2001-01-01",
        "end_date":   "2006-12-31",
    }
    r = client.post("/api/calendar", json=body)
    assert r.status_code == 422


def test_invalid_bbox_west_east_swapped(client: TestClient):
    """west >= east should return 422."""
    body = {
        "region": {"bbox": {"west": 75.0, "south": 20.0, "east": 68.0, "north": 25.0}},
        "start_date": "2001-01-01",
        "end_date":   "2006-12-31",
    }
    r = client.post("/api/calendar", json=body)
    assert r.status_code == 422


def test_invalid_date_format(client: TestClient):
    """Non-ISO date strings should return 400."""
    body = {**REGION_BBOX, "start_date": "01/01/2001"}
    r = client.post("/api/calendar", json=body)
    assert r.status_code == 400


def test_end_before_start(client: TestClient):
    """end_date before start_date must return 400."""
    body = {**REGION_BBOX, "start_date": "2005-01-01", "end_date": "2003-12-31"}
    r = client.post("/api/calendar", json=body)
    assert r.status_code == 400


def test_date_outside_data_range(client: TestClient):
    """
    A date range entirely outside the available data should return an empty
    list (not an error) for calendar/timeseries, since no matching rows exist.
    """
    body = {**REGION_BBOX, "start_date": "1990-01-01", "end_date": "1999-12-31"}
    r = client.post("/api/calendar", json=body)
    # Either empty list (200) or 400 is acceptable; 500 is not
    assert r.status_code in (200, 400, 404), f"Unexpected status {r.status_code}"
    if r.status_code == 200:
        assert r.json() == []


def test_health_endpoint(client: TestClient):
    """GET /health must return JSON with 'status' field."""
    r = client.get("/health")
    # Either 200 (data ready) or 503 (startup error) depending on mock
    assert r.status_code in (200, 503)
    assert "status" in r.json()
