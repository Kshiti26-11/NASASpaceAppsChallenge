import { useState, useCallback } from 'react'
import { api } from '../api/client'
import type {
  Region,
  CalendarPoint,
  AnomalyResponse,
  SummaryResponse,
  TimeseriesPoint,
  HotspotsResponse,
} from '../api/types'

interface AnomalySelection {
  year: number
  month: number
}

interface LoadingStates {
  calendar: boolean
  anomaly: boolean
  summary: boolean
  timeseries: boolean
  hotspots: boolean
}

interface ErrorStates {
  calendar: string | null
  anomaly: string | null
  summary: string | null
  timeseries: string | null
  hotspots: string | null
}

interface UseAnalysisResult {
  runAnalysis: () => Promise<void>
  downloadCSV: () => Promise<void>
  calendar: CalendarPoint[]
  anomaly: AnomalyResponse | null
  summary: SummaryResponse | null
  timeseries: TimeseriesPoint[]
  hotspots: HotspotsResponse | null
  loading: LoadingStates
  error: ErrorStates
  selectedAnomalyMonth: AnomalySelection
  setSelectedAnomalyMonth: (sel: AnomalySelection) => void
  isAnyLoading: boolean
}

function extractError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (e.response && typeof e.response === 'object') {
      const r = e.response as Record<string, unknown>
      if (r.data && typeof r.data === 'object') {
        const d = r.data as Record<string, unknown>
        if (typeof d.detail === 'string') return d.detail
      }
    }
    if (typeof e.message === 'string') return e.message
  }
  return 'An unknown error occurred'
}

export function useAnalysis(
  region: Region | null,
  startDate: string,
  endDate: string,
): UseAnalysisResult {
  const [calendar, setCalendar] = useState<CalendarPoint[]>([])
  const [anomaly, setAnomaly] = useState<AnomalyResponse | null>(null)
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([])
  const [hotspots, setHotspots] = useState<HotspotsResponse | null>(null)
  const [selectedAnomalyMonth, setSelectedAnomalyMonth] =
    useState<AnomalySelection>({ year: 2024, month: 4 })

  const [loading, setLoading] = useState<LoadingStates>({
    calendar: false,
    anomaly: false,
    summary: false,
    timeseries: false,
    hotspots: false,
  })

  const [error, setError] = useState<ErrorStates>({
    calendar: null,
    anomaly: null,
    summary: null,
    timeseries: null,
    hotspots: null,
  })

  const runAnalysis = useCallback(async () => {
    if (!region) return

    const dateRangeBody = { region, start_date: startDate, end_date: endDate }

    // Reset errors
    setError({ calendar: null, anomaly: null, summary: null, timeseries: null, hotspots: null })

    // Set all loading
    setLoading({ calendar: true, anomaly: true, summary: true, timeseries: true, hotspots: true })

    // Run all in parallel
    const [calRes, sumRes, tsRes, hotRes] = await Promise.allSettled([
      api.postCalendar(dateRangeBody),
      api.postSummary(dateRangeBody),
      api.postTimeseries(dateRangeBody),
      api.postHotspots(dateRangeBody),
    ])

    if (calRes.status === 'fulfilled') {
      setCalendar(calRes.value.data)
    } else {
      setError((prev) => ({ ...prev, calendar: extractError(calRes.reason) }))
    }
    setLoading((prev) => ({ ...prev, calendar: false }))

    if (sumRes.status === 'fulfilled') {
      setSummary(sumRes.value.data)
    } else {
      setError((prev) => ({ ...prev, summary: extractError(sumRes.reason) }))
    }
    setLoading((prev) => ({ ...prev, summary: false }))

    if (tsRes.status === 'fulfilled') {
      setTimeseries(tsRes.value.data)
    } else {
      setError((prev) => ({ ...prev, timeseries: extractError(tsRes.reason) }))
    }
    setLoading((prev) => ({ ...prev, timeseries: false }))

    if (hotRes.status === 'fulfilled') {
      setHotspots(hotRes.value.data)
    } else {
      setError((prev) => ({ ...prev, hotspots: extractError(hotRes.reason) }))
    }
    setLoading((prev) => ({ ...prev, hotspots: false }))

    // Anomaly fetch uses selected month clamped to valid bounds
    try {
      const yearToQuery = Math.min(Math.max(Number(selectedAnomalyMonth.year) || 2024, 2001), 2024)
      const anomalyRes = await api.postAnomaly({
        region,
        year: yearToQuery,
        month: selectedAnomalyMonth.month || 4,
      })
      setAnomaly(anomalyRes.data)
    } catch (err) {
      setError((prev) => ({ ...prev, anomaly: extractError(err) }))
    }
    setLoading((prev) => ({ ...prev, anomaly: false }))
  }, [region, startDate, endDate, selectedAnomalyMonth])

  const downloadCSV = useCallback(async () => {
    if (!region) return
    const body = { region, start_date: startDate, end_date: endDate }
    const res = await api.downloadCSV(body)
    const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]))
    const a = document.createElement('a')
    a.href = url
    a.download = `hotspots_${startDate}_${endDate}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }, [region, startDate, endDate])

  const isAnyLoading = Object.values(loading).some(Boolean)

  return {
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
  }
}
