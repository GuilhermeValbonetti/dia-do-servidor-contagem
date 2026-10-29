import { getParticipantStats, listEligibleParticipants } from './participant-service'
import { listPrizes } from './prize-service'
import { listDraws } from './draw-sevice'

let indicatorsRequest = null

export function loadEventIndicators(fresh = false) {
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
  const [stats, eligibleParticipants, draws, prizes] = await Promise.all([
    getParticipantStats(),
    listEligibleParticipants(),
    listDraws(),
    listPrizes(),
  ])
  const quantityTotal = prizes.reduce((total, prize) => total + prize.quantityTotal, 0)
  const quantityAvailable = prizes.reduce((total, prize) => total + prize.quantityAvailable, 0)

  return {
    totalServidores: stats.totalParticipants,
    presencasConfirmadas: stats.presentParticipants,
    servidoresPendentes: stats.absentParticipants,
    elegiveis: eligibleParticipants.length,
    servidoresContemplados: draws.length,
    sorteiosRealizados: draws.length,
    premiosCadastrados: quantityTotal,
    premiosUtilizados: quantityTotal - quantityAvailable,
    premiosDisponiveis: quantityAvailable,
    proximoNumero: draws.length + 1,
  }
}
