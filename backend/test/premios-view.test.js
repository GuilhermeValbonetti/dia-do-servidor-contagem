import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

// Executa o setup real com Vue e seu compilador já instalados, sem dependências de navegador.
const requireFrontend = createRequire(
  new URL('../../frontend/package.json', import.meta.url),
)
const { parse, compileScript } = requireFrontend('@vue/compiler-sfc')
const { ref, computed } = requireFrontend('vue')
const source = readFileSync(
  new URL('../../frontend/src/views/premios/PremiosView.vue', import.meta.url),
  'utf8',
)
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'premios-test' })
  .content.replace(/^import .*$/gm, '')
  .replace('export default', 'module.exports =')

function setup(fetch, fire = async () => ({ isConfirmed: true })) {
  const alerts = []
  const context = vm.createContext({
    module: { exports: {} },
    ref,
    computed,
    onMounted: () => {},
    fetch,
    Swal: {
      fire: async (options) => {
        alerts.push(options)
        return fire(options)
      },
    },
  })
  new vm.Script(script).runInContext(context)
  return {
    view: context.module.exports.setup({}, { expose: () => {} }),
    alerts,
  }
}

const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
})

test('prize form blocks repeated submits while the first POST is pending', async () => {
  let finishPost
  const calls = []
  const { view, alerts } = setup(async (url, options) => {
    calls.push({ url, options })
    if (options?.method === 'POST')
      return new Promise((resolve) => {
        finishPost = resolve
      })
    return json({ dados: [{ id: 1, nome: 'Caixa de som', utilizado: false }] })
  })
  view.prizeName.value = ' Caixa   de som '
  const first = view.addPrize()
  assert.equal(view.isSaving.value, true)
  await view.addPrize()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.body, JSON.stringify({ nome: 'Caixa de som' }))
  finishPost(json({ id: 1, nome: 'Caixa de som', utilizado: false }, 201))
  await first
  assert.equal(view.isSaving.value, false)
  assert.equal(view.prizeName.value, '')
  assert.equal(view.availableCount.value, 1)
  assert.equal(alerts.at(-1).icon, 'success')
})

test('prize form validates locally and reports connection errors without clearing the name', async () => {
  let calls = 0
  const { view, alerts } = setup(async () => {
    calls += 1
    throw new Error('offline')
  })
  view.prizeName.value = '   '
  await view.addPrize()
  assert.equal(calls, 0)
  assert.match(view.formMessage.value, /Informe/)
  view.prizeName.value = 'Bicicleta'
  await view.addPrize()
  assert.equal(view.prizeName.value, 'Bicicleta')
  assert.equal(view.isSaving.value, false)
  assert.equal(alerts.at(-1).icon, 'error')
  await view.loadPrizes()
  assert.match(view.loadError.value, /conectar/)
  assert.equal(view.loading.value, false)
})

test('deletion waits for confirmation, blocks repeated clicks and refreshes on server rejection', async () => {
  let confirm
  const calls = []
  const { view, alerts } = setup(
    async (url, options) => {
      calls.push({ url, options })
      if (options?.method === 'DELETE')
        return json({ erro: 'Prêmio associado a sorteio.' }, 409)
      return json({ dados: [{ id: 1, nome: 'Bicicleta', utilizado: true }] })
    },
    async (options) =>
      options.title === 'Excluir prêmio?'
        ? new Promise((resolve) => {
            confirm = resolve
          })
        : {},
  )
  const prize = { id: 1, nome: 'Bicicleta', utilizado: false }
  const first = view.removePrize(prize)
  await view.removePrize(prize)
  assert.equal(calls.length, 0)
  confirm({ isConfirmed: true })
  await first
  assert.equal(
    calls.filter(({ options }) => options?.method === 'DELETE').length,
    1,
  )
  assert.match(alerts.find(({ icon }) => icon === 'error').text, /sorteio/)
  assert.equal(view.prizes.value[0].utilizado, true)
  assert.equal(view.availableCount.value, 0)
  assert.equal(view.isSaving.value, false)
  await view.removePrize(view.prizes.value[0])
  assert.equal(calls.length, 2)
})

test('cancelling deletion sends no request and malformed API responses show a load error', async () => {
  let calls = 0
  const { view } = setup(
    async () => {
      calls += 1
      return {
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('invalid JSON')
        },
      }
    },
    async () => ({ isConfirmed: false }),
  )
  await view.removePrize({ id: 1, nome: 'Bicicleta', utilizado: false })
  assert.equal(calls, 0)
  assert.equal(view.isSaving.value, false)
  await view.loadPrizes()
  assert.match(view.loadError.value, /resposta inválida/)
})
