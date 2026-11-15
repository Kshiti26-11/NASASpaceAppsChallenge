"""
Shared Pydantic models for request/response validation across all routes.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, model_validator


class BBoxModel(BaseModel):
    west: float
    south: float
    east: float
    north: float

    @model_validator(mode="after")
    def _validate_ranges(self) -> "BBoxModel":
        if not (-180 <= self.west <= 180):
            raise ValueError(f"west must be in [-180, 180], got {self.west}")
        if not (-180 <= self.east <= 180):
            raise ValueError(f"east must be in [-180, 180], got {self.east}")
        if not (-90 <= self.south <= 90):
            raise ValueError(f"south must be in [-90, 90], got {self.south}")
        if not (-90 <= self.north <= 90):
            raise ValueError(f"north must be in [-90, 90], got {self.north}")
        if self.west >= self.east:
            raise ValueError(f"west ({self.west}) must be less than east ({self.east})")
        if self.south >= self.north:
            raise ValueError(f"south ({self.south}) must be less than north ({self.north})")
        return self


class RegionModel(BaseModel):
    """Either bbox OR polygon (GeoJSON coordinates [[lon, lat], ...]) must be provided."""

    bbox: Optional[BBoxModel] = None
    polygon: Optional[List[List[float]]] = None  # [[lon, lat], ...]

    @model_validator(mode="after")
    def at_least_one(self) -> "RegionModel":
        if self.bbox is None and self.polygon is None:
            raise ValueError("Provide either bbox or polygon")
        if self.polygon is not None:
            for point in self.polygon:
                if len(point) != 2:
                    raise ValueError(
                        "Each polygon point must be [lon, lat] with exactly 2 elements"
                    )
        return self


class DateRangeBody(BaseModel):
    region: RegionModel
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    live: Optional[bool] = False
