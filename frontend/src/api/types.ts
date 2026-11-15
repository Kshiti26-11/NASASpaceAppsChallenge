export interface MetaResponse {
  min_year: number
  max_year: number
  bbox: { west: number; south: number; east: number; north: number }
  grid_size_deg: number
  method_note: string
}

export interface CalendarPoint {
  year: number
  month: number
  count: number
}

export interface AnomalyResponse {
  year: number
  month: number
  current: number
  median: number
  anomaly_abs: number
  anomaly_pct: number
  percentile_rank: number
  historical: Array<{ year: number; count: number }>
}

export interface SummaryResponse {
  total_fires: number
  peak_month: number
  peak_year: number
  peak_year_count: number
  avg_per_year: number
  trend_slope: number | null
}

export interface TimeseriesPoint {
  date: string
  count_harmonized: number
  count_raw_modis: number
  count_raw_viirs: number
}

export interface HotspotsResponse {
  points: Array<{
    lat: number
    lon: number
    date: string
    frp: number
    sensor: string
    satellite: string
    confidence: string
  }>
  truncated: boolean
  total_in_region: number
}

export interface RegionBBox {
  west: number
  south: number
  east: number
  north: number
}

export interface RegionPolygon {
  polygon: number[][]
}

export type Region = { bbox: RegionBBox } | { polygon: number[][] }

export interface DateRangeRequest {
  region: Region
  start_date: string
  end_date: string
  live?: boolean
}

export interface CalendarRequest extends DateRangeRequest {}

export interface AnomalyRequest {
  region: Region
  year: number
  month: number
}
