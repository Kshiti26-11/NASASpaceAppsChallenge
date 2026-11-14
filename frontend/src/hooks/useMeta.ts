import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { MetaResponse } from '../api/types'

interface UseMetaResult {
  meta: MetaResponse | null
  loading: boolean
  error: string | null
}

export function useMeta(): UseMetaResult {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    api
      .getMeta()
      .then((res) => {
        if (!cancelled) {
          setMeta(res.data)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              'Failed to load metadata',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { meta, loading, error }
}
