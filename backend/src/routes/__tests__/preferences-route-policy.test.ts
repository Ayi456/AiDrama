import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPreferencesInsertValues,
  resolvePreferencesPayload,
  selectPreferencesRowForUser,
  DEFAULT_PREFERENCES,
} from '../resources/preferences.js'
import { mysqlPool } from '../../db/index.js'

after(async () => {
  await new Promise(resolve => setTimeout(resolve, 250))
  await mysqlPool.end()
})

test('resolvePreferencesPayload returns defaults when row is null', () => {
  const result = resolvePreferencesPayload(null)
  assert.equal(result.autoPipelineEnabled, false)
  assert.equal(result.autoPipelineMaxRetries, 2)
  assert.equal(result.autoPipelineConcurrencyImage, 4)
  assert.equal(result.autoPipelineConcurrencyVideo, 2)
})

test('resolvePreferencesPayload uses row values when present', () => {
  const result = resolvePreferencesPayload({
    userId: 'default',
    autoPipelineEnabled: true,
    autoPipelineMaxRetries: 3,
    autoPipelineConcurrencyImage: 6,
    autoPipelineConcurrencyVideo: 1,
  })
  assert.equal(result.autoPipelineEnabled, true)
  assert.equal(result.autoPipelineMaxRetries, 3)
  assert.equal(result.autoPipelineConcurrencyImage, 6)
  assert.equal(result.autoPipelineConcurrencyVideo, 1)
})

test('DEFAULT_PREFERENCES has the expected userId', () => {
  assert.equal(DEFAULT_PREFERENCES.userId, 'default')
})

test('buildPreferencesInsertValues persists preferences under the current user id', () => {
  const result = buildPreferencesInsertValues('42', {
    autoPipelineEnabled: true,
  }, '2026-06-16T08:00:00.000Z')

  assert.equal(result.userId, '42')
  assert.equal(result.autoPipelineEnabled, true)
  assert.equal(result.autoPipelineMaxRetries, 2)
  assert.equal(result.createdAt, '2026-06-16T08:00:00.000Z')
  assert.equal(result.updatedAt, '2026-06-16T08:00:00.000Z')
})

test('selectPreferencesRowForUser prefers the current user over legacy default preferences', () => {
  const rows = [
    { userId: 'default', autoPipelineEnabled: true },
    { userId: '42', autoPipelineEnabled: false },
  ]

  assert.equal(selectPreferencesRowForUser(rows, '42')?.userId, '42')
  assert.equal(selectPreferencesRowForUser([{ userId: 'default', autoPipelineEnabled: true }], '42')?.userId, 'default')
})
