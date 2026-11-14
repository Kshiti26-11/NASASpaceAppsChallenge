// Viridis colorscale (Plotly format)
export const VIRIDIS_SCALE: Array<[number, string]> = [
  [0, '#440154'],
  [0.1, '#482878'],
  [0.2, '#3e4989'],
  [0.3, '#31688e'],
  [0.4, '#26828e'],
  [0.5, '#1f9e89'],
  [0.6, '#35b779'],
  [0.7, '#6ece58'],
  [0.8, '#b5de2b'],
  [1, '#fde725'],
]

// YlOrRd colorscale
export const YLORRD_SCALE: Array<[number, string]> = [
  [0, '#ffffcc'],
  [0.125, '#ffeda0'],
  [0.25, '#fed976'],
  [0.375, '#feb24c'],
  [0.5, '#fd8d3c'],
  [0.625, '#fc4e2a'],
  [0.75, '#e31a1c'],
  [0.875, '#bd0026'],
  [1, '#800026'],
]

// Blue-White-Red diverging scale for anomalies
export const DIVERGING_SCALE: Array<[number, string]> = [
  [0, '#2166ac'],
  [0.1, '#4393c3'],
  [0.2, '#92c5de'],
  [0.3, '#d1e5f0'],
  [0.4, '#f7f7f7'],
  [0.5, '#f7f7f7'],
  [0.6, '#fddbc7'],
  [0.7, '#f4a582'],
  [0.8, '#d6604d'],
  [0.9, '#b2182b'],
  [1, '#67001f'],
]

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 0, 0]
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
  )
}

export function getColor(
  value: number,
  min: number,
  max: number,
  scale: Array<[number, string]>,
): string {
  if (max === min) return scale[0][1]
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))

  let lower = scale[0]
  let upper = scale[scale.length - 1]

  for (let i = 0; i < scale.length - 1; i++) {
    if (t >= scale[i][0] && t <= scale[i + 1][0]) {
      lower = scale[i]
      upper = scale[i + 1]
      break
    }
  }

  const range = upper[0] - lower[0]
  const localT = range === 0 ? 0 : (t - lower[0]) / range

  const [r1, g1, b1] = hexToRgb(lower[1])
  const [r2, g2, b2] = hexToRgb(upper[1])

  return rgbToHex(
    r1 + (r2 - r1) * localT,
    g1 + (g2 - g1) * localT,
    b1 + (b2 - b1) * localT,
  )
}
