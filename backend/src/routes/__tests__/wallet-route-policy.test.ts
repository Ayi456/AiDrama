import assert from 'node:assert/strict'

import {
  buildPendingSettlementInFlightCutoffs,
  buildWalletPageMeta,
  buildWalletPaginatedPayload,
  readWalletPagination,
  readWalletListLimit,
  shouldExposePendingSettlement,
} from '../policies/wallet-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('readWalletListLimit defaults, clamps, and ignores invalid values', () => {
  assert.equal(readWalletListLimit(undefined), 20)
  assert.equal(readWalletListLimit('abc'), 20)
  assert.equal(readWalletListLimit('0'), 20)
  assert.equal(readWalletListLimit('5'), 5)
  assert.equal(readWalletListLimit('500'), 100)
})

runTest('readWalletPagination defaults, clamps, and computes offsets', () => {
  assert.deepEqual(readWalletPagination({}), { page: 1, pageSize: 10, offset: 0 })
  assert.deepEqual(readWalletPagination({ page: '3', pageSize: '10' }), { page: 3, pageSize: 10, offset: 20 })
  assert.deepEqual(readWalletPagination({ page: '-1', pageSize: '0' }), { page: 1, pageSize: 10, offset: 0 })
  assert.deepEqual(readWalletPagination({ page: '2', limit: '5' }), { page: 2, pageSize: 5, offset: 5 })
  assert.deepEqual(readWalletPagination({ page: '2', pageSize: '500' }), { page: 2, pageSize: 50, offset: 50 })
})

runTest('buildWalletPageMeta clamps page to available total pages', () => {
  assert.deepEqual(buildWalletPageMeta({ page: 9, pageSize: 10 }, 42), {
    page: 5,
    pageSize: 10,
    total: 42,
    totalPages: 5,
    offset: 40,
  })
  assert.deepEqual(buildWalletPageMeta({ page: 4, pageSize: 10 }, 0), {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    offset: 0,
  })
})

runTest('buildWalletPaginatedPayload wraps items with pagination metadata', () => {
  assert.deepEqual(
    buildWalletPaginatedPayload(['a', 'b'], { page: 2, pageSize: 10, total: 12, totalPages: 2 }),
    { items: ['a', 'b'], page: 2, pageSize: 10, total: 12, totalPages: 2 },
  )
})

runTest('pending settlement list includes in-flight unbilled video generations', () => {
  const nowMs = Date.parse('2026-06-17T12:00:00.000Z')
  const recentUpdatedAt = new Date(nowMs - 5 * 60 * 1000).toISOString()
  const staleUpdatedAt = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString()
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'unbilled',
    generationStatus: 'pending',
    taskId: null,
    updatedAt: recentUpdatedAt,
    nowMs,
  }), true)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'unbilled',
    generationStatus: 'processing',
    taskId: 'task-1',
    updatedAt: recentUpdatedAt,
    nowMs,
  }), true)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'unbilled',
    generationStatus: 'checking_defect',
    taskId: 'task-2',
    updatedAt: recentUpdatedAt,
    nowMs,
  }), true)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'unbilled',
    generationStatus: 'processing',
    taskId: 'task-3',
    updatedAt: staleUpdatedAt,
    nowMs,
  }), true)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'unbilled',
    generationStatus: 'failed_defect',
    taskId: 'task-4',
    updatedAt: recentUpdatedAt,
    nowMs,
  }), false)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'billing',
    generationStatus: 'completed',
    updatedAt: staleUpdatedAt,
    nowMs,
  }), true)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'billing_required',
    generationStatus: 'billing_required',
    updatedAt: staleUpdatedAt,
    nowMs,
  }), true)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'billing_failed',
    generationStatus: 'failed',
    updatedAt: staleUpdatedAt,
    nowMs,
  }), true)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'unbilled',
    generationStatus: 'completed',
    updatedAt: recentUpdatedAt,
    nowMs,
  }), false)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'settled',
    generationStatus: 'completed',
    updatedAt: recentUpdatedAt,
    nowMs,
  }), false)
  assert.equal(shouldExposePendingSettlement({
    billingStatus: 'unbilled',
    generationStatus: 'failed',
    updatedAt: recentUpdatedAt,
    nowMs,
  }), false)
})

runTest('pending settlement SQL cutoff only applies to local-only in-flight rows', () => {
  const nowMs = Date.parse('2026-06-17T12:00:00.000Z')
  assert.deepEqual(buildPendingSettlementInFlightCutoffs(nowMs), {
    withoutTaskUpdatedAfter: '2026-06-17T11:30:00.000Z',
  })
})
