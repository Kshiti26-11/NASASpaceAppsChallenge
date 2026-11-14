"""
POST /api/calendar

Returns monthly harmonized fire counts summed over a user-specified region
and date range. Each row in the response represents one calendar month.
"""

from __future__ import annotations

from datetime import date
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import BBoxModel, RegionModel
from .. import data_access
from ..data_access import bbox_from_polygon

router = APIRouter(tags=["calendar"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class CalendarBody(BaseModel):
    region:     RegionModel
    start_date: str   # YYYY-MM-DD
    end_date:   str   # YYYY-MM-DD


class CalendarItem(BaseModel):
    year:  int
    month: int
    count: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_date(ds: str, field: str) -> date:
    try:
        return date.fromisoformat(ds)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field}: '{ds}'. Expected YYYY-MM-DD format.",
        )


def _resolve_bbox(region: RegionModel) -> tuple[float, float, float, float]:
    """Return (west, south, east, north) from either bbox or polygon."""
    if region.bbox is not None:
        b = region.bbox
        return b.west, b.south, b.east, b.north
    return bbox_from_polygon(region.polygon)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/calendar", response_model=List[CalendarItem])
async def get_calendar(body: CalendarBody) -> List[CalendarItem]:
    """
    Return monthly harmonized fire counts for the specified region and period.

    Accepts either a bounding box or a GeoJSON polygon ring ([[lon,lat], ...]).
    """
    start = _parse_date(body.start_date, "start_date")
    end   = _parse_date(body.end_date,   "end_date")

    if end < start:
        raise HTTPException(
            status_code=400,
            detail=(
                f"end_date ({body.end_date}) must be >= start_date ({body.start_date})."
            ),
        )

    west, south, east, north = _resolve_bbox(body.region)

    df = data_access.get_monthly_counts(
        west=west, south=south, east=east, north=north,
        start_year=start.year,  start_month=start.month,
        end_year=end.year,      end_month=end.month,
    )

    if df.empty:
        return []

    return [
        CalendarItem(year=int(row.year), month=int(row.month), count=float(row.count_harmonized))
        for row in df.itertuples(index=False)
    ]
