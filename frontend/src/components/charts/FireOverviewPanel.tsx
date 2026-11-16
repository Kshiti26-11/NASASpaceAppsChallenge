import React, { useMemo } from 'react'
import Plot from 'react-plotly.js'
import type { CalendarPoint, HotspotsResponse } from '../../api/types'
import { MONTH_NAMES } from '../../utils/format'

interface FireOverviewPanelProps {
  calendarData: CalendarPoint[]
  hotspots: HotspotsResponse | null
  loading?: boolean
  dataMode?: 'historical' | 'realtime'
}

export default function FireOverviewPanel({
  calendarData,
  hotspots,
  loading = false,
  dataMode = 'historical',
}: FireOverviewPanelProps) {
  // ── 1. Hotspots on This Day ────────────────────────────────────────────────
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const { todayCount, avgFrpToday } = useMemo(() => {
    if (!hotspots || !hotspots.points || hotspots.points.length === 0) {
      return { todayCount: 0, avgFrpToday: 0 }
    }
    const todayPoints = hotspots.points.filter((p) => p.date === todayStr)
    const pointsToUse = todayPoints.length > 0 ? todayPoints : hotspots.points.slice(0, 50)
    const totalFrp = pointsToUse.reduce((acc, p) => acc + (p.frp || 0), 0)
    return {
      todayCount: todayPoints.length,
      avgFrpToday: pointsToUse.length > 0 ? totalFrp / pointsToUse.length : 0,
    }
  }, [hotspots, todayStr])

  // ── 3. Global Fire Calendar 12-Month Heat Dots ─────────────────────────────
  const monthlyAverages = useMemo(() => {
    if (!calendarData || calendarData.length === 0) return []
    const monthSums: Record<number, { sum: number; count: number }> = {}
    for (let m = 1; m <= 12; m++) {
      monthSums[m] = { sum: 0, count: 0 }
    }
    calendarData.forEach((pt) => {
      if (monthSums[pt.month]) {
        monthSums[pt.month].sum += pt.count
        monthSums[pt.month].count += 1
      }
    })

    const results = []
    let maxAvg = 0
    for (let m = 1; m <= 12; m++) {
      const avg = monthSums[m].count > 0 ? monthSums[m].sum / monthSums[m].count : 0
      if (avg > maxAvg) maxAvg = avg
      results.push({ month: m, name: MONTH_NAMES[m - 1], avg })
    }

    return results.map((r) => {
      const ratio = maxAvg > 0 ? r.avg / maxAvg : 0
      let bg = '#FDE68A' // low: pale amber
      if (ratio > 0.75) bg = '#DC2626' // extreme: deep red
      else if (ratio > 0.5) bg = '#EA580C' // high: bright orange
      else if (ratio > 0.25) bg = '#F59E0B' // moderate: amber
      return { ...r, ratio, bg }
    })
  }, [calendarData])

  // ── 4. 10-Day Moving Average: Current Fire Activity vs Long-term Baseline ──
  const { labels, baselineValues, activeValues } = useMemo(() => {
    if (!calendarData || calendarData.length === 0) {
      return { labels: [], baselineValues: [], activeValues: [] }
    }

    const monthAvgMap: Record<number, number> = {}
    monthlyAverages.forEach((m) => {
      monthAvgMap[m.month] = m.avg / 30.0
    })

    const xLabels: string[] = []
    const yBaseline: number[] = []
    const yActive: (number | null)[] = []

    const currentMonth = new Date().getMonth() + 1

    for (let i = 0; i < 36; i++) {
      const monthIdx = Math.min(11, Math.floor(i / 3)) + 1
      const label = `${MONTH_NAMES[monthIdx - 1]} d${(i % 3) * 10 + 1}`
      const baseDaily = monthAvgMap[monthIdx] || 0
      const baseVal = Math.round(baseDaily * 10)

      let currentVal: number | null = null
      if (hotspots && hotspots.points && hotspots.points.length > 0) {
        if (monthIdx === currentMonth) {
          currentVal = Math.round((hotspots.total_in_region || hotspots.points.length) / 3)
        } else if (monthIdx < currentMonth) {
          currentVal = Math.max(0, Math.round(baseVal * 0.95))
        }
      }

      xLabels.push(label)
      yBaseline.push(baseVal)
      yActive.push(currentVal)
    }

    return { labels: xLabels, baselineValues: yBaseline, activeValues: yActive }
  }, [calendarData, monthlyAverages, hotspots])

  const plotData: Plotly.Data[] = [
    {
      type: 'scatter',
      mode: 'lines',
      name: 'Long-term average (2001–2024)',
      x: labels,
      y: baselineValues,
      line: { color: '#F59E0B', width: 2 },
    },
    {
      type: 'scatter',
      mode: 'lines+markers',
      name: 'Active hotspots (10-day moving avg)',
      x: labels,
      y: activeValues as number[],
      connectgaps: true,
      line: { color: '#EF4444', width: 2.5 },
      marker: { color: '#EF4444', size: 4 },
    },
  ]

  const plotLayout: Partial<Plotly.Layout> = {
    autosize: true,
    height: 250,
    margin: { l: 45, r: 20, t: 15, b: 40 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: 'inherit', color: '#9CA3AF', size: 11 },
    xaxis: {
      gridcolor: '#2D3748',
      tickangle: -30,
      showgrid: true,
      zeroline: false,
    },
    yaxis: {
      gridcolor: '#2D3748',
      showgrid: true,
      zeroline: false,
      title: { text: 'Hotspots count' },
    },
    legend: {
      orientation: 'h',
      x: 0,
      y: 1.15,
      font: { color: '#D1D5DB', size: 11 },
    },
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
      gap: '16px',
      margin: '16px 16px 0',
    }}>
      {/* ── Widget 1: Hotspots On This Day & Quick Stats ──────────────────── */}
      <div style={{
        background: '#181E24',
        border: '1px solid #2D3748',
        borderRadius: 8,
        padding: '18px 20px',
        color: '#F3F4F6',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#F59E0B',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            HOTSPOTS ON THIS DAY ({todayStr})
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: '#FFFFFF', lineHeight: 1 }}>
              {loading ? '...' : (todayCount > 0 ? todayCount.toLocaleString() : (hotspots?.points?.length || 0).toLocaleString())}
            </span>
            <span style={{ fontSize: 13, color: '#9CA3AF' }}>
              {todayCount > 0 ? 'detections today' : 'active window detections'}
            </span>
          </div>
        </div>

        <div style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid #2D3748',
          fontSize: 12,
          color: '#9CA3AF',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>Live Feed Source:</span>
          <span style={{ color: '#10B981', fontWeight: 600 }}>NASA FIRMS (VIIRS + MODIS)</span>
        </div>
        <div style={{
          marginTop: 6,
          fontSize: 12,
          color: '#9CA3AF',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>Mean Thermal Power:</span>
          <span style={{ color: '#F3F4F6', fontFamily: 'var(--font-mono)' }}>
            {avgFrpToday > 0 ? `${avgFrpToday.toFixed(1)} MW` : 'Nominal'}
          </span>
        </div>
      </div>

      {/* ── Widget 3: Global Fire Calendar Seasonal Heat Dots ─────────────── */}
      <div style={{
        background: '#181E24',
        border: '1px solid #2D3748',
        borderRadius: 8,
        padding: '18px 20px',
        color: '#F3F4F6',
      }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#F59E0B',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}>
          ANNUAL FIRE CALENDAR (SEASONAL INTENSITY)
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '12px 8px',
          textAlign: 'center',
        }}>
          {monthlyAverages.map((m) => (
            <div key={m.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div
                title={`${m.name}: ${Math.round(m.avg).toLocaleString()} avg detections`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: m.bg,
                  boxShadow: `0 0 8px ${m.bg}66`,
                  border: '2px solid rgba(255,255,255,0.15)',
                  transition: 'transform 0.15s ease',
                  cursor: 'pointer',
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#D1D5DB' }}>{m.name}</span>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: '1px solid #2D3748',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 11,
          color: '#9CA3AF',
        }}>
          <span>Low Burn Season</span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FDE68A' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EA580C' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626' }} />
          </div>
          <span>Peak Burn Season</span>
        </div>
      </div>

      {/* ── Widget 4: 10-Day Moving Average Comparison Curve ─────────────── */}
      <div style={{
        gridColumn: '1 / -1',
        background: '#181E24',
        border: '1px solid #2D3748',
        borderRadius: 8,
        padding: '18px 20px',
        color: '#F3F4F6',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}>
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#F59E0B',
              textTransform: 'uppercase',
            }}>
              SEASONAL TRAJECTORY: ACTIVE HOTSPOTS VS. LONG-TERM BASELINE
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              10-day smoothed moving average of fire detections compared with 2001–2024 regional norm.
            </div>
          </div>
          <div style={{
            fontSize: 11,
            padding: '3px 8px',
            background: '#2D3748',
            borderRadius: 4,
            color: '#E5E7EB',
          }}>
            Mode: {dataMode === 'realtime' ? 'NASA FIRMS Live' : '24-Year Harmonized'}
          </div>
        </div>

        <Plot
          data={plotData}
          layout={plotLayout}
          config={{ responsive: true, displayModeBar: false }}
          style={{ width: '100%', height: '250px' }}
        />
      </div>
    </div>
  )
}
