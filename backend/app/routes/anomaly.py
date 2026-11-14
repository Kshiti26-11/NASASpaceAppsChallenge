"""
POST /api/anomaly

For a given region, year, and calendar month, compare the observed harmonized
fire count against the historical distribution for the same calendar month.

Response
--------
{
  year           : int,
  month          : int,
  current        : float,   -- sum of count_harmonized for that year/month
  median         : float,   -- across-year median for that calendar month
  anomaly_abs    : float,   -- current - median
  anomaly_pct    : float,   -- (current - median) / median * 100
  percentile_rank: float,   -- fraction of years with count <= current, × 100
  historical     : [{year, count}, ...]   -- all years for the same calendar month
}
"""

from __future__ import annotations

from typing import List

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import RegionModel
from .. import data_access
from ..data_access import bbox_from_polygon

router = APIRouter(tags=["anomaly"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AnomalyBody(BaseModel):
    region: RegionModel
    year:   int
    month:  int   # 1–12


class HistoricalItem(BaseModel):
    year:  int
    count: float


class AnomalyResponse(BaseModel):
    year:            int
    month:           int
    current:         float
    median:          float
    anomaly_abs:     float
    anomaly_pct:     float
    percentile_rank: float
    historical:      List[HistoricalItem]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_bbox(region: RegionModel) -> tuple[float, float, float, float]:
    if region.bbox is not None:
        b = region.bbox
        return b.west, b.south, b.east, b.north
    return bbox_from_polygon(region.polygon)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/anomaly", response_model=AnomalyResponse)
async def get_anomaly(body: AnomalyBody) -> AnomalyResponse:
    """
    Return anomaly statistics for one region / year / month combination.
    """
    if not (1 <= body.month <= 12):
        raise HTTPException(status_code=400, detail="month must be between 1 and 12.")

    from .. import config
    min_year = config.DATA_EXTENT.get("min_year", 2001)
    max_year = config.DATA_EXTENT.get("max_year", 2024)
    # Clamp requested year to valid available range gracefully
    query_year = max(min_year, min(body.year, max_year))

    west, south, east, north = _resolve_bbox(body.region)

    # Fetch all monthly data for this region (all years, all months)
    df = data_access.get_monthly_counts(
        west=west, south=south, east=east, north=north,
        start_year=min_year, start_month=1,
        end_year=max_year,   end_month=12,
    )

    if df.empty:
        raise HTTPException(
            status_code=404,
            detail="No data found for the specified region.",
        )

    # Filter to the target calendar month
    same_month = df[df["month"] == body.month].copy()

    if same_month.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No data for month {body.month} in the specified region.",
        )

    counts = same_month["count_harmonized"].values.astype(float)
    years  = same_month["year"].values.astype(int)

    # Current year's value
    current_rows = same_month[same_month["year"] == query_year]
    current = float(current_rows["count_harmonized"].iloc[0]) if not current_rows.empty else 0.0

    median      = float(np.median(counts))
    anomaly_abs = current - median
    anomaly_pct = ((current - median) / median * 100.0) if median != 0 else 0.0

    # Percentile rank: fraction of years where count <= current
    percentile_rank = float(np.mean(counts <= current) * 100.0)

    historical = [
        HistoricalItem(year=int(y), count=float(c))
        for y, c in sorted(zip(years, counts), key=lambda x: x[0])
    ]

    return AnomalyResponse(
        year=query_year,
        month=body.month,
        current=current,
        median=median,
        anomaly_abs=anomaly_abs,
        anomaly_pct=anomaly_pct,
        percentile_rank=percentile_rank,
        historical=historical,
    )
