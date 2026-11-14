"""
POST /api/hotspots          – individual hotspot points (capped at HOTSPOT_DISPLAY_CAP)
POST /api/hotspots-csv      – full CSV download (no row cap), streamed

Both endpoints accept the same DateRangeBody (region + start_date + end_date).
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import RegionModel, DateRangeBody
from .. import config, data_access
from ..data_access import bbox_from_polygon
from fastapi import HTTPException

router = APIRouter(tags=["hotspots"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class HotspotPoint(BaseModel):
    lat:        float
    lon:        float
    date:       str
    frp:        Optional[float]
    sensor:     Optional[str]
    satellite:  Optional[str]
    confidence: Optional[str]


class HotspotsResponse(BaseModel):
    points:          List[HotspotPoint]
    truncated:       bool
    total_in_region: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_date_str(ds: str, field: str) -> str:
    """Validate YYYY-MM-DD format and return the string unchanged."""
    from datetime import date
    try:
        date.fromisoformat(ds)
        return ds
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field}: '{ds}'. Expected YYYY-MM-DD format.",
        )


def _resolve_bbox_and_polygon(
    region: RegionModel,
) -> tuple[float, float, float, float, list[list[float]] | None]:
    """Return (west, south, east, north, polygon_or_None)."""
    polygon = None
    if region.bbox is not None:
        b = region.bbox
        return b.west, b.south, b.east, b.north, None
    # polygon path: get bbox for pre-filter, keep polygon for exact filter
    polygon = region.polygon
    west, south, east, north = bbox_from_polygon(polygon)  # type: ignore[arg-type]
    return west, south, east, north, polygon


# ---------------------------------------------------------------------------
# POST /api/hotspots
# ---------------------------------------------------------------------------

@router.post("/hotspots", response_model=HotspotsResponse)
async def get_hotspots(body: DateRangeBody) -> HotspotsResponse:
    """
    Return up to HOTSPOT_DISPLAY_CAP individual fire detection points.

    The `truncated` flag indicates whether the full dataset was capped.
    `total_in_region` always reflects the true count before the cap.
    """
    start = _parse_date_str(body.start_date, "start_date")
    end   = _parse_date_str(body.end_date,   "end_date")

    if end < start:
        raise HTTPException(
            status_code=400,
            detail="end_date must be >= start_date.",
        )

    west, south, east, north, polygon = _resolve_bbox_and_polygon(body.region)

    df, total = data_access.get_hotspots(
        west=west, south=south, east=east, north=north,
        start_date=start, end_date=end,
        limit=config.HOTSPOT_DISPLAY_CAP,
        polygon=polygon,
    )

    truncated = total > config.HOTSPOT_DISPLAY_CAP

    points: List[HotspotPoint] = []
    for row in df.itertuples(index=False):
        points.append(
            HotspotPoint(
                lat=float(row.lat),
                lon=float(row.lon),
                date=str(row.date),
                frp=float(row.frp) if row.frp is not None and row.frp == row.frp else None,
                sensor=str(row.sensor) if row.sensor is not None else None,
                satellite=str(row.satellite) if row.satellite is not None else None,
                confidence=str(row.confidence) if row.confidence is not None else None,
            )
        )

    return HotspotsResponse(
        points=points,
        truncated=truncated,
        total_in_region=total,
    )


# ---------------------------------------------------------------------------
# POST /api/hotspots-csv
# ---------------------------------------------------------------------------

@router.post("/hotspots-csv")
async def get_hotspots_csv(body: DateRangeBody) -> StreamingResponse:
    """
    Stream ALL matching hotspot records as a CSV file (no row cap).

    The response is a streaming CSV with:
        Content-Type: text/csv
        Content-Disposition: attachment; filename="hotspots_<start>_<end>.csv"
    """
    start = _parse_date_str(body.start_date, "start_date")
    end   = _parse_date_str(body.end_date,   "end_date")

    if end < start:
        raise HTTPException(
            status_code=400,
            detail="end_date must be >= start_date.",
        )

    west, south, east, north, polygon = _resolve_bbox_and_polygon(body.region)

    csv_gen = data_access.get_hotspots_csv_stream(
        west=west, south=south, east=east, north=north,
        start_date=start, end_date=end,
        polygon=polygon,
    )

    filename = f"hotspots_{start}_{end}.csv"

    return StreamingResponse(
        csv_gen,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Fire-Calendar-Start": start,
            "X-Fire-Calendar-End":   end,
        },
    )
