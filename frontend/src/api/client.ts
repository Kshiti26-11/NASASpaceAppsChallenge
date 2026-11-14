import axios from 'axios'
import type {
  MetaResponse,
  CalendarPoint,
  CalendarRequest,
  AnomalyResponse,
  AnomalyRequest,
  SummaryResponse,
  TimeseriesPoint,
  HotspotsResponse,
  DateRangeRequest,
} from './types'

const axiosInstance = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

export const api = {
  getMeta: () => axiosInstance.get<MetaResponse>('/meta'),

  postCalendar: (body: CalendarRequest) =>
    axiosInstance.post<CalendarPoint[]>('/calendar', body),

  postAnomaly: (body: AnomalyRequest) =>
    axiosInstance.post<AnomalyResponse>('/anomaly', body),

  postSummary: (body: DateRangeRequest) =>
    axiosInstance.post<SummaryResponse>('/summary', body),

  postTimeseries: (body: DateRangeRequest) =>
    axiosInstance.post<TimeseriesPoint[]>('/timeseries', body),

  postHotspots: (body: DateRangeRequest) =>
    axiosInstance.post<HotspotsResponse>('/hotspots', body),

  downloadCSV: (body: DateRangeRequest) =>
    axiosInstance.post('/hotspots-csv', body, { responseType: 'blob' }),
}

export default axiosInstance
