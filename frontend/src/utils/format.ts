export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export const MONTH_NAMES_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Format a number with comma separators
 */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * Format a percentage with sign and one decimal
 */
export function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

/**
 * Format a YYYY-MM date string to "Jan 2024"
 */
export function formatDate(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const monthIdx = parseInt(month, 10) - 1
  return `${MONTH_NAMES[monthIdx] ?? month} ${year}`
}

/**
 * Format month number (1-12) to full month name
 */
export function formatMonthName(month: number): string {
  return MONTH_NAMES_FULL[month - 1] ?? String(month)
}

/**
 * Format month number (1-12) to short name
 */
export function formatMonthShort(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month)
}

/**
 * Format a trend slope as "+X fires/yr" or "-X fires/yr"
 */
export function formatSlope(slope: number | null): string {
  if (slope === null) return 'N/A'
  const sign = slope >= 0 ? '+' : ''
  return `${sign}${slope.toFixed(1)} fires/yr`
}
