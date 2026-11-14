import React from 'react'
import Plot from 'react-plotly.js'
import type { CalendarPoint } from '../../api/types'
import { MONTH_NAMES } from '../../utils/colorscales'
import EmptyState from '../shared/EmptyState'
import SkeletonLoader from '../shared/SkeletonLoader'

interface SeasonalityChartProps {
  data: CalendarPoint[]
  loading: boolean
}

export default function SeasonalityChart({ data, loading }: SeasonalityChartProps) {
  if (loading) {
    return (
      <div className="panel chart-panel">
        <div className="chart-panel-header">
          <span className="chart-panel-title">Seasonality (Avg / Month)</span>
        </div>
        <SkeletonLoader rows={1} height={300} />
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="panel chart-panel">
        <div className="chart-panel-header">
          <span className="chart-panel-title">Seasonality (Avg / Month)</span>
        </div>
        <EmptyState
          message="No seasonality data yet."
          hint="Run an analysis to view monthly average fire activity."
        />
      </div>
    )
  }

  // Compute average count per month across all years
  const monthSums: number[] = new Array(12).fill(0)
  const monthCounts: number[] = new Array(12).fill(0)

  for (const pt of data) {
    const idx = pt.month - 1
    if (idx >= 0 && idx < 12) {
      monthSums[idx] += pt.count
      monthCounts[idx] += 1
    }
  }

  const monthAvgs = monthSums.map((sum, i) =>
    monthCounts[i] > 0 ? sum / monthCounts[i] : 0,
  )

  const maxVal = Math.max(...monthAvgs)
  const barColors = monthAvgs.map((v) => {
    const t = maxVal > 0 ? v / maxVal : 0
    const r = Math.round(31 + (200 - 31) * t)
    const g = Math.round(78 + (100 - 78) * t)
    const b = Math.round(121 + (30 - 121) * t)
    return `rgb(${r},${g},${b})`
  })

  const plotData: Plotly.Data[] = [
    {
      type: 'bar',
      x: MONTH_NAMES,
      y: monthAvgs,
      marker: { color: barColors },
      hovertemplate: 'Month: %{x}<br>Avg Count: %{y:,.0f}<extra></extra>',
      name: 'Avg harmonized hotspots',
    } as unknown as Plotly.Data,
  ]

  const layout: Partial<Plotly.Layout> = {
    margin: { t: 20, r: 20, b: 60, l: 70 },
    xaxis: {
      title: { text: 'Month', font: { size: 12 } },
      tickfont: { size: 11, family: 'Inter, sans-serif' },
      fixedrange: true,
    },
    yaxis: {
      title: { text: 'Avg Hotspot Count', font: { size: 12 } },
      tickfont: { size: 11, family: 'Inter, sans-serif' },
      fixedrange: true,
      rangemode: 'tozero',
    },
    font: { family: 'Inter, sans-serif', size: 12 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    showlegend: false,
    height: 300,
  } as unknown as Partial<Plotly.Layout>

  const config: Partial<Plotly.Config> = {
    displayModeBar: false,
    responsive: true,
  }

  return (
    <div className="panel chart-panel">
      <div className="chart-panel-header">
        <span className="chart-panel-title">Seasonality (Avg / Month)</span>
      </div>
      <div className="chart-container" style={{ height: 300 }}>
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      <p className="chart-footnote">
        Average harmonized hotspot count per calendar month across all years in selected date range.
      </p>
    </div>
  )
}
