import type { RegionBBox } from '../api/types'

// Leaflet uses [lat, lon], GeoJSON uses [lon, lat]

/**
 * Convert a bbox object to Leaflet LatLngBounds format: [[south, west], [north, east]]
 */
export function bboxToLeafletBounds(
  bbox: RegionBBox,
): [[number, number], [number, number]] {
  return [
    [bbox.south, bbox.west],
    [bbox.north, bbox.east],
  ]
}

/**
 * Convert Leaflet LatLngBounds to bbox object
 */
export function leafletBoundsToBBox(bounds: {
  getSouth: () => number
  getNorth: () => number
  getWest: () => number
  getEast: () => number
}): RegionBBox {
  return {
    south: parseFloat(bounds.getSouth().toFixed(4)),
    north: parseFloat(bounds.getNorth().toFixed(4)),
    west: parseFloat(bounds.getWest().toFixed(4)),
    east: parseFloat(bounds.getEast().toFixed(4)),
  }
}

/**
 * Convert GeoJSON coordinate array [[lon, lat], ...] to Leaflet [[lat, lon], ...]
 */
export function geoJsonCoordsToLeaflet(
  coords: number[][],
): Array<[number, number]> {
  return coords.map(([lon, lat]) => [lat, lon])
}

/**
 * Convert Leaflet coordinate array [[lat, lon], ...] to GeoJSON [[lon, lat], ...]
 */
export function leafletCoordsToGeoJson(
  coords: Array<{ lat: number; lng: number }>,
): number[][] {
  return coords.map((c) => [c.lng, c.lat])
}

/**
 * Round a number to N decimal places
 */
export function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(n * factor) / factor
}
