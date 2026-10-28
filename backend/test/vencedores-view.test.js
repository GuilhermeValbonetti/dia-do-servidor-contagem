import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import vm from 'node:vm'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createApp } from '../src/app.js'

const requireFrontend = createRequire(
  new URL('../../frontend/package.json', import.meta.url),
)
const Vue = requireFrontend('vue')
const { parse, compileScript, compileTemplate } =
  requireFrontend('@vue/compiler-sfc')
const { renderToString } = requireFrontend('@vue/server-renderer')
const source = readFileSync(
  new URL(
    '../../frontend/src/views/vencedores/VencedoresView.vue',
    import.meta.url,
  ),
  'utf8',
)
const { descriptor } = parse(source)
const script = compileScript(descriptor, { id: 'vencedores-test' })
  .content.replace(/^import\s+(?:[^'"]*?\s+from\s+)?['"][^'"]+['"];?\r?$/gm, '')
  .replace('export default', 'module.exports =')
const template = compileTemplate({
  source: descriptor.template.content,
  filename: 'VencedoresView.vue',
  id: 'vencedores-test',
  compilerOptions: { mode: 'function' },
})
assert.deepEqual(template.errors, [])
const render = new Function('Vue', template.code)(Vue)

function setup(fetch, reducedMotion = false) {
  const mounted = []
  const unmount = []
  const context = vm.createContext({
    module: { exports: {} },
    ref: Vue.ref,
    computed: Vue.computed,
    nextTick: Vue.nextTick,
    fetch,
    onMounted: (callback) => mounted.push(callback),
    onBeforeUnmount: (callback) => unmount.push(callback),
    window: {
      matchMedia: () => ({ matches: reducedMotion }),
      clearTimeout() {},
      setTimeout: () => 1,
    },
  })
  const service = readFileSync(
    new URL('../../frontend/src/services/sorteios.js', import.meta.url),
    'utf8',
  ).replace(/^export /gm, '')
  new vm.Script(service).runInContext(context)
  new vm.Script(script).runInContext(context)
  const view = context.module.exports.setup({}, { expose: () => {} })
  return {
    view,
    mounted,
    unmount,
    html: () =>
      renderToString(Vue.createSSRApp({ setup: () => ({ ...view }), render })),
  }
}

const makeDraw = (numero) => ({
  id: numero,
  numero,
  participanteId: numero + 100,
  nome: `Servidor teste ${numero}`,
  matricula: `000${numero}`,
  origem: numero % 2 ? 'camara' : 'prefeitura',
  // A sequência da rodada prevalece mesmo se o relógio do computador voltar.
  sorteadoEm: numero % 2 ? '2026-10-28T12:00:00Z' : '2026-10-27T12:00:00Z',
  premioId: numero === 1 ? 1 : null,
  premioNome: numero === 1 ? 'Prêmio teste' : null,
})
const rows = (count) =>
  Array.from({ length: count }, (_, index) => makeDraw(count - index))
const response = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
})
function history(data, url) {
  const query = new URL(url, 'http://localhost').searchParams
  const page = Number(query.get('page'))
  const limit = Number(query.get('limit'))
  return response({
    dados: data.slice((page - 1) * limit, page * limit),
    paginacao: {
      pagina: page,
      limite: limit,
      total: data.length,
      paginas: Math.ceil(data.length / limit),
    },
  })
}

for (const count of [0, 1, 2, 3, 5]) {
  test(`winners renders ${count} real results with unique cards and up to three highlights`, async () => {
    const app = setup(async (url) => history(rows(count), url))
    await app.mounted[0]()
    assert.equal(app.view.totalRecords.value, count)
    assert.equal(app.view.latestWinners.value.length, Math.min(count, 3))
    const displayed = app.view.winnerGroups.value.flatMap(
      (group) => group.winners,
    )
    assert.equal(new Set(displayed.map((winner) => winner.id)).size, count)
    assert.deepEqual(
      Array.from(displayed, (winner) => winner.drawNumber),
      rows(count).map((draw) => draw.numero),
    )
    const html = await app.html()
    assert.equal((html.match(/class="winner-card"/g) ?? []).length, count)
    if (!count) assert.match(html, /Nenhum vencedor registrado/)
    else {
      assert.match(html, /Matrícula 0001/)
      assert.match(html, /Câmara Municipal de Contagem/)
      assert.match(html, /Prêmio teste/)
      assert.match(html, /28\/10\/2026,? 09:00/)
    }
    if (count > 1) {
      assert.match(html, /Prefeitura Municipal de Contagem/)
      assert.match(html, /Sorteio sem prêmio associado/)
    }
    assert.doesNotMatch(
      html,
      /Bruno Lopes|Carolina Duarte|DADOS DEMONSTRATIVOS/,
    )
  })
}

test('winners paginates the complete history, keeps global highlights and reloads on route entry', async () => {
  let data = rows(23)
  const requests = []
  const app = setup(async (url) => {
    requests.push(url)
    return history(data, url)
  })
  await app.mounted[0]()
  assert.equal(app.view.winners.value.length, 20)
  assert.equal(app.view.winnerGroups.value[1].winners.length, 17)
  await app.view.changePage(2)
  assert.equal(app.view.currentPage.value, 2)
  assert.deepEqual(
    Array.from(app.view.latestWinners.value, (winner) => winner.id),
    [23, 22, 21],
  )
  assert.deepEqual(
    Array.from(app.view.winners.value, (winner) => winner.id),
    [3, 2, 1],
  )
  assert.equal((await app.html()).match(/class="winner-card"/g).length, 6)
  const count = requests.length
  await app.view.changePage(3)
  assert.equal(requests.length, count)
  data = rows(24)
  const returned = setup(async (url) => history(data, url))
  await returned.mounted[0]()
  assert.equal(returned.view.latestWinners.value[0].id, 24)
  assert.equal(returned.view.totalRecords.value, 24)
})

test('API failures and malformed responses show errors, preserve loaded data and allow retry', async () => {
  let failure = null
  const app = setup(async (url) => {
    if (failure === 'network') throw new Error('offline')
    if (failure === 'json')
      return {
        ok: true,
        json: async () => {
          throw new Error('invalid JSON')
        },
      }
    if (failure === 'shape') return response({ dados: [{}], paginacao: {} })
    if (failure === 'server') return response({ erro: 'Falha no banco' }, 500)
    return history(rows(1), url)
  })
  await app.view.loadWinners()
  for (const kind of ['network', 'json', 'shape', 'server']) {
    failure = kind
    await app.view.loadWinners()
    assert.ok(app.view.loadError.value)
    assert.equal(app.view.winners.value[0].id, 1)
    const html = await app.html()
    assert.match(html, /Tentar novamente/)
    assert.doesNotMatch(
      html.split('<dialog')[0],
      /class="winner-card"|Nenhum vencedor registrado|operação pendente/,
    )
  }
  failure = null
  await app.view.loadWinners()
  assert.equal(app.view.loadError.value, '')
})

test('individual and collective celebrations are read only and collective results stay paginated', async () => {
  const requests = []
  const app = setup(async (url, options) => {
    requests.push({ url, options })
    return history(rows(23), url)
  })
  await app.view.loadWinners()
  const before = requests.length
  await app.view.celebrate([app.view.latestWinners.value[0]])
  assert.equal(requests.length, before)
  assert.equal(app.view.celebrationWinners.value[0].id, 23)
  assert.equal(app.view.confettiPieces.value.length, 100)
  await app.view.celebrateAll()
  assert.equal(app.view.celebrationWinners.value.length, 20)
  assert.equal(app.view.celebrationTotal.value, 23)
  await app.view.loadCelebrationPage(2)
  assert.deepEqual(
    Array.from(app.view.celebrationWinners.value, (winner) => winner.id),
    [3, 2, 1],
  )
  assert.ok(
    requests.every(
      ({ options }) => !options?.method || options.method === 'GET',
    ),
  )
  app.unmount[0]()
  assert.equal(app.view.confettiPieces.value.length, 0)
})

test('outdated responses cannot replace the newest page or reopen a closed celebration', async () => {
  let finish
  let delayed = false
  const app = setup(async (url) =>
    delayed
      ? new Promise((resolve) => {
          finish = () => resolve(history(rows(23), url))
        })
      : history(rows(23), url),
  )
  await app.view.loadWinners()
  delayed = true
  const pending = app.view.loadWinners()
  await new Promise((resolve) => setImmediate(resolve))
  delayed = false
  await app.view.loadWinners(2)
  finish()
  await pending
  assert.equal(app.view.currentPage.value, 2)
  delayed = true
  const celebration = app.view.celebrateAll()
  await new Promise((resolve) => setImmediate(resolve))
  app.view.clearCelebration()
  finish()
  await celebration
  assert.equal(app.view.celebrationWinners.value.length, 0)
  assert.equal(app.view.confettiPieces.value.length, 0)
})

test('winners renders persisted SQLite joins after reopening a disposable database', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vencedores-'))
  const databasePath = path.join(directory, 'descartavel.sqlite')
  let db
  let server
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
    if (db?.open) db.close()
    await rm(directory, { recursive: true, force: true })
  })
  await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import db from './src/database.js'; db.close()",
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, DB_PATH: databasePath },
    },
  )
  db = new Database(databasePath)
  db.pragma('foreign_keys = ON')
  db.exec(`INSERT INTO servidores (id, nome, matricula, origem) VALUES
    (1, 'Servidor persistido', '00001', 'camara'), (2, 'Servidor persistido', '00001', 'prefeitura');
    INSERT INTO credenciamentos (servidor_id) VALUES (1), (2);
    INSERT INTO premios (id, nome) VALUES (1, 'Prêmio persistido');
    INSERT INTO sorteios (numero, servidor_id, premio_id) VALUES (1, 1, 1);
    INSERT INTO sorteios (numero, servidor_id) VALUES (2, 2);`)
  db.close()
  db = new Database(databasePath, { readonly: true })
  server = createApp(db).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const app = setup((url) =>
    fetch(`http://127.0.0.1:${server.address().port}${url}`),
  )
  await app.mounted[0]()
  assert.equal(app.view.totalRecords.value, 2)
  assert.equal(app.view.latestWinners.value[0].drawNumber, 2)
  const html = await app.html()
  assert.equal((html.match(/class="winner-card"/g) ?? []).length, 2)
  assert.match(html, /Prêmio persistido/)
  assert.match(html, /Sorteio sem prêmio associado/)
  assert.match(html, /Câmara Municipal de Contagem/)
  assert.match(html, /Prefeitura Municipal de Contagem/)
  assert.equal(db.prepare('SELECT COUNT(*) total FROM sorteios').get().total, 2)
})
