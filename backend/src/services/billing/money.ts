import Decimal from 'decimal.js'

Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_UP })

export type MoneyString = string

export function money(value: string | number | Decimal) {
  return new Decimal(value).toDecimalPlaces(2)
}

export function toMoney(value: string | number | Decimal): MoneyString {
  return new Decimal(value).toDecimalPlaces(2).toFixed(2)
}

export function multiplyMoney(left: string | number | Decimal, right: string | number | Decimal) {
  return new Decimal(left).mul(new Decimal(right)).toDecimalPlaces(2)
}

function assertTwoDecimalString(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^\d+(\.\d{2})$/.test(value)) {
    throw new Error(`${label} must be a two decimal yuan string`)
  }
  return value
}

function normalizeRechargeYuanInput(value: unknown) {
  const raw = typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : ''

  if (!/^\d+(\.\d{0,2})?$/.test(raw)) {
    throw new Error('Recharge amount must be a yuan amount with up to two decimals')
  }
  return toMoney(raw)
}

export function assertRechargeAmount(value: unknown): MoneyString {
  const raw = normalizeRechargeYuanInput(value)
  const amount = money(raw)
  if (amount.lt('1.00') || amount.gt('9999.00')) {
    throw new Error('Recharge amount must be between 1.00 and 9999.00')
  }
  return amount.toFixed(2)
}

export function assertBillingPrice(value: unknown): MoneyString {
  const raw = assertTwoDecimalString(value, 'Billing price')
  const amount = money(raw)
  if (amount.lt('0.01') || amount.gt('999.99')) {
    throw new Error('Billing price must be between 0.01 and 999.99')
  }
  return amount.toFixed(2)
}

export function assertSeconds(value: unknown): MoneyString {
  const text = typeof value === 'number' ? value.toFixed(2) : String(value ?? '')
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error('Seconds must be a positive decimal value')
  }
  return toMoney(text)
}
