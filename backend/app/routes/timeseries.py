"""
POST /api/timeseries

Returns the monthly time-series of fire counts (harmonized + raw) for a given
region and date range, sorted by date ascending.

Response
--------
[
  {
    "date"              : "YYYY-MM",
    "count_harmonized"  : float,
    "count_raw_modis"   : float,
    "count_raw_viirs"   : float
  },
  ...
]
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import RegionModel, DateRangeBody
from .. import data_access
from ..data_access import bbox_from_polygon

router = APIRouter(tags=["timeseries"])


# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------

class TimeseriesItem(BaseModel):
    date:              str    # "YYYY-MM"
    count_harmonized:  float
    count_raw_modis:   float
    count_raw_viirs:   float


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

@router.post("/timeseries", response_model=List[TimeseriesItem])
async def get_timeseries(body: DateRangeBody) -> List[TimeseriesItem]:
    """
    Return monthly fire count time-series for the specified region and period.
    Results are sorted by date ascending.
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
        return []

    result: List[TimeseriesItem] = []
    for row in df.sort_values(["year", "month"]).itertuples(index=False):
        result.append(
            TimeseriesItem(
                date=f"{int(row.year):04d}-{int(row.month):02d}",
                count_harmonized=float(row.count_harmonized or 0.0),
                count_raw_modis=float(row.count_raw_modis or 0.0),
                count_raw_viirs=float(row.count_raw_viirs or 0.0),
            )
        )

    return result
