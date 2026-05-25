import test from 'node:test'
import assert from 'node:assert/strict'
import { createGate } from '../automation/concurrency-gate.js'

test('createGate(2) allows two acquires immediately, third waits', async () => {
  const gate = createGate(2)
  const order: string[] = []
  const releaseA = await gate.acquire()
  order.push('a')
  const releaseB = await gate.acquire()
  order.push('b')

  const pendingC = gate.acquire().then(release => {
    order.push('c')
    release()
  })

  assert.deepEqual(order, ['a', 'b'])
  releaseA()
  await pendingC
  assert.deepEqual(order, ['a', 'b', 'c'])
  releaseB()
})

test('createGate(1) is strict serial', async () => {
  const gate = createGate(1)
  const log: string[] = []
  const run = async (label: string) => {
    const release = await gate.acquire()
    log.push(`start-${label}`)
    await new Promise(r => setTimeout(r, 10))
    log.push(`end-${label}`)
    release()
  }
  await Promise.all([run('x'), run('y')])
  assert.deepEqual(log, ['start-x', 'end-x', 'start-y', 'end-y'])
})
