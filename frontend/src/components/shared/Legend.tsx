import React from 'react'

interface LegendEntry {
  color: string
  label: string
}

interface LegendProps {
  title?: string
  entries?: LegendEntry[]
  colorscale?: Array<[number, string]>
  min?: number
  max?: number
  unit?: string
}

export default function Legend({ title, entries, colorscale, min, max, unit }: LegendProps) {
  if (entries && entries.length > 0) {
    return (
      <div className="legend">
        {title && <div className="legend-title">{title}</div>}
        <div className="legend-entries">
          {entries.map((e) => (
            <div key={e.label} className="legend-entry">
              <span
                className="legend-swatch"
                style={{ backgroundColor: e.color }}
              />
              <span className="legend-label">{e.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (colorscale && min !== undefined && max !== undefined) {
    // Build a linear gradient from the colorscale
    const gradientStops = colorscale
      .map(([t, c]) => `${c} ${(t * 100).toFixed(0)}%`)
      .join(', ')
    const gradient = `linear-gradient(to right, ${gradientStops})`

    return (
      <div className="legend">
        {title && <div className="legend-title">{title}</div>}
        <div className="legend-gradient-bar" style={{ background: gradient }} />
        <div className="legend-gradient-labels">
          <span className="text-mono">{min.toLocaleString()}</span>
          <span className="legend-unit">{unit ?? ''}</span>
          <span className="text-mono">{max.toLocaleString()}</span>
        </div>
      </div>
    )
  }

  return null
}
