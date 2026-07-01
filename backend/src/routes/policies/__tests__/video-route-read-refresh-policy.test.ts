import test from 'node:test'
import assert from 'node:assert/strict'

import { refreshReadableVideoGenerationRow } from '../video-route-policy.js'

type TestVideoGenerationRow = {
  id: number
  status?: string | null
  taskId?: string | null
  errorMsg?: string | null
  videoUrl?: string | null
  updatedAt?: string | null
}

test('refreshReadableVideoGenerationRow refreshes in-flight provider tasks before presentation', async () => {
  const calls: string[] = []
  const row: TestVideoGenerationRow = {
    id: 2797,
    status: 'processing',
    taskId: 'cgt-20260701110534-5hc74',
    videoUrl: null,
  }

  const result = await refreshReadableVideoGenerationRow(row, {
    refreshStatus: async (id: number) => {
      calls.push(`refresh:${id}`)
    },
    reload: async (id: number): Promise<TestVideoGenerationRow> => {
      calls.push(`reload:${id}`)
      return {
        id,
        status: 'completed',
        taskId: 'cgt-20260701110534-5hc74',
        videoUrl: 'https://cdn.example.com/shot-11.mp4',
      }
    },
  })

  assert.deepEqual(calls, ['refresh:2797', 'reload:2797'])
  assert.equal(result.status, 'completed')
  assert.equal(result.videoUrl, 'https://cdn.example.com/shot-11.mp4')
})

test('refreshReadableVideoGenerationRow skips rows that cannot be provider-polled', async () => {
  const calls: string[] = []
  const row: TestVideoGenerationRow = {
    id: 3001,
    status: 'processing',
    taskId: null,
  }

  const result = await refreshReadableVideoGenerationRow(row, {
    refreshStatus: async (id: number) => {
      calls.push(`refresh:${id}`)
    },
    reload: async (id: number) => {
      calls.push(`reload:${id}`)
      return null
    },
  })

  assert.equal(result, row)
  assert.deepEqual(calls, [])
})

test('refreshReadableVideoGenerationRow preserves stale clock when provider task remains in flight', async () => {
  const row: TestVideoGenerationRow = {
    id: 4001,
    status: 'processing',
    taskId: 'provider-task',
    updatedAt: '2026-07-01T03:00:00.000Z',
  }

  const result = await refreshReadableVideoGenerationRow(row, {
    refreshStatus: async () => {},
    reload: async (): Promise<TestVideoGenerationRow> => ({
      id: 4001,
      status: 'processing',
      taskId: 'provider-task',
      updatedAt: '2026-07-01T05:00:00.000Z',
    }),
  })

  assert.equal(result.updatedAt, '2026-07-01T03:00:00.000Z')
})

test('refreshReadableVideoGenerationRow recovers local timeout failures with provider tasks', async () => {
  const calls: string[] = []
  const row: TestVideoGenerationRow = {
    id: 5001,
    status: 'failed',
    taskId: 'provider-task',
    errorMsg: 'Timeout: Polling attempts exhausted',
  }

  const result = await refreshReadableVideoGenerationRow(row, {
    refreshStatus: async (id: number) => {
      calls.push(`refresh:${id}`)
    },
    reload: async (id: number): Promise<TestVideoGenerationRow> => {
      calls.push(`reload:${id}`)
      return {
        id,
        status: 'completed',
        taskId: 'provider-task',
        videoUrl: 'https://cdn.example.com/recovered.mp4',
      }
    },
  })

  assert.deepEqual(calls, ['refresh:5001', 'reload:5001'])
  assert.equal(result.status, 'completed')
  assert.equal(result.videoUrl, 'https://cdn.example.com/recovered.mp4')
})
