import { listDraws } from './draw-sevice'

export async function listDrawsForDisplay() {
  const draws = await listDraws()
  const chronological = [...draws].sort(
    (first, second) =>
      Date.parse(first.drawnAt) - Date.parse(second.drawnAt) || first.id - second.id,
  )

  return chronological.map((draw, index) => mapDrawRecord(draw, index + 1)).reverse()
}

export function mapDrawRecord(draw, number) {
  const participant = draw?.participant
  if (
    !draw ||
    !Number.isSafeInteger(draw.id) ||
    !Number.isSafeInteger(draw.participantId) ||
    !participant ||
    participant.id !== draw.participantId ||
    typeof participant.name !== 'string' ||
    !['PREFEITURA', 'CAMARA'].includes(participant.publicAgency) ||
    typeof draw.drawnAt !== 'string' ||
    !Number.isFinite(Date.parse(draw.drawnAt)) ||
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw new Error('A API retornou um resultado de sorteio inválido.')
  }

  return {
    id: draw.id,
    participanteId: draw.participantId,
    numero: number,
    nome: participant.name.toLocaleUpperCase('pt-BR'),
    matricula: participant.registrationNumber ?? '',
    origem: participant.publicAgency === 'CAMARA' ? 'camara' : 'prefeitura',
    localTrabalhoDescricao: participant.department?.toLocaleUpperCase('pt-BR') ?? '',
    sorteadoEm: draw.drawnAt,
    premioId: draw.prize?.id ?? null,
    premioNome: draw.prize?.name.toLocaleUpperCase('pt-BR') ?? null,
  }
}
