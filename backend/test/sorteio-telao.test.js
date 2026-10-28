import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import test from 'node:test'

const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { parse, compileScript } = requireFrontend('@vue/compiler-sfc')
const { ref, computed, nextTick } = requireFrontend('vue')
const draw = {
  localTrabalhoDescricao: 'Unidade de trabalho confirmada pela API',
  id: 1,
  numero: 1,
  participanteId: 42,
  nome: 'Servidor real',
  matricula: '00042',
  origem: 'camara',
  premioId: null,
  premioNome: null,
  sorteadoEm: '2026-10-28T12:00:00Z',
}
const indicators = {
  presencasConfirmadas: 2,
  servidoresContemplados: 0,
  elegiveis: 2,
  proximoNumero: 1,
}
const history = (dados = [], values = indicators) => ({
  dados,
  indicadores: values,
  paginacao: {
    pagina: 1,
    limite: 100,
    total: dados.length,
    paginas: dados.length ? 1 : 0,
  },
})
const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
})

function setup(viewName, fetch, storage = new Map(), reducedMotion = true) {
  const messages = []
  const mounted = []
  const unmount = []
  const alerts = []
  const listeners = new Map()
  const frames = new Map()
  const timers = new Map()
  let timerId = 0
  let frameId = 0
  let now = 1000
  let closes = 0
  let channel
  class Channel {
    constructor() {
      channel = this
    }
    postMessage(message) {
      messages.push(message)
    }
    addEventListener() {}
    close() {}
  }
  const context = vm.createContext({
    module: { exports: {} },
    ref,
    computed,
    nextTick,
    fetch,
    Date: class extends Date {
      static now() {
        return now
      }
    },
    performance: { now: () => 0 },
    crypto: { randomUUID },
    URLSearchParams,
    brasao: '',
    RouterLink: {},
    useRouter: () => ({ resolve: () => ({ href: '/telao?session=test' }) }),
    useRoute: () => ({ query: { session: 'test' } }),
    onMounted: (callback) => mounted.push(callback),
    onBeforeUnmount: (callback) => unmount.push(callback),
    BroadcastChannel: Channel,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    window: {
      close: () => {
        closes += 1
      },
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: (type, handler) => {
        if (listeners.get(type) === handler) listeners.delete(type)
      },
      requestAnimationFrame: (callback) => {
        frames.set(++frameId, callback)
        return frameId
      },
      cancelAnimationFrame: (id) => frames.delete(id),
      matchMedia: () => ({ matches: reducedMotion }),
      setTimeout: (callback, ms) => {
        if (ms === 250) queueMicrotask(callback)
        else timers.set(++timerId, { callback, ms })
        return timerId
      },
      clearTimeout: (id) => timers.delete(id),
      setInterval: () => 1,
      clearInterval() {},
    },
    document: {
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      activeElement: null,
    },
    Swal: {
      isVisible: () => false,
      fire: async (options) => {
        alerts.push(options)
        return { isConfirmed: true }
      },
    },
  })
  const services = readFileSync(
    new URL('../../frontend/src/services/sorteios.js', import.meta.url),
    'utf8',
  ).replace(/^export /gm, '')
  new vm.Script(services).runInContext(context)
  const source = readFileSync(
    new URL(`../../frontend/src/views/${viewName}`, import.meta.url),
    'utf8',
  )
  const { descriptor } = parse(source)
  const script = compileScript(descriptor, { id: 'sorteio-test' })
    .content.replace(/^import\s+(?:[^'"]*?\s+from\s+)?['"][^'"]+['"];?\r?$/gm, '')
    .replace('export default', 'module.exports =')
  new vm.Script(script).runInContext(context)
  return {
    view: context.module.exports.setup({}, { expose: () => {} }),
    messages,
    mounted,
    unmount,
    alerts,
    storage,
    context,
    listeners,
    frames,
    receive: (data) => channel.onmessage({ data }),
    advanceTime: (ms) => {
      now += ms
    },
    closeCount: () => closes,
    fireTimer: (ms) => {
      for (const [id, timer] of [...timers]) {
        if (timer.ms === ms) {
          timers.delete(id)
          timer.callback()
        }
      }
    },
    advanceFrame: (now) => {
      const callbacks = [...frames.values()]
      frames.clear()
      callbacks.forEach((callback) => callback(now))
    },
  }
}

test('space shortcut uses the button flow once and does not steal interactive or modal keyboard input', async () => {
  let finish
  let posts = 0
  const app = setup('sorteio/SorteioView.vue', async (url, options) => {
    if (options?.method === 'POST') {
      posts += 1
      return new Promise((resolve) => {
        finish = resolve
      })
    }
    return url === '/api/premios' ? json({ dados: [] }) : json(history())
  })
  await app.mounted[0]()
  assert.equal(app.listeners.get('keydown'), app.view.handleDrawShortcut)
  let prevented = 0
  const key = (extra = {}) => ({
    code: 'Space',
    key: ' ',
    target: { closest: () => null },
    preventDefault: () => {
      prevented += 1
    },
    ...extra,
  })
  for (const extra of [
    { repeat: true },
    { defaultPrevented: true },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { shiftKey: true },
    { isComposing: true },
    { code: 'Enter', key: 'Enter' },
    { target: { closest: () => ({}) } },
  ])
    app.view.handleDrawShortcut(key(extra))
  app.context.document.activeElement = { isContentEditable: true }
  app.view.handleDrawShortcut(key())
  app.context.document.activeElement = null
  app.context.document.querySelector = () => ({})
  app.view.handleDrawShortcut(key())
  app.context.document.querySelector = () => null
  app.context.Swal.isVisible = () => true
  app.view.handleDrawShortcut(key())
  app.context.Swal.isVisible = () => false
  assert.equal(prevented, 0)
  assert.equal(posts, 0)
  app.view.handleDrawShortcut(key())
  app.view.handleDrawShortcut(key())
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(prevented, 1)
  assert.equal(posts, 1)
  finish(json(draw, 201))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(app.view.latestDraw.value.id, draw.id)
  app.unmount[0]()
  assert.ok(!app.listeners.has('keydown'))
})

test('two independent space presses confirm only one operation, including competing clicks', async () => {
  let posts = 0
  let resolveModal
  let modalOpen = false
  const app = setup('sorteio/SorteioView.vue', async (url, options) => {
    if (options?.method === 'POST') {
      posts += 1
      return json(draw, 201)
    }
    return url === '/api/premios' ? json({ dados: [] }) : json(history())
  })
  await app.mounted[0]()
  app.context.Swal.isVisible = () => modalOpen
  app.context.Swal.fire = (options) =>
    new Promise((resolve) => {
      modalOpen = true
      options.didOpen()
      resolveModal = () => {
        modalOpen = false
        options.willClose()
        resolve({ isConfirmed: true })
      }
    })
  app.context.Swal.clickConfirm = () => resolveModal()
  const key = (extra = {}) => ({
    code: 'Space',
    preventDefault() {},
    stopImmediatePropagation() {},
    ...extra,
  })
  app.view.handleDrawShortcut(key())
  assert.equal(modalOpen, true)
  assert.equal(posts, 0)
  app.context.document.activeElement = { closest: () => ({}) }
  app.view.handleDrawShortcut(key({ repeat: true }))
  app.view.handleDrawShortcut(key())
  assert.equal(posts, 0)
  app.view.releaseDrawShortcut(key())
  app.view.handleDrawShortcut(key())
  app.view.handleDrawShortcut(key())
  await app.view.confirmDraw()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(posts, 1)
  assert.equal(app.view.latestDraw.value.id, draw.id)
  app.unmount[0]()
})

test('projection tolerates silent timers, recovers a snapshot and closes only with evidence', async () => {
  const app = setup('telao/TelaoView.vue', async () => json(history([draw])))
  app.mounted[0]()
  await app.view.handleProjectionMessage({
    data: { type: 'state', sessionId: 'test', phase: 'drawing', drawNumber: 1 },
  })
  app.advanceTime(70000)
  app.view.checkOperatorConnection()
  assert.equal(app.view.connectionLost.value, true)
  assert.equal(app.closeCount(), 0)
  await app.view.handleProjectionMessage({
    data: { type: 'heartbeat', sessionId: 'test' },
  })
  assert.equal(app.view.connectionLost.value, false)
  assert.equal(app.messages.at(-1).type, 'snapshot-request')
  app.advanceTime(600000)
  app.view.checkOperatorConnection()
  assert.equal(app.closeCount(), 0)
  app.context.window.opener = { closed: true }
  app.view.checkOperatorConnection()
  app.advanceTime(3000)
  app.view.checkOperatorConnection()
  assert.equal(app.closeCount(), 1)
  assert.equal(app.view.sessionEnded.value, true)
  assert.equal(app.view.winner.value, null)
  await app.view.handleProjectionMessage({
    data: { type: 'state', sessionId: 'test', phase: 'drawing' },
  })
  assert.equal(app.view.phase.value, 'disconnected')
})

test('normal operator shutdown is announced and projection uses a recoverable grace period', async () => {
  const operator = setup('sorteio/SorteioView.vue', async (url) =>
    url === '/api/premios' ? json({ dados: [] }) : json(history()),
  )
  await operator.mounted[0]()
  operator.listeners.get('pagehide')()
  assert.equal(operator.messages.at(-1).type, 'operator-disconnected')
  const app = setup('telao/TelaoView.vue', async () => json(history()))
  app.mounted[0]()
  const disconnected = {
    data: { type: 'operator-disconnected', sessionId: 'test' },
  }
  await app.view.handleProjectionMessage(disconnected)
  app.advanceTime(2999)
  app.view.checkOperatorConnection()
  assert.equal(app.closeCount(), 0)
  await app.view.handleProjectionMessage({
    data: { type: 'heartbeat', sessionId: 'test' },
  })
  app.advanceTime(1)
  app.view.checkOperatorConnection()
  assert.equal(app.view.sessionEnded.value, false)
  await app.view.handleProjectionMessage(disconnected)
  app.advanceTime(3000)
  app.context.window.close = () => {
    throw new Error('Blocked')
  }
  app.view.checkOperatorConnection()
  assert.equal(app.view.sessionEnded.value, true)
  assert.match(app.view.statusMessage.value, /encerrada/)
  operator.unmount[0]()
})

test('API failures do not end a live operator session', async () => {
  const app = setup('telao/TelaoView.vue', async () => json({ erro: 'Temporário' }, 503))
  app.mounted[0]()
  await app.view.handleProjectionMessage({
    data: { type: 'state', sessionId: 'test', phase: 'winner', draw },
  })
  assert.equal(app.view.connectionLost.value, false)
  assert.equal(app.view.sessionEnded.value, false)
  assert.match(app.view.statusMessage.value, /API/)
  for (let i = 0; i < 10; i += 1) {
    app.advanceTime(2000)
    await app.view.handleProjectionMessage({
      data: { type: 'heartbeat', sessionId: 'test' },
    })
    app.view.checkOperatorConnection()
  }
  assert.equal(app.closeCount(), 0)
})

test('confirmed API operation completes once after operator shutdown during its request', async () => {
  let finish
  let posts = 0
  const app = setup('sorteio/SorteioView.vue', async (url, options) => {
    if (options?.method === 'POST') {
      posts += 1
      return new Promise((resolve) => {
        finish = resolve
      })
    }
    return url === '/api/premios' ? json({ dados: [] }) : json(history())
  })
  await app.mounted[0]()
  const operation = app.view.confirmDraw()
  await new Promise((resolve) => setImmediate(resolve))
  app.unmount[0]()
  finish(json(draw, 201))
  await operation
  assert.equal(posts, 1)
  assert.equal(app.view.pendingOperation.value, null)
  assert.ok(!app.messages.some(({ phase }) => phase === 'winner'))
})

test('idle ceremony and suspended operator timers never close a live operator window', async () => {
  const app = setup('telao/TelaoView.vue', async () => json(draw))
  app.context.window.opener = { closed: false }
  app.mounted[0]()
  await app.view.handleProjectionMessage({
    data: { type: 'state', sessionId: 'test', phase: 'winner', draw },
  })
  for (let minute = 0; minute < 30; minute += 1) {
    app.advanceTime(60000)
    app.view.checkOperatorConnection()
  }
  assert.equal(app.closeCount(), 0)
  assert.equal(app.view.phase.value, 'winner')
  assert.equal(app.view.connectionLost.value, false)
  app.context.window.opener.closed = true
  app.view.checkOperatorConnection()
  assert.equal(app.closeCount(), 0)
  app.advanceTime(3000)
  app.view.checkOperatorConnection()
  assert.equal(app.closeCount(), 1)
})

test('winner visibility is acknowledged after entrance and repeated snapshots do not restart it', async () => {
  const app = setup('telao/TelaoView.vue', async () => json(draw), new Map(), false)
  const message = { data: { type: 'state', sessionId: 'test', phase: 'winner', draw } }
  await app.view.handleProjectionMessage(message)
  assert.ok(!app.messages.some(({ type }) => type === 'winner-visible'))
  app.fireTimer(800)
  assert.equal(app.messages.at(-1).type, 'winner-visible')
  await app.view.handleProjectionMessage({ data: { ...message.data, snapshot: true } })
  app.fireTimer(800)
  assert.equal(app.messages.filter(({ type }) => type === 'winner-visible').length, 1)
})

test('two consecutive human draws prepare automatically ten seconds after revelation without extra POSTs', async () => {
  let posts = 0
  const results = []
  const app = setup('sorteio/SorteioView.vue', async (url, options) => {
    if (options?.method === 'POST') {
      posts += 1
      const result = { ...draw, id: posts, numero: posts }
      results.unshift(result)
      return json(result, 201)
    }
    return url === '/api/premios'
      ? json({ dados: [] })
      : json(history(results, { ...indicators, proximoNumero: posts + 1 }))
  })
  await app.mounted[0]()
  const sessionId = app.messages[0].sessionId
  app.receive({ type: 'snapshot-request', sessionId })
  app.context.Swal.fire = (options) =>
    new Promise((resolve) => {
      options.didOpen()
      app.context.Swal.clickConfirm = () => {
        options.willClose()
        resolve({ isConfirmed: true })
      }
    })
  const key = { code: 'Space', preventDefault() {}, stopImmediatePropagation() {} }
  for (let round = 1; round <= 2; round += 1) {
    app.view.releaseDrawShortcut(key)
    app.view.handleDrawShortcut(key)
    app.view.releaseDrawShortcut(key)
    app.view.handleDrawShortcut(key)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(posts, round)
    assert.equal(app.view.projectionPhase.value, 'winner')
    app.advanceTime(10000)
    app.fireTimer(10800)
    assert.equal(app.view.projectionPhase.value, 'winner')
    app.receive({ type: 'winner-visible', sessionId, drawId: round })
    app.advanceTime(9999)
    app.receive({ type: 'prepare-request', sessionId, drawId: round })
    app.fireTimer(10000)
    assert.equal(app.view.projectionPhase.value, 'winner')
    app.advanceTime(1)
    if (round === 1) app.fireTimer(1)
    else app.receive({ type: 'prepare-request', sessionId, drawId: round })
    assert.equal(app.view.projectionPhase.value, 'preparing')
    assert.equal(posts, round)
    assert.equal(app.view.latestDraw.value.id, round)
    const count = app.messages.length
    app.receive({ type: 'winner-visible', sessionId, drawId: round })
    app.fireTimer(10000)
    assert.equal(app.messages.length, count)
  }
})

test('manual preparation cancels automation and reload restores only the remaining presentation time', async () => {
  const storage = new Map()
  const fetch = async (url) =>
    url === '/api/premios' ? json({ dados: [] }) : json(history([draw]))
  const app = setup('sorteio/SorteioView.vue', fetch, storage)
  await app.view.animateDraw(draw)
  app.advanceTime(5000)
  const reopened = setup('sorteio/SorteioView.vue', fetch, storage)
  reopened.advanceTime(5000)
  await reopened.view.refreshData(true)
  assert.equal(reopened.view.projectionPhase.value, 'winner')
  reopened.advanceTime(5800)
  reopened.fireTimer(5800)
  assert.equal(reopened.view.projectionPhase.value, 'preparing')
  assert.ok(reopened.messages.every(({ phase }) => phase !== 'drawing'))
  app.view.prepareNextDraw()
  const count = app.messages.length
  app.advanceTime(20000)
  app.fireTimer(10800)
  assert.equal(app.messages.length, count)
  const prepared = setup('sorteio/SorteioView.vue', fetch, storage)
  await prepared.view.refreshData(true)
  assert.equal(prepared.view.projectionPhase.value, 'preparing')
})

test('space shortcut requires an eligible prepared round and never retries pending operations', async () => {
  const app = setup('sorteio/SorteioView.vue', async (url) =>
    url === '/api/premios' ? json({ dados: [] }) : json(history()),
  )
  await app.view.refreshData(true)
  let prevented = 0
  const key = {
    code: 'Space',
    preventDefault: () => {
      prevented += 1
    },
  }
  for (const phase of ['winner', 'drawing']) {
    app.view.projectionPhase.value = phase
    app.view.handleDrawShortcut(key)
  }
  app.view.projectionPhase.value = 'preparing'
  app.view.indicatorData.value.elegiveis = 0
  app.view.handleDrawShortcut(key)
  app.view.indicatorData.value.elegiveis = 1
  app.view.pendingOperation.value = { chave: 'pending' }
  app.view.handleDrawShortcut(key)
  assert.equal(prevented, 0)
})

test('animation uses display frames with bounded digit messages and cancels cleanly on unmount', async () => {
  const app = setup(
    'sorteio/SorteioView.vue',
    async () => {
      throw new Error('No API request expected')
    },
    new Map(),
    false,
  )
  const animation = app.view.animateDraw(draw)
  for (let time = 0; time < 2800; time += 16) app.advanceFrame(time)
  app.advanceFrame(2800)
  await animation
  const ticks = app.messages.filter(({ phase }) => phase === 'drawing')
  assert.ok(ticks.length <= 57)
  assert.ok(ticks.length >= 50)
  assert.equal(app.messages.at(-1).draw.id, draw.id)
  assert.equal(app.frames.size, 0)
  const interrupted = app.view.animateDraw({ ...draw, id: 2 })
  app.advanceFrame(0)
  const before = app.messages.length
  app.unmount[0]()
  await interrupted
  assert.equal(app.frames.size, 0)
  assert.ok(!app.messages.slice(before).some(({ phase }) => phase === 'winner'))
})

test('background operator reveals on deadline even without animation frames', async () => {
  const app = setup('sorteio/SorteioView.vue', async () => json(history()), new Map(), false)
  const animation = app.view.animateDraw(draw)
  app.fireTimer(2800)
  await animation
  assert.equal(app.view.ballNumber.value, draw.matricula)
  assert.equal(app.view.projectionPhase.value, 'winner')
  assert.equal(app.frames.size, 0)
})

test('projection animates locally without operator frames and stops on canonical winner or unmount', async () => {
  let reads = 0
  const app = setup(
    'telao/TelaoView.vue',
    async () => {
      reads += 1
      return json(draw)
    },
    new Map(),
    false,
  )
  const state = {
    type: 'state',
    sessionId: 'test',
    phase: 'drawing',
    drawNumber: 1,
    ballNumber: '000000',
  }
  await app.view.handleProjectionMessage({ data: state })
  app.advanceFrame(0)
  const first = app.view.ballNumber.value
  app.advanceFrame(100)
  assert.notEqual(app.view.ballNumber.value, first)
  assert.equal(reads, 0)
  await app.view.handleProjectionMessage({
    data: { ...state, phase: 'winner', draw },
  })
  assert.equal(app.view.ballNumber.value, draw.matricula)
  assert.equal(reads, 1)
  assert.equal(app.frames.size, 0)
  await app.view.handleProjectionMessage({ data: { ...state, drawNumber: 2 } })
  app.unmount[0]()
  assert.equal(app.frames.size, 0)
})

test('projection drawing updates only digits and preserves the canonical winner on revelation', async () => {
  let reads = 0
  const app = setup('telao/TelaoView.vue', async () => {
    reads += 1
    return json(draw)
  })
  for (let tick = 0; tick < 60; tick += 1)
    await app.view.handleProjectionMessage({
      data: {
        type: 'state',
        sessionId: 'test',
        phase: 'drawing',
        drawNumber: 1,
        ballNumber: String(tick).padStart(6, '0'),
      },
    })
  assert.equal(reads, 0)
  assert.equal(app.view.ballNumber.value, '000059')
  await app.view.handleProjectionMessage({
    data: {
      type: 'state',
      sessionId: 'test',
      phase: 'winner',
      drawNumber: 1,
      draw,
    },
  })
  assert.equal(reads, 1)
  assert.equal(app.view.winner.value.id, draw.id)
})

test('operator waits for persisted result, blocks repeated clicks and broadcasts the API winner', async () => {
  let finish
  let posts = 0
  const { view, messages } = setup('sorteio/SorteioView.vue', async (url, options) => {
    if (options?.method === 'POST') {
      posts += 1
      return new Promise((resolve) => {
        finish = resolve
      })
    }
    if (url === '/api/premios') return json({ dados: [] })
    return json(history(posts ? [draw] : []))
  })
  await view.refreshData(true)
  const first = view.confirmDraw()
  await new Promise((resolve) => setImmediate(resolve))
  await view.confirmDraw()
  assert.equal(posts, 1)
  assert.ok(!messages.some((message) => message.phase === 'winner'))
  finish(json(draw, 201))
  await first
  const revealed = messages.find((message) => message.phase === 'winner')
  assert.equal(revealed.draw.id, draw.id)
  assert.equal(revealed.draw.participanteId, draw.participanteId)
  assert.equal(revealed.draw.matricula, '00042')
  assert.equal(revealed.draw.localTrabalhoDescricao, draw.localTrabalhoDescricao)
  assert.equal(view.latestDraw.value.id, 1)
})

test('lost response retains the same durable key and a reload recovers without another POST or animation', async () => {
  const storage = new Map()
  let sent
  const first = setup(
    'sorteio/SorteioView.vue',
    async (url, options) => {
      if (options?.method === 'POST') {
        sent = JSON.parse(options.body)
        throw new Error('response lost')
      }
      if (url === '/api/premios') return json({ dados: [] })
      return json(history())
    },
    storage,
  )
  await first.view.refreshData(true)
  await first.view.confirmDraw()
  assert.equal(first.view.pendingOperation.value.chave, sent.chave)
  assert.ok(!first.messages.some((message) => message.phase === 'winner'))
  let posts = 0
  const reopened = setup(
    'sorteio/SorteioView.vue',
    async (url, options) => {
      if (options?.method === 'POST') posts += 1
      return url === '/api/premios' ? json({ dados: [] }) : json(history([draw]))
    },
    storage,
  )
  await reopened.view.refreshData(true)
  assert.equal(posts, 0)
  assert.equal(reopened.view.pendingOperation.value, null)
  assert.equal(reopened.view.latestDraw.value.id, draw.id)
  assert.ok(reopened.messages.every((message) => message.snapshot))
  assert.ok(!reopened.messages.some((message) => message.phase === 'drawing'))
})

test('retry resends the identical pending operation and API failures never publish a fictitious winner', async () => {
  let calls = 0
  const bodies = []
  const { view, messages } = setup('sorteio/SorteioView.vue', async (url, options) => {
    if (options?.method === 'POST') {
      bodies.push(options.body)
      calls += 1
      return calls === 1 ? json({ erro: 'Falha temporária' }, 503) : json(draw)
    }
    return url === '/api/premios' ? json({ dados: [] }) : json(history())
  })
  await view.refreshData(true)
  await view.confirmDraw()
  assert.ok(!messages.some((message) => message.phase === 'winner'))
  await view.confirmDraw()
  assert.equal(bodies[0], bodies[1])
  assert.equal(view.latestDraw.value.id, 1)
})

test('projection verifies canonical API data, ignores other sessions, supports snapshots and repeated rounds', async () => {
  const { view } = setup(
    'telao/TelaoView.vue',
    async (url) =>
      json({
        ...draw,
        id: Number(url.split('/').at(-1)),
        numero: Number(url.split('/').at(-1)),
      }),
    new Map(),
    false,
  )
  const message = (id, extra = {}) => ({
    data: {
      type: 'state',
      sessionId: 'test',
      phase: 'winner',
      drawNumber: id,
      draw: { ...draw, id, nome: 'Nome falso recebido pelo canal' },
      snapshot: true,
      ...extra,
    },
  })
  await view.handleProjectionMessage(message(1, { sessionId: 'other' }))
  assert.equal(view.winner.value, null)
  await view.handleProjectionMessage(message(1))
  assert.equal(view.winner.value.nome, draw.nome)
  assert.equal(view.winner.value.localTrabalhoDescricao, draw.localTrabalhoDescricao)
  assert.equal(view.ballNumber.value, draw.matricula)
  assert.equal(view.confettiRound.value, 0)
  await view.handleProjectionMessage({
    data: {
      type: 'state',
      sessionId: 'test',
      phase: 'preparing',
      lastDraw: draw,
    },
  })
  assert.equal(view.winner.value, null)
  await view.handleProjectionMessage(message(2, { snapshot: false }))
  assert.equal(view.winner.value.id, 2)
  assert.equal(view.confettiRound.value, 1)
  await view.handleProjectionMessage(message(2, { snapshot: false }))
  assert.equal(view.confettiRound.value, 1)
  await view.handleProjectionMessage({
    data: { type: 'operator-disconnected', sessionId: 'test' },
  })
  assert.equal(view.phase.value, 'disconnected')
})

test('projection does not show an unverified winner when its API lookup fails', async () => {
  const { view } = setup('telao/TelaoView.vue', async () =>
    json({ erro: 'Sorteio inexistente' }, 404),
  )
  await view.handleProjectionMessage({
    data: { type: 'state', sessionId: 'test', phase: 'winner', draw },
  })
  assert.equal(view.winner.value, null)
  assert.equal(view.phase.value, 'disconnected')
})
