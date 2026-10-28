import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const requireFrontend = createRequire(
  new URL('../../frontend/package.json', import.meta.url),
)
const Vue = requireFrontend('vue')
const { parse, compileScript, compileTemplate } =
  requireFrontend('@vue/compiler-sfc')
const { renderToString } = requireFrontend('@vue/server-renderer')
const summary = {
  totalServidores: 14,
  presencasConfirmadas: 10,
  servidoresPendentes: 4,
  elegiveis: 2,
  servidoresContemplados: 8,
  sorteiosRealizados: 8,
  premiosCadastrados: 4,
  premiosUtilizados: 1,
  premiosDisponiveis: 3,
}
const draws = Array.from({ length: 6 }, (_, index) => ({
  id: 8 - index,
  numero: 8 - index,
  nome: `Servidor ${8 - index}`,
  matricula: `000${8 - index}`,
  origem: index % 2 ? 'camara' : 'prefeitura',
  sorteadoEm: `2026-10-${20 + index}T12:00:00Z`,
  premioNome: index ? null : 'Prêmio real',
}))
const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
})
const history = (data = draws, total = 8) => ({
  dados: data,
  paginacao: { total },
})
const tick = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await Vue.nextTick()
}

function environment(fetch) {
  const route = Vue.reactive({ fullPath: '/' })
  const window = new EventTarget()
  const context = vm.createContext({
    module: { exports: {} },
    ref: Vue.ref,
    computed: Vue.computed,
    crestUrl: '',
    useRoute: () => route,
    fetch,
    window,
    Event,
  })
  for (const service of ['sorteios', 'evento']) {
    const code = readFileSync(
      new URL(`../../frontend/src/services/${service}.js`, import.meta.url),
      'utf8',
    ).replace(/^export /gm, '')
    new vm.Script(code).runInContext(context)
  }
  function component(file) {
    const mounted = []
    const unmount = []
    context.onMounted = (callback) => mounted.push(callback)
    context.onBeforeUnmount = (callback) => unmount.push(callback)
    context.watch = (...args) => {
      const stop = Vue.watch(...args)
      unmount.push(stop)
      return stop
    }
    const source = readFileSync(
      new URL(`../../frontend/src/${file}`, import.meta.url),
      'utf8',
    )
    const { descriptor } = parse(source)
    const script = compileScript(descriptor, { id: file })
      .content.replace(
        /^import\s+(?:[^'"]*?\s+from\s+)?['"][^'"]+['"];?\r?$/gm,
        '',
      )
      .replace('export default', 'module.exports =')
    new vm.Script(script).runInContext(context)
    const view = context.module.exports.setup({}, { expose: () => {} })
    const template = compileTemplate({
      source: descriptor.template.content,
      filename: file,
      id: file,
      compilerOptions: { mode: 'function' },
    })
    assert.deepEqual(template.errors, [])
    const render = new Function('Vue', template.code)(Vue)
    return {
      view,
      mounted,
      close: () => unmount.forEach((callback) => callback()),
      html: () => {
        const app = Vue.createSSRApp({ setup: () => ({ ...view }), render })
        app.component('RouterLink', {
          props: ['to'],
          setup:
            (props, { slots }) =>
            () =>
              Vue.h('a', { href: props.to }, slots.default?.()),
        })
        return renderToString(app)
      },
    }
  }
  return { component, route, window, context }
}

test('home and sidebar share real indicators, bound history and preserve the existing components', async () => {
  const requests = []
  const env = environment(async (url) => {
    requests.push(url)
    return json(url === '/api/evento/indicadores' ? summary : history())
  })
  const home = env.component('views/inicio/InicioView.vue')
  const sidebar = env.component('components/Sidebar.vue')
  home.mounted[0]()
  sidebar.mounted[0]()
  await tick()
  assert.equal(
    requests.filter((url) => url === '/api/evento/indicadores').length,
    1,
  )
  assert.deepEqual(
    Array.from(home.view.indicators.value, ({ value }) => value),
    [10, 2, 8, 3],
  )
  assert.equal(sidebar.view.indicatorValue('presencasConfirmadas'), 10)
  assert.equal(sidebar.view.indicatorValue('servidoresContemplados'), 8)
  assert.equal(home.view.latestWinners.value[0].order, 8)
  assert.equal(home.view.latestWinners.value.length, 3)
  assert.equal(home.view.orderedWinners.value.length, 6)
  assert.equal(home.view.winnerTotal.value, '8 contemplados')
  const html = await home.html()
  assert.equal((html.match(/class="home-metric"/g) ?? []).length, 4)
  assert.equal((html.match(/class="home-recent-card"/g) ?? []).length, 6)
  assert.match(html, /Prêmio real|Matrícula 0008/)
  assert.match(html, /Sorteio sem prêmio associado/)
  assert.match(html, /Câmara Municipal de Contagem/)
  assert.match(html, /Prefeitura Municipal de Contagem/)
  const navigation = await sidebar.html()
  assert.match(navigation, /Credenciamento, 10 presenças/)
  assert.match(navigation, /Vencedores, 8 vencedores/)
  assert.match(navigation, /Três passos para o evento/)
  home.close()
  sidebar.close()
})

test('confirmed empty data displays zero and the empty history, rather than a communication error', async () => {
  const empty = Object.fromEntries(Object.keys(summary).map((key) => [key, 0]))
  const env = environment(async (url) =>
    json(url === '/api/evento/indicadores' ? empty : history([], 0)),
  )
  const home = env.component('views/inicio/InicioView.vue')
  await home.view.refreshData()
  assert.ok(home.view.indicators.value.every(({ value }) => value === 0))
  const html = await home.html()
  assert.match(html, /O primeiro vencedor aparecerá aqui/)
  assert.match(html, /0 contemplados/)
  assert.doesNotMatch(html, /Indicadores indisponíveis|Histórico indisponível/)
  home.close()
})

test('partial failures and invalid responses never become zero counts or fictional history', async () => {
  let mode = 'summary-failure'
  const env = environment(async (url) => {
    if (url === '/api/evento/indicadores') {
      if (mode === 'summary-failure') throw new Error('offline')
      if (mode === 'invalid') return json({ ...summary, elegiveis: -1 })
      return json(summary)
    }
    return mode === 'history-failure'
      ? json({ erro: 'Falha' }, 500)
      : json(history())
  })
  const home = env.component('views/inicio/InicioView.vue')
  await home.view.refreshData()
  assert.ok(home.view.indicators.value.every(({ value }) => value === '—'))
  assert.equal(home.view.latestWinners.value.length, 3)
  mode = 'invalid'
  await home.view.refreshData()
  assert.match(home.view.indicatorsError.value, /inválidos/)
  mode = 'history-failure'
  await home.view.refreshData()
  assert.equal(home.view.indicators.value[0].value, 10)
  assert.ok(home.view.historyError.value)
  const html = await home.html()
  assert.doesNotMatch(
    html,
    /class="home-recent-card"|O primeiro vencedor aparecerá aqui/,
  )
  assert.match(html, /Histórico indisponível/)
  mode = 'ok'
  await home.view.refreshData()
  assert.equal(home.view.historyError.value, '')
  assert.equal(home.view.indicatorsError.value, '')
  home.close()
})

test('sidebar refreshes on navigation, mutations and focus, and removes listeners on unmount', async () => {
  let data = { ...summary }
  let calls = 0
  const env = environment(async () => {
    calls += 1
    return json({ ...data })
  })
  const sidebar = env.component('components/Sidebar.vue')
  sidebar.mounted[0]()
  await tick()
  data = {
    ...summary,
    presencasConfirmadas: 11,
    servidoresPendentes: 3,
    elegiveis: 3,
  }
  env.route.fullPath = '/credenciamento'
  await tick()
  assert.equal(sidebar.view.indicatorValue('presencasConfirmadas'), 11)
  data = { ...summary }
  env.window.dispatchEvent(new Event('evento-atualizado'))
  await tick()
  assert.equal(sidebar.view.indicatorValue('presencasConfirmadas'), 10)
  env.window.dispatchEvent(new Event('focus'))
  await tick()
  assert.equal(calls, 4)
  sidebar.close()
  env.window.dispatchEvent(new Event('evento-atualizado'))
  env.window.dispatchEvent(new Event('focus'))
  await tick()
  assert.equal(calls, 4)
})

test('sidebar exposes unavailable counts and retry succeeds after API failure', async () => {
  let fail = true
  const env = environment(async () => (fail ? json(null, 500) : json(summary)))
  const sidebar = env.component('components/Sidebar.vue')
  await sidebar.view.refreshIndicators()
  assert.equal(sidebar.view.indicatorValue('presencasConfirmadas'), '—')
  assert.match(await sidebar.html(), /contagem indisponível/)
  fail = false
  await sidebar.view.refreshIndicators()
  assert.equal(sidebar.view.indicatorValue('presencasConfirmadas'), 10)
  sidebar.close()
})

test('shared draw API emits a refresh notification only after successful mutations', async () => {
  let status = 200
  let events = 0
  const env = environment(async () =>
    json(status < 400 ? {} : { erro: 'Falha' }, status),
  )
  env.window.addEventListener('evento-atualizado', () => {
    events += 1
  })
  await vm.runInContext("requestDrawApi('/api/sorteios')", env.context)
  assert.equal(events, 0)
  await vm.runInContext(
    "requestDrawApi('/api/sorteios', { method: 'POST' })",
    env.context,
  )
  assert.equal(events, 1)
  status = 409
  await assert.rejects(
    vm.runInContext(
      "requestDrawApi('/api/sorteios', { method: 'POST' })",
      env.context,
    ),
  )
  assert.equal(events, 1)
})
