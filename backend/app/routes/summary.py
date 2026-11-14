"""
POST /api/summary

Aggregate statistics for a region and date range.

Response
--------
{
  total_fires     : float,  -- sum of count_harmonized across period
  peak_month      : int,    -- 1-12, calendar month with highest total
  peak_year       : int,    -- year with the highest annual total
  peak_year_count : float,  -- count in peak year
  avg_per_year    : float,  -- mean annual total
  trend_slope     : float   -- linear regression slope (fires/year)
}
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import RegionModel
from .. import data_access
from ..data_access import bbox_from_polygon

router = APIRouter(tags=["summary"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class SummaryBody(BaseModel):
    region:     RegionModel
    start_date: str   # YYYY-MM-DD
    end_date:   str   # YYYY-MM-DD


class SummaryResponse(BaseModel):
    total_fires:     float
    peak_month:      int
    peak_year:       int
    peak_year_count: float
    avg_per_year:    float
    trend_slope:     float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_ym(ds: str, field: str) -> tuple[int, int]:
    from datetime import date
    try:
        d = date.fromisoformat(ds)
        return d.year, d.month
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field}: '{ds}'. Expected YYYY-MM-DD.",
        )


def _resolve_bbox(region: RegionModel) -> tuple[float, float, float, float]:
    if region.bbox is not None:
        b = region.bbox
        return b.west, b.south, b.east, b.north
    return bbox_from_polygon(region.polygon)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/summary", response_model=SummaryResponse)
async def get_summary(body: SummaryBody) -> SummaryResponse:
    """
    Return aggregate statistics for the given region and period.
    """
    start_year, start_month = _parse_ym(body.start_date, "start_date")
    end_year,   end_month   = _parse_ym(body.end_date,   "end_date")

    if (end_year, end_month) < (start_year, start_month):
        raise HTTPException(
            status_code=400,
            detail="end_date must be >= start_date.",
        )

    west, south, east, north = _resolve_bbox(body.region)

    df = data_access.get_monthly_counts(
        west=west, south=south, east=east, north=north,
        start_year=start_year,  start_month=start_month,
        end_year=end_year,      end_month=end_month,
    )

    if df.empty:
        raise HTTPException(
            status_code=404,
            detail="No data found for the specified region and date range.",
        )

    df["count_harmonized"] = df["count_harmonized"].fillna(0.0)

    # ── Total fires ───────────────────────────────────────────────────────
    total_fires = float(df["count_harmonized"].sum())

    # ── Peak calendar month ───────────────────────────────────────────────
    monthly_totals = df.groupby("month")["count_harmonized"].sum()
    peak_month     = int(monthly_totals.idxmax())

    # ── Annual totals ─────────────────────────────────────────────────────
    annual = df.groupby("year")["count_harmonized"].sum()
    peak_year       = int(annual.idxmax())
    peak_year_count = float(annual.max())
    avg_per_year    = float(annual.mean())

    # ── Trend slope (simple OLS on annual totals) ─────────────────────────
    years_arr  = annual.index.values.astype(float)
    counts_arr = annual.values.astype(float)

    if len(years_arr) >= 2:
        coeffs    = np.polyfit(years_arr - years_arr.mean(), counts_arr, 1)
        trend_slope = float(coeffs[0])
    else:
        trend_slope = 0.0

    return SummaryResponse(
        total_fires=total_fires,
        peak_month=peak_month,
        peak_year=peak_year,
        peak_year_count=peak_year_count,
        avg_per_year=avg_per_year,
        trend_slope=trend_slope,
    )
