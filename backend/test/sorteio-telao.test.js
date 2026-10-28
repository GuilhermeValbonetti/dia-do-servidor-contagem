import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import test from 'node:test'

const requireFrontend = createRequire(
  new URL('../../frontend/package.json', import.meta.url),
)
const { parse, compileScript } = requireFrontend('@vue/compiler-sfc')
const { ref, computed, nextTick } = requireFrontend('vue')
const draw = {
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
  class Channel {
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
      matchMedia: () => ({ matches: reducedMotion }),
      setTimeout: (callback, ms) => {
        if (ms === 250) queueMicrotask(callback)
        return 1
      },
      clearTimeout() {},
      setInterval: () => 1,
      clearInterval() {},
    },
    document: { addEventListener() {}, removeEventListener() {} },
    Swal: {
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
    .content.replace(
      /^import\s+(?:[^'"]*?\s+from\s+)?['"][^'"]+['"];?\r?$/gm,
      '',
    )
    .replace('export default', 'module.exports =')
  new vm.Script(script).runInContext(context)
  return {
    view: context.module.exports.setup({}, { expose: () => {} }),
    messages,
    mounted,
    unmount,
    alerts,
    storage,
  }
}

test('operator waits for persisted result, blocks repeated clicks and broadcasts the API winner', async () => {
  let finish
  let posts = 0
  const { view, messages } = setup(
    'sorteio/SorteioView.vue',
    async (url, options) => {
      if (options?.method === 'POST') {
        posts += 1
        return new Promise((resolve) => {
          finish = resolve
        })
      }
      if (url === '/api/premios') return json({ dados: [] })
      return json(history(posts ? [draw] : []))
    },
  )
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
      return url === '/api/premios'
        ? json({ dados: [] })
        : json(history([draw]))
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
  const { view, messages } = setup(
    'sorteio/SorteioView.vue',
    async (url, options) => {
      if (options?.method === 'POST') {
        bodies.push(options.body)
        calls += 1
        return calls === 1
          ? json({ erro: 'Falha temporária' }, 503)
          : json(draw)
      }
      return url === '/api/premios' ? json({ dados: [] }) : json(history())
    },
  )
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
