import React, { useState, useEffect, useCallback } from 'react'
import type { Region, MetaResponse } from '../../api/types'
import { MONTH_NAMES } from '../../utils/format'

/* ────────────────────────────────────────────────────────────
   Continent → Country lookup (bounding boxes in WGS84)
   west, south, east, north
──────────────────────────────────────────────────────────── */
const CONTINENT_COUNTRIES: Record<string, { label: string; bbox: { west: number; south: number; east: number; north: number } }[]> = {
  Asia: [
    { label: 'Gujarat, India (Default)', bbox: { west: 68.0, south: 20.0, east: 75.0,  north: 25.0  } },
    { label: 'India (Full Country)',     bbox: { west: 68.1, south: 8.0,  east: 97.4,  north: 37.1  } },
    { label: 'China',                    bbox: { west: 73.5, south: 18.2, east: 135.1, north: 53.6  } },
    { label: 'Indonesia',     bbox: { west: 95.0, south: -11.0,east: 141.0, north: 6.0   } },
    { label: 'Myanmar',       bbox: { west: 92.2, south: 9.8,  east: 101.2, north: 28.5  } },
    { label: 'Thailand',      bbox: { west: 97.3, south: 5.6,  east: 105.7, north: 20.5  } },
    { label: 'Vietnam',       bbox: { west: 102.1,south: 8.4,  east: 109.5, north: 23.4  } },
    { label: 'Cambodia',      bbox: { west: 102.3,south: 10.3, east: 107.6, north: 14.7  } },
    { label: 'Laos',          bbox: { west: 100.1,south: 13.9, east: 107.7, north: 22.5  } },
    { label: 'Philippines',   bbox: { west: 116.9,south: 4.6,  east: 126.6, north: 20.9  } },
    { label: 'Malaysia',      bbox: { west: 99.6, south: 0.9,  east: 119.3, north: 7.4   } },
    { label: 'Russia (Asia)', bbox: { west: 60.0, south: 50.0, east: 180.0, north: 77.0  } },
  ],
  Africa: [
    { label: 'DR Congo',      bbox: { west: 12.2, south: -13.5,east: 31.3,  north: 5.4   } },
    { label: 'Angola',        bbox: { west: 11.7, south: -18.0,east: 24.1,  north: -4.4  } },
    { label: 'Zambia',        bbox: { west: 21.9, south: -18.1,east: 33.7,  north: -8.2  } },
    { label: 'Mozambique',    bbox: { west: 30.2, south: -26.9,east: 40.9,  north: -10.5 } },
    { label: 'Tanzania',      bbox: { west: 29.3, south: -11.7,east: 40.4,  north: -1.0  } },
    { label: 'Nigeria',       bbox: { west: 2.7,  south: 4.3,  east: 14.7,  north: 13.9  } },
    { label: 'Sudan',         bbox: { west: 21.8, south: 3.5,  east: 38.6,  north: 22.2  } },
    { label: 'Ethiopia',      bbox: { west: 33.0, south: 3.4,  east: 47.9,  north: 15.0  } },
    { label: 'South Africa',  bbox: { west: 16.5, south: -34.8,east: 32.9,  north: -22.1 } },
    { label: 'Madagascar',    bbox: { west: 43.2, south: -25.6,east: 50.5,  north: -11.9 } },
  ],
  'South America': [
    { label: 'Brazil',        bbox: { west: -73.9,south: -33.8,east: -28.9, north: 5.3   } },
    { label: 'Bolivia',       bbox: { west: -69.6,south: -22.9,east: -57.5, north: -9.7  } },
    { label: 'Peru',          bbox: { west: -81.4,south: -18.3,east: -68.7, north: -0.1  } },
    { label: 'Colombia',      bbox: { west: -79.0,south: -4.2, east: -66.9, north: 12.5  } },
    { label: 'Venezuela',     bbox: { west: -73.4,south: 0.6,  east: -59.8, north: 12.2  } },
    { label: 'Argentina',     bbox: { west: -73.6,south: -55.1,east: -53.7, north: -21.8 } },
    { label: 'Paraguay',      bbox: { west: -62.6,south: -27.6,east: -54.3, north: -19.3 } },
  ],
  'North America': [
    { label: 'United States', bbox: { west: -125.0,south: 24.4,east: -66.9, north: 49.4  } },
    { label: 'Canada',        bbox: { west: -141.0,south: 41.7,east: -52.6, north: 83.1  } },
    { label: 'Mexico',        bbox: { west: -117.1,south: 14.5,east: -86.7, north: 32.7  } },
  ],
  Europe: [
    { label: 'Russia (Europe)',bbox: { west: 27.0, south: 41.0, east: 60.0, north: 72.0  } },
    { label: 'Spain',         bbox: { west: -9.3, south: 35.9, east: 4.3,  north: 43.8  } },
    { label: 'Portugal',      bbox: { west: -9.5, south: 36.9, east: -6.2, north: 42.2  } },
    { label: 'Greece',        bbox: { west: 19.4, south: 34.8, east: 29.6, north: 42.0  } },
    { label: 'Turkey',        bbox: { west: 25.7, south: 35.8, east: 44.8, north: 42.1  } },
    { label: 'France',        bbox: { west: -5.1, south: 41.3, east: 9.6,  north: 51.1  } },
  ],
  Oceania: [
    { label: 'Australia',     bbox: { west: 113.3,south: -43.6,east: 153.6, north: -10.7 } },
    { label: 'Papua New Guinea',bbox:{ west: 140.8,south: -11.6,east: 155.6, north: -1.3  } },
  ],
}

