import assert from 'node:assert/strict'
import { test } from 'node:test'

import { optimisticEffort } from './optimisticEffort.ts'

import type { SessionConfigState } from '../../../api/session-config-types.ts'

const state: SessionConfigState = {
  status: 'dormant',
  options: [
    {
      id: 'model',
      kind: 'model',
      name: 'Model',
      currentValue: 'offered-model',
      options: [{ value: 'offered-model', name: 'Model' }],
    },
    {
      id: 'reasoning',
      kind: 'effort',
      name: 'Effort',
      currentValue: 'low',
      options: [
        { value: 'low', name: 'Low' },
        { value: 'xhigh', name: 'Extra High' },
      ],
    },
    {
      id: 'fast',
      kind: 'fast',
      name: 'Fast mode',
      currentValue: 'off',
      options: [
        { value: 'off', name: 'Off' },
        { value: 'on', name: 'On' },
      ],
    },
  ],
}

test('new chat previews only an offered effort for the current model', () => {
  assert.deepEqual(optimisticEffort(state, { effort: 'xhigh' }), {
    configId: 'reasoning',
    value: 'xhigh',
  })
  assert.equal(optimisticEffort(state, { effort: 'low' }), undefined)
  assert.equal(optimisticEffort(state, { effort: 'unknown' }), undefined)
  assert.equal(optimisticEffort(state, { model: 'different-model', effort: 'xhigh' }), undefined)
  assert.equal(optimisticEffort(state, { fast: 'on', effort: 'xhigh' }), undefined)
  assert.equal(optimisticEffort({ ...state, status: 'offline' }, { effort: 'xhigh' }), undefined)
  assert.equal(optimisticEffort(undefined, { effort: 'xhigh' }), undefined)
})
