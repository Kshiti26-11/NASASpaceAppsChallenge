import React from 'react'
import type { SummaryResponse } from '../../api/types'
import { formatCount, formatMonthName, formatSlope } from '../../utils/format'
import SkeletonLoader from '../shared/SkeletonLoader'

interface SummaryCardsProps {
  summary: SummaryResponse | null
  loading: boolean
}

interface CardProps {
  label: string
  value: string
  subValue?: string
  indicator?: 'up' | 'down' | 'neutral'
}

function StatCard({ label, value, subValue, indicator }: CardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-label label">{label}</div>
      <div className="stat-card-value text-mono">
        {value}
        {indicator === 'up' && (
          <span className="stat-trend stat-trend--up" aria-label="increasing">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </span>
        )}
        {indicator === 'down' && (
          <span className="stat-trend stat-trend--down" aria-label="decreasing">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        )}
      </div>
      {subValue && <div className="stat-card-sub">{subValue}</div>}
    </div>
  )
}

export default function SummaryCards({ summary, loading }: SummaryCardsProps) {
  if (loading) {
    return (
      <div className="summary-cards">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="stat-card">
            <SkeletonLoader rows={2} height={18} />
          </div>
        ))}
      </div>
    )
  }

  if (!summary) return null

  const trendIndicator: 'up' | 'down' | 'neutral' =
    summary.trend_slope === null
      ? 'neutral'
      : summary.trend_slope > 0
        ? 'up'
        : 'down'

  return (
    <div className="summary-cards">
      <StatCard
        label="Total Hotspots"
        value={formatCount(summary.total_fires)}
        subValue="harmonized detections"
      />
      <StatCard
        label="Peak Year"
        value={String(summary.peak_year)}
        subValue={`${formatCount(summary.peak_year_count)} hotspots`}
      />
      <StatCard
        label="Peak Month"
        value={formatMonthName(summary.peak_month)}
      />
      <StatCard
        label="Avg / Year"
        value={formatCount(Math.round(summary.avg_per_year))}
        subValue="harmonized hotspots"
      />
      <StatCard
        label="Trend"
        value={formatSlope(summary.trend_slope)}
        indicator={trendIndicator}
      />
    </div>
  )
}
