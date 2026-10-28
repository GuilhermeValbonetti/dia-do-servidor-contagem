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

test('credenciamento identifies API environment and never assumes official on failure', async () => {
  let response = { status: 'ok', ambiente: 'testes' }
  const context = vm.createContext({
    module: { exports: {} },
    ref,
    computed,
    watch() {},
    onMounted() {},
    onUnmounted() {},
    Swal: {},
    fetch: async () => ({ ok: true, json: async () => response }),
  })
  const { descriptor } = parse(source)
  const code = compileScript(descriptor, { id: 'environment-test' })
    .content.replace(/^import\s+(?:[^'"]*?\s+from\s+)?['"][^'"]+['"];?\r?$/gm, '')
    .replace('export default', 'module.exports =')
  new vm.Script(code).runInContext(context)
  const view = context.module.exports.setup({}, { expose() {} })
  assert.equal(view.environmentLabel.value, 'AMBIENTE NÃO CONFIRMADO')
  for (const [ambiente, label] of [
    ['testes', 'AMBIENTE DE TESTES'],
    ['oficial', 'BASE OFICIAL'],
    ['configurado', 'AMBIENTE CONFIGURADO'],
    ['desconhecido', 'AMBIENTE NÃO CONFIRMADO'],
  ]) {
    response = { status: 'ok', ambiente }
    await view.loadEnvironment()
    assert.equal(view.environmentLabel.value, label)
  }
  context.fetch = async () => {
    throw new Error('offline')
  }
  await view.loadEnvironment()
  assert.equal(view.environmentLabel.value, 'AMBIENTE NÃO CONFIRMADO')
  assert.match(descriptor.template.content, /\{\{ environmentLabel \}\}/)
})
