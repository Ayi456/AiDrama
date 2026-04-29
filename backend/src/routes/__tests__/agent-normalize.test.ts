import assert from 'node:assert/strict'

import {
  normalizeAgentResult,
  wasToolUsed,
} from '../../agents/result-normalizer.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('normalizeAgentResult does not treat generic tool-call event type as a tool name', () => {
  const normalized = normalizeAgentResult({
    toolCalls: [
      { type: 'tool-call', toolCallId: 'call-read', args: {} },
      { type: 'tool-call', toolCallId: 'call-append', args: {} },
    ],
    toolResults: [
      { type: 'tool-result', result: { script: 'chunk script' } },
      {
        type: 'tool-result',
        result: {
          message: 'Appended 12 storyboards',
          count: 12,
          start_number: 1,
          total_duration: 144,
        },
      },
    ],
  })

  assert.deepEqual(normalized.toolCalls.map((toolCall) => toolCall.toolName), [null, null])
})

runTest('wasToolUsed recognizes append_storyboards from successful append result payload', () => {
  const normalized = normalizeAgentResult({
    toolCalls: [
      { type: 'tool-call', toolCallId: 'call-read', args: {} },
      { type: 'tool-call', toolCallId: 'call-append', args: {} },
    ],
    toolResults: [
      { type: 'tool-result', result: { script: 'chunk script' } },
      {
        type: 'tool-result',
        result: {
          message: 'Appended 12 storyboards',
          count: 12,
          start_number: 1,
          total_duration: 144,
        },
      },
    ],
  })

  assert.equal(wasToolUsed(normalized, 'append_storyboards'), true)
})
