import React from 'react'

interface SkeletonLoaderProps {
  rows?: number
  height?: number | string
  width?: number | string
}

export default function SkeletonLoader({
  rows = 3,
  height = 24,
  width = '100%',
}: SkeletonLoaderProps) {
  return (
    <div className="skeleton-loader" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton-block"
          style={{
            height,
            width: i === rows - 1 && rows > 1 ? '60%' : width,
          }}
        />
      ))}
    </div>
  )
}
