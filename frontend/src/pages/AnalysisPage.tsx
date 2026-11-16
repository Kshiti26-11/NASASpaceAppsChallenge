import { useState, useEffect } from 'react'
import type { Region } from '../api/types'
import { useMeta } from '../hooks/useMeta'
import { useAnalysis } from '../hooks/useAnalysis'

import ControlPanel from '../components/controls/ControlPanel'
import SummaryCards from '../components/cards/SummaryCards'
import MapPanel from '../components/map/MapPanel'
import CalendarHeatmap from '../components/charts/CalendarHeatmap'
import AnomalyChart from '../components/charts/AnomalyChart'
import TimeseriesChart from '../components/charts/TimeseriesChart'
import SeasonalityChart from '../components/charts/SeasonalityChart'
import ErrorBanner from '../components/shared/ErrorBanner'

export default function AnalysisPage() {
  const { meta, error: metaError } = useMeta()

  // Data mode: historical analysis vs near real-time feed
  const [dataMode, setDataMode] = useState<'historical' | 'realtime'>('historical')

  // Default region: Gujarat, India
  const [region, setRegion] = useState<Region>({
    bbox: { west: 68.0, south: 20.0, east: 75.0, north: 25.0 },
  })

  // Date range defaults: 2001-01-01 to 2024-12-31 (or from meta)
  const [startDate, setStartDate] = useState('2001-01-01')
  const [endDate, setEndDate] = useState('2024-12-31')

  const isHistorical = dataMode === 'historical'

  const {
    runAnalysis,
    downloadCSV,
    calendar,
    anomaly,
    summary,
    timeseries,
    hotspots,
    loading,
    error,
    selectedAnomalyMonth,
    setSelectedAnomalyMonth,
    isAnyLoading,
  } = useAnalysis(region, startDate, endDate, !isHistorical)

  // Auto-run analysis on landing & whenever dataMode changes
  useEffect(() => {
    runAnalysis()
  }, [runAnalysis, dataMode])

  // Update date bounds once meta loads
  useEffect(() => {
    if (meta) {
      setStartDate(`${meta.min_year}-01-01`)
      setEndDate(`${meta.max_year}-12-31`)
      setSelectedAnomalyMonth({ year: meta.max_year, month: 4 })
    }
  }, [meta, setSelectedAnomalyMonth])

  // Callback when a cell in the heatmap is clicked
  const handleCalendarCellClick = (year: number, month: number) => {
    setSelectedAnomalyMonth({ year, month })
  }

  // Combined error message if any occurred
  const anyErrorMessage =
    error.calendar ||
    error.anomaly ||
    error.summary ||
    error.timeseries ||
    error.hotspots ||
    metaError

  return (
    <div className="analysis-layout">
      {/* ── Left Sidebar: Controls ───────────────────────────────────── */}
      <ControlPanel
        region={region}
        onRegionChange={setRegion}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        selectedAnomalyMonth={selectedAnomalyMonth}
        onAnomalyMonthChange={setSelectedAnomalyMonth}
        onRunAnalysis={runAnalysis}
        onDownloadCSV={downloadCSV}
        loading={isAnyLoading}
        meta={meta}
        dataMode={dataMode}
        onDataModeChange={setDataMode}
      />

      {/* ── Main Work Area ───────────────────────────────────────────── */}
      <div className="main-content">
        {anyErrorMessage && (
          <ErrorBanner
            message={anyErrorMessage}
            onRetry={runAnalysis}
          />
        )}

        {/* Near Real-Time banner */}
        {!isHistorical && (
          <div style={{
            margin: '16px 16px 0',
            padding: '12px 16px',
            background: '#FFF8E1',
            border: '1px solid #FFD54F',
            borderLeft: '4px solid #FF8F00',
            borderRadius: 4,
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            <strong>Near Real-Time Mode:</strong> Active satellite detections streamed directly from NASA FIRMS (VIIRS NOAA-20 &amp; MODIS).
            Switch to <strong>Historical Analysis</strong> mode for full 2001-2024 decadal anomaly, seasonality, and calendar charts.
          </div>
        )}

        {/* 1. Summary Cards — historical only */}
        {isHistorical && <SummaryCards summary={summary} loading={loading.summary} />}

        {/* 2. Interactive Map — always visible, MUST have explicit pixel height */}
        <div style={{
          width: '100%',
          height: 450,
          border: '1px solid var(--border)',
          borderRadius: 4,
          overflow: 'hidden',
          margin: '0 0 0 0',
          flexShrink: 0,
          position: 'relative',
        }}>
          <MapPanel
            region={region}
            onRegionChange={setRegion}
            hotspots={hotspots}
            loading={loading.hotspots}
            dataMode={dataMode}
          />
        </div>

        {/* 3–5: Historical charts only */}
        {isHistorical && (
          <>
            <div style={{ padding: '16px 16px 0' }}>
              <CalendarHeatmap
                data={calendar}
                loading={loading.calendar}
                onCellClick={handleCalendarCellClick}
              />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '16px',
              padding: '16px 16px 0',
            }}>
              <AnomalyChart data={anomaly} loading={loading.anomaly} />
              <SeasonalityChart data={calendar} loading={loading.calendar} />
            </div>

            <div style={{ padding: '16px 16px 24px' }}>
              <TimeseriesChart data={timeseries} loading={loading.timeseries} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
