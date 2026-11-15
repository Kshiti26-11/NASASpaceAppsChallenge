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


import csv
import io
import httpx
from shapely.geometry import Point, Polygon


async def _fetch_live_firms(
    west: float,
    south: float,
    east: float,
    north: float,
    polygon: list[list[float]] | None = None,
    day_range: int = 4,
) -> tuple[List[HotspotPoint], int]:
    """
    Stream live near real-time fire hotspot detections from NASA FIRMS Area API.
    Queries VIIRS (NOAA-20) and MODIS active-fire sensors.
    """
    map_key = config.FIRMS_MAP_KEY
    if not map_key:
        return [], 0

    sources = ["VIIRS_NOAA20_NRT", "MODIS_NRT"]
    points: List[HotspotPoint] = []
    poly_geom = Polygon(polygon) if polygon and len(polygon) >= 3 else None

    # Format bounding box clamped to valid coordinates
    w = max(-180.0, min(180.0, round(west, 4)))
    s = max(-90.0, min(90.0, round(south, 4)))
    e = max(-180.0, min(180.0, round(east, 4)))
    n = max(-90.0, min(90.0, round(north, 4)))
    area_str = f"{w},{s},{e},{n}"

    async with httpx.AsyncClient(timeout=12.0) as client:
        for source in sources:
            url = f"{config.FIRMS_API_BASE_URL}/{map_key}/{source}/{area_str}/{day_range}"
            try:
                resp = await client.get(url)
                if resp.status_code != 200:
                    continue
                content = resp.text.strip()
                if not content or content.startswith("Invalid") or "\n" not in content:
                    continue

                reader = csv.DictReader(io.StringIO(content))
                for row in reader:
                    try:
                        lat = float(row["latitude"])
                        lon = float(row["longitude"])
                    except (ValueError, KeyError):
                        continue

                    if poly_geom and not poly_geom.contains(Point(lon, lat)):
                        continue

                    # FRP
                    frp_val = None
                    if "frp" in row and row["frp"]:
                        try:
                            frp_val = round(float(row["frp"]), 2)
                        except ValueError:
                            pass

                    # Satellite & sensor name normalization
                    sat_raw = row.get("satellite", "")
                    if sat_raw in ("N20", "NOAA-20"):
                        satellite = "NOAA-20"
                    elif sat_raw in ("N21", "NOAA-21"):
                        satellite = "NOAA-21"
                    elif sat_raw in ("Terra", "T"):
                        satellite = "Terra"
                    elif sat_raw in ("Aqua", "A"):
                        satellite = "Aqua"
                    elif sat_raw in ("Suomi-NPP", "SNPP"):
                        satellite = "Suomi-NPP"
                    else:
                        satellite = sat_raw or "Satellite"

                    sensor = "MODIS" if "MODIS" in source else "VIIRS"

                    # Confidence
                    conf_raw = row.get("confidence", "nominal")
                    if conf_raw == "l":
                        confidence = "low"
                    elif conf_raw == "n":
                        confidence = "nominal"
                    elif conf_raw == "h":
                        confidence = "high"
                    else:
                        confidence = str(conf_raw)

                    points.append(
                        HotspotPoint(
                            lat=lat,
                            lon=lon,
                            date=row.get("acq_date", ""),
                            frp=frp_val,
                            sensor=sensor,
                            satellite=satellite,
                            confidence=confidence,
                        )
                    )
            except Exception:
                continue

    total = len(points)
    points.sort(key=lambda p: (p.date, p.frp or 0), reverse=True)
    return points[: config.HOTSPOT_DISPLAY_CAP], total


# ---------------------------------------------------------------------------
# POST /api/hotspots
# ---------------------------------------------------------------------------

@router.post("/hotspots", response_model=HotspotsResponse)
async def get_hotspots(body: DateRangeBody) -> HotspotsResponse:
    """
    Return up to HOTSPOT_DISPLAY_CAP individual fire detection points.
    If body.live is True, streams active satellite detections directly from NASA FIRMS.
    Otherwise queries the historical DuckDB/Parquet store.
    """
    west, south, east, north, polygon = _resolve_bbox_and_polygon(body.region)

    # ── Live NASA FIRMS Mode ─────────────────────────────────────────────────
    if body.live:
        try:
            live_points, total_live = await _fetch_live_firms(
                west=west, south=south, east=east, north=north,
                polygon=polygon, day_range=5,
            )
            if live_points:
                return HotspotsResponse(
                    points=live_points,
                    truncated=total_live > config.HOTSPOT_DISPLAY_CAP,
                    total_in_region=total_live,
                )
        except Exception:
            pass  # Fall back to local data if live endpoint is unreachable

    # ── Historical DuckDB Store ──────────────────────────────────────────────
    start = _parse_date_str(body.start_date, "start_date")
    end   = _parse_date_str(body.end_date,   "end_date")

    if end < start:
        raise HTTPException(
            status_code=400,
            detail="end_date must be >= start_date.",
        )

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
