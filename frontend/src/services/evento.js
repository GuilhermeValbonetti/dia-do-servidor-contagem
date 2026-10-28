let indicatorsRequest = null

export function loadEventIndicators(fresh = false) {
  // Compartilha apenas consultas simultâneas; a próxima navegação consulta a API novamente.
  if (fresh || !indicatorsRequest) {
    const request = fetchIndicators()
    indicatorsRequest = request
    const clear = () => {
      if (indicatorsRequest === request) indicatorsRequest = null
    }
    request.then(clear, clear)
  }
  return indicatorsRequest
}

async function fetchIndicators() {
  let response
  try {
    response = await fetch('/api/evento/indicadores')
  } catch {
    throw new Error('Não foi possível consultar os indicadores. Verifique a conexão com a API.')
  }
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('A API retornou indicadores inválidos.')
  }
  if (!response.ok)
    throw new Error('Não foi possível consultar os indicadores na API. Tente novamente.')
  const fields = [
    'totalServidores',
    'presencasConfirmadas',
    'servidoresPendentes',
    'elegiveis',
    'servidoresContemplados',
    'sorteiosRealizados',
    'premiosCadastrados',
    'premiosUtilizados',
    'premiosDisponiveis',
  ]
  if (
    !data ||
    !fields.every((field) => Number.isSafeInteger(data[field]) && data[field] >= 0) ||
    data.servidoresPendentes !== data.totalServidores - data.presencasConfirmadas ||
    data.elegiveis !== data.presencasConfirmadas - data.servidoresContemplados ||
    data.sorteiosRealizados !== data.servidoresContemplados ||
    data.premiosDisponiveis !== data.premiosCadastrados - data.premiosUtilizados
  ) {
    throw new Error('A API retornou indicadores inválidos.')
  }
  return data
}
