import { BN } from '@coral-xyz/anchor'

const MAX_U64 = new BN('18446744073709551615')
export const WAD = BigInt('1000000000000000000')

function sanitizeNumericInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Value is required')
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Invalid numeric format')
  }
  return trimmed
}

export function parseAmountToBN(amount: string, decimals: number): BN {
  const sanitized = sanitizeNumericInput(amount)
  const [wholePart, fractionalPart = ''] = sanitized.split('.')

  if (fractionalPart.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places`)
  }

  const paddedFraction = fractionalPart.padEnd(decimals, '0')
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+/, '') || '0'
  const bnAmount = new BN(combined)

  if (bnAmount.gt(MAX_U64)) {
    throw new Error('Amount exceeds maximum supported size')
  }

  return bnAmount
}

export function decimalToWad(value: string): BN {
  const sanitized = sanitizeNumericInput(value)
  const [wholePart, fractionalPart = ''] = sanitized.split('.')

  if (fractionalPart.length > 18) {
    throw new Error('Value supports at most 18 decimal places')
  }

  const paddedFraction = fractionalPart.padEnd(18, '0')
  const combined = `${wholePart}${paddedFraction}`.replace(/^0+/, '') || '0'

  return new BN(combined)
}

export function wadToDecimalString(value: bigint, precision = 4): string {
  const divisor = WAD
  const whole = value / divisor
  const fraction = value % divisor
  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionString = fraction.toString().padStart(18, '0').slice(0, precision)
  const trimmedFraction = fractionString.replace(/0+$/, '')

  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole.toString()
}

export function wadToPercentString(value: bigint, precision = 2): string {
  const percent = (value * 100n) / WAD
  const remainder = ((value * 100n) % WAD) / (WAD / 10n ** BigInt(precision))
  if (remainder === 0n) {
    return `${percent.toString()}%`
  }
  const fractional = remainder.toString().padStart(precision, '0').replace(/0+$/, '')
  return fractional.length > 0 ? `${percent.toString()}.${fractional}%` : `${percent.toString()}%`
}

export function formatTokenAmount(amount: bigint, decimals: number, precision = 4): string {
  if (decimals === 0) {
    return amount.toString()
  }

  const divisor = BigInt(10) ** BigInt(decimals)
  const whole = amount / divisor
  const fraction = amount % divisor

  if (fraction === 0n) {
    return whole.toString()
  }

  const fractionString = fraction.toString().padStart(decimals, '0').slice(0, precision)
  const trimmedFraction = fractionString.replace(/0+$/, '')

  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole.toString()
}
