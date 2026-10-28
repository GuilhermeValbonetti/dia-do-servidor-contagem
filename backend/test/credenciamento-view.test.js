import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url))
const { parse, compileScript } = requireFrontend('@vue/compiler-sfc')
const { ref, computed } = requireFrontend('vue')
const source = readFileSync(
  new URL('../../frontend/src/views/credenciamento/CredenciamentoView.vue', import.meta.url),
  'utf8',
)
const { descriptor } = parse(source)
const code = compileScript(descriptor, { id: 'checkin-test' })
  .content.replace(/^import\s+(?:[^'"]*?\s+from\s+)?['"][^'"]+['"];?\r?$/gm, '')
  .replace('export default', 'module.exports =')

function setup() {
  const rows = [
    { id: 1, nome: 'Ana Silva', matricula: '00123', origem: 'prefeitura', credenciado: false },
    { id: 2, nome: 'Ana Silva', matricula: '00123', origem: 'camara', credenciado: false },
  ]
  const requests = []
  const alerts = []
  let confirm = async () => ({ isConfirmed: true })
  const context = vm.createContext({
    module: { exports: {} },
    ref,
    computed,
    URLSearchParams,
    watch() {},
    onMounted() {},
    onUnmounted() {},
    Swal: {
      fire: async (options) => {
        alerts.push(options)
        return confirm(options)
      },
    },
    fetch: async (url, options) => {
      requests.push({ url, options })
      let data
      if (options?.method === 'POST') {
        const body = JSON.parse(options.body)
        rows.find(({ id }) => id === body.servidorId).credenciado = true
        data = {}
      } else if (options?.method === 'DELETE') {
        rows.find(({ id }) => id === Number(url.split('/').at(-1))).credenciado = false
        data = {}
      } else if (url.startsWith('/api/servidores?')) {
        data = {
          dados: rows.map((row) => ({ ...row })),
          paginacao: { pagina: 1, paginas: 1, total: 2 },
        }
      } else if (url.includes('/recentes')) data = { dados: [] }
      else if (url === '/api/health') data = { status: 'ok', ambiente: 'testes' }
      else
        data = {
          totalServidores: 2,
          presencasConfirmadas: rows.filter((row) => row.credenciado).length,
        }
      return { ok: true, json: async () => data }
    },
  })
  new vm.Script(code).runInContext(context)
  return {
    view: context.module.exports.setup({}, { expose() {} }),
    requests,
    alerts,
    setConfirm: (callback) => {
      confirm = callback
    },
    mutations: () => requests.filter(({ options }) => options?.method),
  }
}

test('main search remains read only and sends partial names and registrations with global filters', async () => {
  const app = setup()
  for (const term of ['Ana', 'Ana Silva', '001', '00123']) {
    app.view.directorySearch.value = term
    app.view.activeFilter.value = 'pending'
    await app.view.loadDirectory(2)
    const query = new URLSearchParams(app.requests.at(-1).url.split('?')[1])
    assert.equal(query.get('busca'), term)
    assert.equal(query.get('limit'), '10')
    assert.equal(query.get('status'), 'pending')
  }
  assert.equal(app.mutations().length, 0)
  assert.equal(app.alerts.length, 0)
  assert.doesNotMatch(
    descriptor.template.content,
    /checkin-search-input|searchParticipants|Confirmar pela busca/,
  )
  assert.match(descriptor.template.content, /@click="confirmPresence\(person\)"/)
  assert.match(descriptor.template.content, /person.localTrabalhoDescricao/)
})

test('selected result confirms by internal ID with leading zeros, updates status and blocks concurrent confirmation', async () => {
  const app = setup()
  await app.view.refreshData()
  let finish
  app.setConfirm((options) =>
    options.icon === 'question'
      ? new Promise((resolve) => {
          finish = resolve
        })
      : { isConfirmed: true },
  )
  const person = app.view.participants.value[1]
  const operation = app.view.confirmPresence(person)
  assert.match(app.alerts[0].text, /Ana Silva · 00123 · Câmara/)
  assert.equal(app.mutations().length, 0)
  await app.view.confirmPresence(person)
  finish({ isConfirmed: true })
  await operation
  assert.equal(app.mutations().length, 1)
  assert.deepEqual(JSON.parse(app.mutations()[0].options.body), {
    servidorId: 2,
    matricula: '00123',
  })
  assert.equal(app.view.participants.value[1].presente, true)
  assert.equal(app.view.participants.value[0].presente, false)
  assert.equal(app.view.indicatorData.value.presencasConfirmadas, 1)
  await app.view.confirmPresence(app.view.participants.value[1])
  assert.equal(app.mutations().length, 1)
  await app.view.undoPresence(app.view.participants.value[1])
  assert.equal(app.mutations()[1].url, '/api/credenciamentos/2')
  assert.equal(app.view.participants.value[1].presente, false)
})

test('cancel, stale results, loading and winners never submit a presence change', async () => {
  const app = setup()
  await app.view.refreshData()
  const person = app.view.participants.value[0]
  app.setConfirm(async () => ({ isConfirmed: false }))
  await app.view.confirmPresence(person)
  await app.view.confirmPresence({ ...person, id: 99 })
  app.view.loading.value = true
  await app.view.confirmPresence(person)
  app.view.loading.value = false
  person.contemplado = true
  person.presente = true
  await app.view.confirmPresence(person)
  await app.view.undoPresence(person)
  assert.equal(app.mutations().length, 0)
})
