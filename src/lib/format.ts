import type { PressureBand } from '../types/data'

export function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-SG').format(value)
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-SG', {
    style: 'percent',
    maximumFractionDigits: value < 0.2 ? 1 : 0,
  }).format(value)
}

export function formatDistance(value: number) {
  if (!Number.isFinite(value)) {
    return 'N/A'
  }

  return `${value.toFixed(value < 2 ? 2 : 1)} km`
}

export function pressureLabel(band: PressureBand) {
  switch (band) {
    case 'low':
      return 'Lower pressure'
    case 'steady':
      return 'Steady demand'
    case 'elevated':
      return 'Elevated demand'
    case 'oversubscribed':
      return 'Oversubscribed snapshot'
    default:
      return 'No pressure label'
  }
}

export function pressureTone(band: PressureBand) {
  switch (band) {
    case 'low':
      return 'tone-low'
    case 'steady':
      return 'tone-steady'
    case 'elevated':
      return 'tone-elevated'
    case 'oversubscribed':
      return 'tone-oversubscribed'
    default:
      return 'tone-neutral'
  }
}

export function titleCase(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
