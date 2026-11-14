import React from 'react'

interface LoadingSpinnerProps {
  size?: number
  label?: string
}

export default function LoadingSpinner({ size = 24, label = 'Loading...' }: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner-wrap" role="status" aria-label={label}>
      <div
        className="loading-spinner"
        style={{ width: size, height: size }}
      />
      {label && <span className="loading-spinner-label">{label}</span>}
    </div>
  )
}
