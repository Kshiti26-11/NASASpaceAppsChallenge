import React, { useState } from 'react'
import Plot from 'react-plotly.js'
import type { CalendarPoint } from '../../api/types'
import { VIRIDIS_SCALE, YLORRD_SCALE, MONTH_NAMES } from '../../utils/colorscales'
import EmptyState from '../shared/EmptyState'
import SkeletonLoader from '../shared/SkeletonLoader'

interface CalendarHeatmapProps {
  data: CalendarPoint[]
  loading: boolean
  onCellClick: (year: number, month: number) => void
}

type ColorScale = 'viridis' | 'ylorrd'

export default function CalendarHeatmap({ data, loading, onCellClick }: CalendarHeatmapProps) {
  const [colorScale, setColorScale] = useState<ColorScale>('viridis')

  if (loading) {
    return (
      <div className="panel chart-panel">
        <div className="chart-panel-header">
          <span className="chart-panel-title">Calendar Heatmap</span>
        </div>
        <SkeletonLoader rows={1} height={300} />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="panel chart-panel">
        <div className="chart-panel-header">
          <span className="chart-panel-title">Calendar Heatmap</span>
        </div>
        <EmptyState
          message="No calendar data yet."
          hint="Select a region and date range, then click Run Analysis."
        />
      </div>
    )
  }

  // Build matrix: rows = years, cols = months
  const years = Array.from(new Set(data.map((d) => d.year))).sort((a, b) => a - b)
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  // z[year_idx][month_idx]
  const countMap = new Map<string, number>()
  for (const pt of data) {
    countMap.set(`${pt.year}-${pt.month}`, pt.count)
  }

  const z: number[][] = years.map((yr) =>
    months.map((mo) => countMap.get(`${yr}-${mo}`) ?? 0),
  )

  const textMatrix: string[][] = years.map((yr) =>
    months.map((mo) => {
      const val = countMap.get(`${yr}-${mo}`)
      return val !== undefined ? val.toLocaleString() : ''
    }),
  )

  const plotColorscale = colorScale === 'viridis' ? VIRIDIS_SCALE : YLORRD_SCALE

  const plotData: Plotly.Data[] = [
    {
      type: 'heatmap',
      z,
      x: MONTH_NAMES,
      y: years.map(String),
      text: textMatrix,
      texttemplate: '%{text}',
      textfont: { size: 10, family: 'IBM Plex Mono' },
      colorscale: plotColorscale,
      hoverongaps: false,
      hovertemplate:
        'Year: %{y}<br>Month: %{x}<br>Count: %{z:,}<extra></extra>',
      showscale: true,
      colorbar: {
        thickness: 12,
        len: 0.9,
        title: { text: 'Hotspots', font: { size: 11 } },
        tickfont: { size: 10, family: 'IBM Plex Mono' },
      },
    } as unknown as Plotly.Data,
  ]

  const layout: Partial<Plotly.Layout> = {
    margin: { t: 20, r: 80, b: 60, l: 60 },
    xaxis: {
      title: { text: 'Month', font: { size: 12 } },
      tickfont: { size: 11, family: 'IBM Plex Sans' },
      fixedrange: true,
    },
    yaxis: {
      title: { text: 'Year', font: { size: 12 } },
      tickfont: { size: 11, family: 'IBM Plex Mono' },
      type: 'category',
      fixedrange: true,
      autorange: 'reversed',
    },
    font: { family: 'IBM Plex Sans', size: 12 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    height: Math.max(300, years.length * 22 + 100),
  } as unknown as Partial<Plotly.Layout>

  const config: Partial<Plotly.Config> = {
    displayModeBar: false,
    responsive: true,
  }

  // Handle click: extract year (y) and month index from x (month name)
  const handleClick = (event: Plotly.PlotMouseEvent) => {
    if (event.points && event.points.length > 0) {
      const pt = event.points[0]
      const yearVal = parseInt(String(pt.y), 10)
      const monthName = String(pt.x)
      const monthIdx = MONTH_NAMES.indexOf(monthName)
      if (!isNaN(yearVal) && monthIdx >= 0) {
        onCellClick(yearVal, monthIdx + 1)
      }
    }
  }

  return (
    <div className="panel chart-panel">
      <div className="chart-panel-header">
        <span className="chart-panel-title">Calendar Heatmap</span>
        <div className="chart-panel-controls">
          <button
            className={`btn-toggle ${colorScale === 'viridis' ? 'btn-toggle--active' : ''}`}
            onClick={() => setColorScale('viridis')}
          >
            Viridis
          </button>
          <button
            className={`btn-toggle ${colorScale === 'ylorrd' ? 'btn-toggle--active' : ''}`}
            onClick={() => setColorScale('ylorrd')}
          >
            YlOrRd
          </button>
        </div>
      </div>
      <div className="chart-container" style={{ height: Math.max(300, years.length * 22 + 100) }}>
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '100%' }}
          onClick={handleClick}
        />
      </div>
      <p className="chart-footnote">
        Source: NASA FIRMS MODIS + VIIRS, harmonized. Counts = harmonized hotspot detections.
        Click a cell to view anomaly detail.
      </p>
    </div>
  )
}
