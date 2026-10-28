export async function requestDrawApi(url, options) {
  let response
  try {
    response = await fetch(url, options)
  } catch {
    throw new Error(
      'Não foi possível conectar à API. A operação pendente será preservada para recuperação.',
    )
  }
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('A API retornou uma resposta inválida. Consulte novamente a operação pendente.')
  }
  if (!response.ok) {
    throw Object.assign(new Error(data.erro || 'Não foi possível concluir a operação.'), {
      status: response.status,
    })
  }
  return data
}

export const pendingDrawKey = 'dia-do-servidor-sorteio-pendente'

export function readPendingDraw() {
  const saved = localStorage.getItem(pendingDrawKey)
  if (!saved) return null
  const operation = JSON.parse(saved)
  if (
    typeof operation.chave !== 'string' ||
    !/^[a-zA-Z0-9-]{16,80}$/.test(operation.chave) ||
    !Number.isSafeInteger(operation.numeroEsperado) ||
    operation.numeroEsperado < 1 ||
    (operation.premioId !== null &&
      (!Number.isSafeInteger(operation.premioId) || operation.premioId < 1))
  ) {
    throw new Error(
      'O registro da operação pendente é inválido. Verifique o histórico antes de continuar.',
    )
  }
  return operation
}

export function clearPendingDraw(chave) {
  if (readPendingDraw()?.chave === chave) localStorage.removeItem(pendingDrawKey)
}
