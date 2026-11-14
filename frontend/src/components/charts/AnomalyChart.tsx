import React from 'react'
import Plot from 'react-plotly.js'
import type { AnomalyResponse } from '../../api/types'
import { formatPct, formatMonthName } from '../../utils/format'
import EmptyState from '../shared/EmptyState'
import SkeletonLoader from '../shared/SkeletonLoader'

interface AnomalyChartProps {
  data: AnomalyResponse | null
  loading: boolean
}

export default function AnomalyChart({ data, loading }: AnomalyChartProps) {
  if (loading) {
    return (
      <div className="panel chart-panel">
        <div className="chart-panel-header">
          <span className="chart-panel-title">Monthly Anomaly</span>
        </div>
        <SkeletonLoader rows={1} height={300} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="panel chart-panel">
        <div className="chart-panel-header">
          <span className="chart-panel-title">Monthly Anomaly</span>
        </div>
        <EmptyState
          message="No anomaly data yet."
          hint="Click a cell in the calendar heatmap or run analysis to see anomaly."
        />
      </div>
    )
  }

  const years = data.historical.map((h) => h.year)
  const counts = data.historical.map((h) => h.count)
  const median = data.median

  // Color bars by anomaly relative to median
  const barColors = counts.map((c) => {
    const diff = c - median
    if (Math.abs(diff) < 0.01) return '#aaaaaa'
    if (diff > 0) {
      // Warm: scale from light orange to deep red
      const intensity = Math.min(1, diff / (Math.max(...counts) - median || 1))
      const r = Math.round(180 + 75 * intensity)
      const g = Math.round(80 - 60 * intensity)
      const b = Math.round(50 - 40 * intensity)
      return `rgb(${r},${g},${b})`
    } else {
      // Cool: scale from light blue to deep blue
      const intensity = Math.min(1, Math.abs(diff) / (median - Math.min(...counts) || 1))
      const r = Math.round(100 - 80 * intensity)
      const g = Math.round(130 - 50 * intensity)
      const b = Math.round(200 + 55 * intensity)
      return `rgb(${r},${g},${b})`
    }
  })

  // Highlight selected year
  const selectedIdx = years.indexOf(data.year)
  if (selectedIdx >= 0) {
    barColors[selectedIdx] = '#1F4E79'
  }

  const plotData: Plotly.Data[] = [
    {
      type: 'bar',
      x: years,
      y: counts,
      marker: { color: barColors },
      hovertemplate: 'Year: %{x}<br>Count: %{y:,}<br>Dev. from median: %{customdata:+,.0f}<extra></extra>',
      customdata: counts.map((c) => c - median),
      name: 'Annual count',
    } as unknown as Plotly.Data,
    {
      type: 'scatter',
      mode: 'lines',
      x: [years[0], years[years.length - 1]],
      y: [median, median],
      line: { dash: 'dash', color: '#5B6169', width: 1.5 },
      name: `Median: ${median.toLocaleString()}`,
      hoverinfo: 'skip',
    } as unknown as Plotly.Data,
  ]

  const monthName = formatMonthName(data.month)
  const anomalyPct = data.anomaly_pct
  const direction = anomalyPct >= 0 ? 'above' : 'below'
  const pctStr = formatPct(anomalyPct)
  const pctColor = anomalyPct >= 0 ? '#b22222' : '#1a3c8e'

  const layout: Partial<Plotly.Layout> = {
    title: {
      text: `${monthName} ${data.year}: ${pctStr} ${direction} median`,
      font: { size: 13, family: 'IBM Plex Sans' },
      x: 0,
      xref: 'paper',
    },
    margin: { t: 50, r: 20, b: 60, l: 70 },
    xaxis: {
      title: { text: 'Year', font: { size: 12 } },
      tickfont: { size: 11, family: 'IBM Plex Mono' },
      fixedrange: true,
    },
    yaxis: {
      title: { text: 'Hotspot Count', font: { size: 12 } },
      tickfont: { size: 11, family: 'IBM Plex Mono' },
      fixedrange: true,
      rangemode: 'tozero',
    },
    font: { family: 'IBM Plex Sans', size: 12 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    showlegend: true,
    legend: { orientation: 'h', y: -0.2, font: { size: 11 } },
    height: 320,
  } as unknown as Partial<Plotly.Layout>

  const config: Partial<Plotly.Config> = {
    displayModeBar: false,
    responsive: true,
  }

  return (
    <div className="panel chart-panel">
      <div className="chart-panel-header">
        <span className="chart-panel-title">Monthly Anomaly — {monthName}</span>
        <div className="anomaly-badges">
          <span className="anomaly-badge" style={{ color: pctColor }}>
            {pctStr}
          </span>
          <span className="anomaly-percentile">
            {data.percentile_rank.toFixed(0)}th percentile
          </span>
        </div>
      </div>
      <div className="chart-container" style={{ height: 320 }}>
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <p className="chart-footnote">
        Source: NASA FIRMS MODIS + VIIRS, harmonized. Dashed line = historical median for {monthName}.
      </p>
    </div>
  )
}