/* ────────────────────────────────────────────────────────────
   Props
──────────────────────────────────────────────────────────── */
interface ControlPanelProps {
  region: Region
  onRegionChange: (region: Region) => void
  startDate: string
  endDate: string
  onStartDateChange: (d: string) => void
  onEndDateChange: (d: string) => void
  selectedAnomalyMonth: { year: number; month: number }
  onAnomalyMonthChange: (sel: { year: number; month: number }) => void
  onRunAnalysis: () => void
  onDownloadCSV: () => void
  loading: boolean
  meta: MetaResponse | null
  dataMode: 'historical' | 'realtime'
  onDataModeChange: (mode: 'historical' | 'realtime') => void
}

export default function ControlPanel({
  region,
  onRegionChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  selectedAnomalyMonth,
  onAnomalyMonthChange,
  onRunAnalysis,
  onDownloadCSV,
  loading,
  meta,
  dataMode,
  onDataModeChange,
}: ControlPanelProps) {
  const [continent, setContinent] = useState<string>('Asia')
  const [country, setCountry] = useState<string>('Gujarat, India (Default)')

  // Bounding box inputs state (keep in sync with region if bbox)
  const isBbox = 'bbox' in region && (region as any).bbox !== undefined
  const bbox = isBbox ? (region as any).bbox : null

  const [west, setWest]   = useState<number>(bbox ? bbox.west  : 68.0)
  const [south, setSouth] = useState<number>(bbox ? bbox.south : 20.0)
  const [east, setEast]   = useState<number>(bbox ? bbox.east  : 75.0)
  const [north, setNorth] = useState<number>(bbox ? bbox.north : 25.0)

  // Sync coords from map drawing back into inputs
  useEffect(() => {
    if (isBbox && bbox) {
      setWest(bbox.west)
      setSouth(bbox.south)
      setEast(bbox.east)
      setNorth(bbox.north)
    }
  }, [region, isBbox, bbox])

  const commitBbox = useCallback(() => {
    if (west >= east || south >= north) return
    setContinent('')
    setCountry('')
    onRegionChange({ bbox: { west, south, east, north } })
  }, [west, south, east, north, onRegionChange])

  // Continent → Country cascade
  const handleContinentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setContinent(e.target.value)
    setCountry('')
  }

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    setCountry(val)
    if (!val || !continent) return
    const entry = CONTINENT_COUNTRIES[continent]?.find((c) => c.label === val)
    if (!entry) return
    const { west: w, south: s, east: ea, north: n } = entry.bbox
    setWest(w); setSouth(s); setEast(ea); setNorth(n)
    onRegionChange({ bbox: entry.bbox })
  }

  // Available years from meta or fallback
  const minYear = meta?.min_year ?? 2001
  const maxYear = meta?.max_year ?? 2024
  const yearsList: number[] = []
  for (let y = maxYear; y >= minYear; y--) yearsList.push(y)

  const continentList = Object.keys(CONTINENT_COUNTRIES)
  const countryList = continent ? CONTINENT_COUNTRIES[continent] : []

  return (
    <aside className="control-sidebar">
      {/* ── 0. DATA MODE ──────────────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="section-label">Data Mode</div>
        <div className="mode-toggle-container">
          <button
            type="button"
            className={`mode-btn${dataMode === 'historical' ? ' mode-btn--active' : ''}`}
            onClick={() => onDataModeChange('historical')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.85 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Historical Analysis
          </button>
          <button
            type="button"
            className={`mode-btn${dataMode === 'realtime' ? ' mode-btn--active' : ''}`}
            onClick={() => onDataModeChange('realtime')}
          >
            <span className="mode-live-dot" />
            Near Real-Time
          </button>
        </div>
        {dataMode === 'realtime' && (
          <div className="text-xs text-secondary mt-2" style={{ lineHeight: 1.5 }}>
            Near real-time mode displays the latest active fire hotspot detections. Historical charts are disabled in this mode.
          </div>
        )}
        {dataMode === 'historical' && (
          <div className="text-xs text-secondary mt-2" style={{ lineHeight: 1.5 }}>
            Historical mode displays the full 2001-2024 harmonized satellite record with anomaly, trend, and seasonality analysis.
          </div>
        )}
      </div>

      {/* ── 1. REGION SELECTION ───────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="section-label">Region Selection</div>

        {/* Continent → Country */}
        <div className="form-field mb-2">
          <label htmlFor="continent-select" className="form-label">Continent</label>
          <select
            id="continent-select"
            className="form-select"
            value={continent}
            onChange={handleContinentChange}
          >
            <option value="">Select Continent</option>
            {continentList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {continent && (
          <div className="form-field mb-2">
            <label htmlFor="country-select" className="form-label">Country</label>
            <select
              id="country-select"
              className="form-select"
              value={country}
              onChange={handleCountryChange}
            >
              <option value="">Select Country</option>
              {countryList.map((c) => (
                <option key={c.label} value={c.label}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Manual BBox */}
        <div className="form-field">
          <span className="form-label">Coordinates (WGS84 Lat/Lon)</span>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="bbox-west" className="form-label text-xs">West</label>
              <input
                id="bbox-west"
                type="number"
                step="0.1"
                className="form-input form-input--mono"
                value={west}
                onChange={(e) => setWest(parseFloat(e.target.value) || 0)}
                onBlur={commitBbox}
              />
            </div>
            <div className="form-field">
              <label htmlFor="bbox-east" className="form-label text-xs">East</label>
              <input
                id="bbox-east"
                type="number"
                step="0.1"
                className="form-input form-input--mono"
                value={east}
                onChange={(e) => setEast(parseFloat(e.target.value) || 0)}
                onBlur={commitBbox}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="bbox-south" className="form-label text-xs">South</label>
              <input
                id="bbox-south"
                type="number"
                step="0.1"
                className="form-input form-input--mono"
                value={south}
                onChange={(e) => setSouth(parseFloat(e.target.value) || 0)}
                onBlur={commitBbox}
              />
            </div>
            <div className="form-field">
              <label htmlFor="bbox-north" className="form-label text-xs">North</label>
              <input
                id="bbox-north"
                type="number"
                step="0.1"
                className="form-input form-input--mono"
                value={north}
                onChange={(e) => setNorth(parseFloat(e.target.value) || 0)}
                onBlur={commitBbox}
              />
            </div>
          </div>
        </div>

        {!isBbox && (
          <div className="text-xs text-secondary mt-2">
            Polygon shape active on map. Coordinates shown are approximate.
          </div>
        )}
      </div>

      {/* ── 2. DATE RANGE (hidden in realtime mode) ───────────────────── */}
      {dataMode === 'historical' && (
        <div className="sidebar-section">
          <div className="section-label">Date Range</div>
          <div className="form-field mb-2">
            <label htmlFor="start-date-input" className="form-label">Start Date</label>
            <input
              id="start-date-input"
              type="date"
              className="form-input form-input--mono"
              value={startDate}
              min={`${minYear}-01-01`}
              max={`${maxYear}-12-31`}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="end-date-input" className="form-label">End Date</label>
            <input
              id="end-date-input"
              type="date"
              className="form-input form-input--mono"
              value={endDate}
              min={`${minYear}-01-01`}
              max={`${maxYear}-12-31`}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ── 3. ANOMALY FOCUS (historical only) ───────────────────────── */}
      {dataMode === 'historical' && (
        <div className="sidebar-section">
          <div className="section-label">Anomaly Inspection</div>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="anomaly-month-select" className="form-label">Month</label>
              <select
                id="anomaly-month-select"
                className="form-select"
                value={selectedAnomalyMonth.month}
                onChange={(e) =>
                  onAnomalyMonthChange({ ...selectedAnomalyMonth, month: parseInt(e.target.value, 10) })
                }
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="anomaly-year-select" className="form-label">Year</label>
              <select
                id="anomaly-year-select"
                className="form-select form-input--mono"
                value={selectedAnomalyMonth.year}
                onChange={(e) =>
                  onAnomalyMonthChange({ ...selectedAnomalyMonth, year: parseInt(e.target.value, 10) })
                }
              >
                {yearsList.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-xs text-secondary mt-2">
            Or click any cell in the Calendar Heatmap to inspect that month.
          </div>
        </div>
      )}

      {/* ── 4. ACTIONS ────────────────────────────────────────────────── */}
      <div className="sidebar-section" style={{ marginTop: 'auto' }}>
        <button
          type="button"
          className="btn-primary mb-2"
          onClick={onRunAnalysis}
          disabled={loading}
        >
          {loading ? (
            <><span className="spinner" /> Running Analysis...</>
          ) : (
            dataMode === 'realtime' ? 'Fetch Live Hotspots' : 'Run Analysis'
          )}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={onDownloadCSV}
          disabled={loading}
        >
          Download Hotspots CSV
        </button>
      </div>
    </aside>
  )
}
