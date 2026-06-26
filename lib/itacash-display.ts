export const ITACASH_ICON_SRC = '/itacash.png'

export type ItaCashIconConfig = {
  label: 'ItaCash'
  imageSrc: string | null
  fallbackText: 'IC'
}

export function getItaCashIconConfig(hasImage = true): ItaCashIconConfig {
  return {
    label: 'ItaCash',
    imageSrc: hasImage ? ITACASH_ICON_SRC : null,
    fallbackText: 'IC',
  }
}

export function formatItaCashAmount(value: number | string | null | undefined) {
  const numericValue = typeof value === 'number' ? value : Number(value || 0)
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0
  const hasFraction = !Number.isInteger(safeValue)

  return safeValue.toLocaleString('pt-BR', {
    maximumFractionDigits: hasFraction ? 2 : 0,
    minimumFractionDigits: 0,
  })
}

export function getItaCashAmountLabel(value: number | string | null | undefined) {
  return `${formatItaCashAmount(value)} ItaCash`
}
