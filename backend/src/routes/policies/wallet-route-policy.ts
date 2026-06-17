export function readWalletListLimit(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 20
  return Math.min(Math.floor(parsed), 100)
}

const BILLING_PENDING_STATUSES = new Set(['billing', 'billing_required', 'billing_failed'])
const IN_FLIGHT_VIDEO_STATUSES = new Set(['pending', 'processing', 'checking_defect'])

export function shouldExposePendingSettlement(input: {
  billingStatus?: unknown
  generationStatus?: unknown
}) {
  const billingStatus = String(input.billingStatus || '').toLowerCase()
  const generationStatus = String(input.generationStatus || '').toLowerCase()
  if (BILLING_PENDING_STATUSES.has(billingStatus)) return true
  return billingStatus === 'unbilled' && IN_FLIGHT_VIDEO_STATUSES.has(generationStatus)
}
