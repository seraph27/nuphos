import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SessionConfigSync } from './sessionConfigSync.ts'

import type { SessionConfigState } from '../../../api/session-config-types.ts'

const ready = (value: string): SessionConfigState => ({
  status: 'ready',
  options: [
    {
      id: 'model',
      name: 'Model',
      kind: 'model',
      currentValue: value,
      options: [{ value, name: value }],
    },
  ],
})
const busy: SessionConfigState = { status: 'busy', options: [] }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })

  return { promise, resolve, reject }
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

test('menu/focus refreshes join the same pending read; timeout exits loading and late results stay fenced', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = deferred<SessionConfigState>()
  let calls = 0
  const sync = new SessionConfigSync({
    read: () => {
      calls++

      return calls === 1 ? first.promise : Promise.resolve(ready('fresh'))
    },
    write: async () => ready('unused'),
  })
  const stop = sync.start()

  t.after(stop)
  void sync.refresh()
  void sync.refresh()
  assert.equal(calls, 1)
  t.mock.timers.tick(2_000)
  assert.equal(sync.getSnapshot().slow, true)
  t.mock.timers.tick(13_000)
  await flush()
  assert.equal(sync.getSnapshot().loading, false)
  assert.match(sync.getSnapshot().error!, /connect/)
  await sync.refresh()
  assert.equal(sync.getSnapshot().data?.options[0].currentValue, 'fresh')
  first.resolve(ready('late'))
  await flush()
  assert.equal(sync.getSnapshot().data?.options[0].currentValue, 'fresh')
})

test('background failure preserves the acknowledged model, blocks writes, then recovers automatically', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let fail = false
  let writes = 0
  const sync = new SessionConfigSync({
    read: async () => {
      if (fail) throw new Error('offline')

      return ready('actual')
    },
    write: async () => {
      writes++

      return ready('changed')
    },
  })

  t.after(sync.start())
  await flush()
  fail = true
  const reading = sync.refresh()

  assert.equal(sync.getSnapshot().loading, false)
  assert.equal(sync.getSnapshot().data?.options[0].currentValue, 'actual')
  await reading
  await sync.select({ configId: 'model', value: 'changed' })
  assert.equal(writes, 0)
  assert.equal(sync.getSnapshot().data?.options[0].currentValue, 'actual')
  fail = false
  t.mock.timers.tick(20_000)
  await flush()
  assert.equal(sync.getSnapshot().error, undefined)
})

test('late reads cannot overwrite a write acknowledgement or a replacement session', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const stale = deferred<SessionConfigState>()
  let reads = 0
  const sync = new SessionConfigSync({
    read: () => {
      reads++

      return reads === 2 ? stale.promise : Promise.resolve(ready(reads > 2 ? 'selected' : 'before'))
    },
    write: async () => ready('selected'),
  })
  const stop = sync.start()

  await flush()
  void sync.refresh()
  await sync.select({ configId: 'model', value: 'selected' })
  await flush()
  stale.resolve(ready('stale'))
  await flush()
  assert.equal(sync.getSnapshot().data?.options[0].currentValue, 'selected')
  stop()
  const snapshot = sync.getSnapshot()

  t.mock.timers.tick(60_000)
  await flush()
  assert.equal(sync.getSnapshot(), snapshot)
})

test('a long reply keeps a busy session healthy: no error, however long it runs', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  let status: SessionConfigState = { ...busy, options: ready('started').options }
  const sync = new SessionConfigSync({
    read: async () => status,
    write: async () => ready('unused'),
  })

  t.after(sync.start())
  await flush()
  // Agent turns run for many minutes; a busy read is progress, not a failure.
  for (let i = 0; i < 180; i++) {
    t.mock.timers.tick(10_000)
    await flush()
  }
  assert.deepEqual(sync.getSnapshot().data, status)
  assert.equal(sync.getSnapshot().error, undefined)
  assert.equal('stalled' in sync.getSnapshot(), false)

  status = ready('actual')
  t.mock.timers.tick(10_000)
  await flush()
  assert.equal(sync.getSnapshot().data?.status, 'ready')
})

