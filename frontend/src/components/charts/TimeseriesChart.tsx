import React, { useState } from 'react'
import Plot from 'react-plotly.js'
import type { TimeseriesPoint } from '../../api/types'
import EmptyState from '../shared/EmptyState'
import SkeletonLoader from '../shared/SkeletonLoader'

interface TimeseriesChartProps {
  data: TimeseriesPoint[]
  loading: boolean
}

export default function TimeseriesChart({ data, loading }: TimeseriesChartProps) {
  const [showModis, setShowModis] = useState(false)
  const [showViirs, setShowViirs] = useState(false)

  if (loading) {
    return (
      <div className="panel chart-panel">
        <div className="chart-panel-header">
          <span className="chart-panel-title">Time Series</span>
        </div>
        <SkeletonLoader rows={1} height={360} />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="panel chart-panel">
        <div className="chart-panel-header">
          <span className="chart-panel-title">Time Series</span>
        </div>
        <EmptyState
          message="No time series data yet."
          hint="Run an analysis to view monthly hotspot counts over time."
        />
      </div>
    )
  }

  const dates = data.map((d) => d.date)
  const harmonized = data.map((d) => d.count_harmonized)
  const rawModis = data.map((d) => d.count_raw_modis)
  const rawViirs = data.map((d) => d.count_raw_viirs)

  const plotData: Plotly.Data[] = [
    {
      type: 'scatter',
      mode: 'lines',
      x: dates,
      y: harmonized,
      name: 'Harmonized',
      line: { color: '#1C2024', width: 2 },
      hovertemplate: '%{x}<br>Harmonized: %{y:,}<extra></extra>',
    } as unknown as Plotly.Data,
  ]

  if (showModis) {
    plotData.push({
      type: 'scatter',
      mode: 'lines',
      x: dates,
      y: rawModis,
      name: 'Raw MODIS',
      line: { color: '#E05C1A', width: 1.5, dash: 'dot' },
      hovertemplate: '%{x}<br>Raw MODIS: %{y:,}<extra></extra>',
    } as unknown as Plotly.Data)
  }

  if (showViirs) {
    plotData.push({
      type: 'scatter',
      mode: 'lines',
      x: dates,
      y: rawViirs,
      name: 'Raw VIIRS',
      line: { color: '#1A6DE0', width: 1.5, dash: 'dot' },
      hovertemplate: '%{x}<br>Raw VIIRS: %{y:,}<extra></extra>',
    } as unknown as Plotly.Data)
  }

  // Build era shapes
  const shapes: Partial<Plotly.Shape>[] = [
    {
      type: 'rect',
      xref: 'x',
      yref: 'paper',
      x0: '2001-01',
      x1: '2011-12',
      y0: 0,
      y1: 1,
      fillcolor: '#eeeeee',
      opacity: 0.4,
      line: { width: 0 },
      layer: 'below',
    },
    {
      type: 'rect',
      xref: 'x',
      yref: 'paper',
      x0: '2012-01',
      x1: dates[dates.length - 1] || '2024-12',
      y0: 0,
      y1: 1,
      fillcolor: '#ddeeff',
      opacity: 0.3,
      line: { width: 0 },
      layer: 'below',
    },
  ]

  const annotations: any[] = [
    {
      x: '2006-01',
      y: 1,
      xref: 'x',
      yref: 'paper',
      text: 'MODIS only',
      showarrow: false,
      font: { size: 10, color: '#5B6169', family: 'IBM Plex Sans' },
      yanchor: 'top',
    },
    {
      x: '2017-01',
      y: 1,
      xref: 'x',
      yref: 'paper',
      text: 'Overlap era (harmonized)',
      showarrow: false,
      font: { size: 10, color: '#5B6169', family: 'IBM Plex Sans' },
      yanchor: 'top',
    },
  ]

  const layout: Partial<Plotly.Layout> = {
    margin: { t: 20, r: 20, b: 60, l: 70 },
    xaxis: {
      title: { text: 'Date', font: { size: 12 } },
      tickfont: { size: 11, family: 'IBM Plex Mono' },
      fixedrange: false,
    },
    yaxis: {
      title: { text: 'Harmonized Hotspot Count', font: { size: 12 } },
      tickfont: { size: 11, family: 'IBM Plex Mono' },
      fixedrange: false,
      rangemode: 'tozero',
    },
    font: { family: 'IBM Plex Sans', size: 12 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    showlegend: true,
    legend: { orientation: 'h', y: -0.2, font: { size: 11 } },
    shapes,
    annotations,
    height: 360,
  } as unknown as Partial<Plotly.Layout>

  const config: Partial<Plotly.Config> = {
    displayModeBar: false,
    responsive: true,
  }

  return (
    <div className="panel chart-panel">
      <div className="chart-panel-header">
        <span className="chart-panel-title">Time Series</span>
        <div className="chart-panel-controls">
          <button
            className={`btn-toggle ${showModis ? 'btn-toggle--active' : ''}`}
            onClick={() => setShowModis((v) => !v)}
          >
            Raw MODIS
          </button>
          <button
            className={`btn-toggle ${showViirs ? 'btn-toggle--active' : ''}`}
            onClick={() => setShowViirs((v) => !v)}
          >
            Raw VIIRS
          </button>
        </div>
      </div>
      <div className="chart-container" style={{ height: 360 }}>
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <p className="chart-footnote">
        Source: NASA FIRMS. Harmonized counts use cross-sensor scaling. Grey = MODIS-only era
        (2001–2011), Blue = overlap era (2012+).
      </p>
    </div>
  )
}
