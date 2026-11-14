"""
GET /api/meta

Returns metadata about the loaded dataset: year range, geographic bounding box,
grid resolution, and the harmonization method note.
"""

from __future__ import annotations

from fastapi import APIRouter

from .. import config

router = APIRouter(tags=["meta"])


@router.get("/meta")
async def get_meta() -> dict:
    """
    Return dataset metadata.

    Response fields
    ---------------
    min_year        : int   – earliest year available in the dataset
    max_year        : int   – latest year available in the dataset
    bbox            : dict  – {west, south, east, north} in decimal degrees
    grid_size_deg   : float – grid cell size (degrees)
    method_note     : str   – description of harmonization methodology
    """
    extent = config.DATA_EXTENT
    return {
        "min_year":      extent.get("min_year", config.DATA_EXTENT["min_year"]),
        "max_year":      extent.get("max_year", config.DATA_EXTENT["max_year"]),
        "bbox":          extent.get("bbox",     config.DATA_EXTENT["bbox"]),
        "grid_size_deg": config.GRID_SIZE_DEG,
        "method_note":   config.METHOD_NOTE,
    }