test('lost write acknowledgement is never an optimistic model and triggers readback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const write = deferred<SessionConfigState>()
  let reads = 0
  const sync = new SessionConfigSync({
    read: async () => {
      reads++

      return ready('actual')
    },
    write: () => write.promise,
  })

  t.after(sync.start())
  await flush()
  const selecting = sync.select({ configId: 'model', value: 'unconfirmed' })

  t.mock.timers.tick(40_000)
  await selecting
  await flush()
  assert.equal(sync.getSnapshot().saving, false)
  assert.equal(reads, 2)
  assert.equal(sync.getSnapshot().data?.options[0].currentValue, 'actual')
  write.resolve(ready('late'))
  await flush()
  assert.equal(sync.getSnapshot().data?.options[0].currentValue, 'actual')
})

test('a dormant read after moving agents drops the previous agent’s options', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let response = ready('old-agent-model')
  const sync = new SessionConfigSync({ read: async () => response, write: async () => response })
  const stop = sync.start()

  t.after(stop)
  await flush()
  response = { status: 'dormant', options: [] }
  await sync.refresh()
  assert.deepEqual(sync.getSnapshot().data, response)
})

test('streaming model selection applies the latest choice once the reply is idle', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const writes: string[] = []
  const sync = new SessionConfigSync({
    read: async () => ready('old'),
    write: async (selection) => {
      writes.push(selection.value)

      return ready(selection.value)
    },
  })
  const stop = sync.start()

  t.after(stop)
  sync.setStreaming(true)
  await flush()
  await sync.select({ configId: 'model', value: 'first' })
  await sync.select({ configId: 'model', value: 'latest' })
  assert.deepEqual(writes, [])
  assert.equal(sync.getSnapshot().queued?.[0]?.value, 'latest')
  sync.setStreaming(false)
  await flush()
  assert.deepEqual(writes, ['latest'])
  assert.equal(sync.getSnapshot().queued, undefined)
})

test('streaming retains effort and model independently and applies model first', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const writes: string[] = []
  const sync = new SessionConfigSync({
    read: async () => ready('old'),
    write: async ({ configId, value }) => {
      writes.push(`${configId}:${value}`)

      return ready('new')
    },
  })
  const stop = sync.start()

  t.after(stop)
  sync.setStreaming(true)
  await flush()
  await sync.select({ configId: 'effort', value: 'low' })
  await sync.select({ configId: 'model', value: 'new' })
  await sync.select({ configId: 'effort', value: 'high' })
  assert.equal(sync.getSnapshot().queued?.length, 2)
  assert.deepEqual(writes, [])
  sync.setStreaming(false)
  await flush()
  await flush()
  assert.deepEqual(writes, ['model:new', 'effort:high'])
  assert.equal(sync.getSnapshot().queued, undefined)
})

test('a failed queued model write does not apply effort to the previous model', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const writes: string[] = []
  const sync = new SessionConfigSync({
    read: async () => ready('old'),
    write: async ({ configId }) => {
      writes.push(configId)
      throw new Error('Model rejected')
    },
  })
  const stop = sync.start()

  t.after(stop)
  sync.setStreaming(true)
  await flush()
  await sync.select({ configId: 'model', value: 'new' })
  await sync.select({ configId: 'effort', value: 'high' })
  sync.setStreaming(false)
  await flush()
  await flush()
  assert.deepEqual(writes, ['model'])
  assert.equal(sync.getSnapshot().queued, undefined)
})

test('a dormant session that listed its choices is not polled; one that listed none is', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let reads = 0
  let response: SessionConfigState = { status: 'dormant', options: ready('model').options }
  const sync = new SessionConfigSync({
    read: async () => {
      reads++

      return response
    },
    write: async () => response,
  })
  const stop = sync.start()

  t.after(stop)
  await flush()
  t.mock.timers.tick(60_000)
  await flush()
  assert.equal(reads, 1)
  response = { status: 'dormant', options: [] }
  await sync.refresh()
  t.mock.timers.tick(10_000)
  await flush()
  assert.equal(reads, 3)
})

const effortReady = (value: string): SessionConfigState => ({
  ...ready('model'),
  options: [
    ...ready('model').options,
    {
      id: 'effort',
      name: 'Effort',
      kind: 'effort',
      currentValue: value,
      options: ['low', 'medium', 'high', 'xhigh'].map((value) => ({ value, name: value })),
    },
  ],
})

test('effort updates immediately and coalesces rapid picks behind one in-flight write', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = deferred<SessionConfigState>()
  const second = deferred<SessionConfigState>()
  const writes: string[] = []
  let confirmed = effortReady('low')
  const sync = new SessionConfigSync({
    read: async () => confirmed,
    write: (selection) => {
      writes.push(selection.value)

      return writes.length === 1 ? first.promise : second.promise
    },
  })

  t.after(sync.start())
  await flush()
  const selecting = sync.select({ configId: 'effort', value: 'high' })

  assert.equal(sync.getSnapshot().optimistic?.value, 'high')
  assert.equal(sync.getSnapshot().data?.options[1].currentValue, 'low')
  await sync.select({ configId: 'effort', value: 'medium' })
  await sync.select({ configId: 'effort', value: 'xhigh' })
  assert.deepEqual(writes, ['high'])
  assert.equal(sync.getSnapshot().optimistic?.value, 'xhigh')
  confirmed = effortReady('high')
  first.resolve(confirmed)
  await selecting
  await flush()
  assert.deepEqual(writes, ['high', 'xhigh'])
  assert.equal(sync.getSnapshot().optimistic?.value, 'xhigh')
  confirmed = effortReady('xhigh')
  second.resolve(confirmed)
  await flush()
  assert.equal(sync.getSnapshot().optimistic, undefined)
  assert.equal(sync.getSnapshot().data?.options[1].currentValue, 'xhigh')
  assert.equal(sync.getSnapshot().saving, false)
})

test('failed effort clears the optimistic pick and reads back before another write', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const write = deferred<SessionConfigState>()
  const readback = deferred<SessionConfigState>()
  let reads = 0
  const sync = new SessionConfigSync({
    read: () => (++reads === 1 ? Promise.resolve(effortReady('low')) : readback.promise),
    write: () => write.promise,
  })

  t.after(sync.start())
  await flush()
  const selecting = sync.select({ configId: 'effort', value: 'high' })

  await sync.select({ configId: 'effort', value: 'xhigh' })
  write.reject(new Error('Connection lost'))
  await selecting
  assert.equal(sync.getSnapshot().optimistic, undefined)
  assert.equal(sync.getSnapshot().data?.options[1].currentValue, 'low')
  assert.match(sync.getSnapshot().error!, /not confirmed/)
  readback.resolve(effortReady('high'))
  await flush()
  assert.equal(sync.getSnapshot().data?.options[1].currentValue, 'high')
})

test('unsupported effort values never become an optimistic selection', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let writes = 0
  const sync = new SessionConfigSync({
    read: async () => effortReady('low'),
    write: async () => {
      writes++

      return effortReady('low')
    },
  })

  t.after(sync.start())
  await flush()
  await sync.select({ configId: 'effort', value: 'invented' })
  assert.equal(sync.getSnapshot().optimistic, undefined)
  assert.equal(writes, 0)
})

test('effort picks move to the next reply queue when streaming begins during a save', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = deferred<SessionConfigState>()
  const writes: string[] = []
  let state = effortReady('low')
  const sync = new SessionConfigSync({
    read: async () => state,
    write: async (selection) => {
      writes.push(selection.value)
      if (writes.length === 1) return first.promise
      state = effortReady(selection.value)

      return state
    },
  })

  t.after(sync.start())
  await flush()
  const selecting = sync.select({ configId: 'effort', value: 'high' })

  await sync.select({ configId: 'effort', value: 'xhigh' })
  sync.setStreaming(true)
  state = effortReady('high')
  first.resolve(state)
  await selecting
  assert.equal(sync.getSnapshot().optimistic, undefined)
  assert.equal(sync.getSnapshot().queued?.[0]?.value, 'xhigh')
  await sync.select({ configId: 'effort', value: 'low' })
  assert.equal(sync.getSnapshot().optimistic, undefined)
  assert.equal(sync.getSnapshot().queued?.[0]?.value, 'low')
  sync.setStreaming(false)
  await flush()
  assert.deepEqual(writes, ['high', 'low'])
  assert.equal(sync.getSnapshot().data?.options[1].currentValue, 'low')
})

test('an effort write timeout restores server state and ignores a late acknowledgement', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const write = deferred<SessionConfigState>()
  const sync = new SessionConfigSync({
    read: async () => effortReady('low'),
    write: () => write.promise,
  })

  t.after(sync.start())
  await flush()
  const selecting = sync.select({ configId: 'effort', value: 'xhigh' })

  t.mock.timers.tick(40_000)
  await selecting
  await flush()
  assert.equal(sync.getSnapshot().optimistic, undefined)
  assert.equal(sync.getSnapshot().data?.options[1].currentValue, 'low')
  write.resolve(effortReady('xhigh'))
  await flush()
  assert.equal(sync.getSnapshot().data?.options[1].currentValue, 'low')
})
