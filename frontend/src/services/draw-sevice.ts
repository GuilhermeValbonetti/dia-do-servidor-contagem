import api from '@services/api'
import type { PublicAgency } from '@services/participant-service'

export interface DrawResult {
  id: number
  participantId: number
  prizeId: number | null
  drawnAt: string
  participant: {
    id: number
    name: string
    registrationNumber: string | null
    publicAgency: PublicAgency
    present: boolean
    participationNumber: number | null
  }
  prize: {
    id: number
    name: string
  } | null
}

export interface DrawSession {
  id: string
  prizeId: number | null
  expiresInMs: number
}

interface PendingDrawSession {
  id: string
  prizeId: number | null
}

interface DrawListResponse {
  sorteios: DrawResult[]
}

interface DrawResponse {
  sorteio: DrawResult
}

interface DrawSessionResponse {
  sessao: DrawSession
}

export async function listDraws() {
  const { data } = await api.get<DrawListResponse>('/draws')
  return data.sorteios
}

export async function resetDrawHistory() {
  const { data } = await api.post<{
    deletedDraws: number
    resetParticipants: number
  }>('/draws/reset')
  return data
}

export async function startDrawSession(prizeId?: number) {
  const { data } = await api.post<DrawSessionResponse>(
    '/draws/sessions',
    prizeId !== undefined ? { prizeId } : {},
  )

  return data.sessao
}

export async function cancelDrawSession(sessionId: string) {
  await api.post(`/draws/sessions/${encodeURIComponent(sessionId)}/cancel`)
}

export async function completeDrawSession(sessionId: string) {
  const { data } = await api.post<DrawResponse>(
    `/draws/sessions/${encodeURIComponent(sessionId)}/complete`,
  )

  return data.sorteio
}

export const pendingDrawKey = 'dia-do-servidor-sorteio-pendente'

export function readPendingDraw(): PendingDrawSession | null {
  const saved = localStorage.getItem(pendingDrawKey)
  if (!saved) return null

  const session: unknown = JSON.parse(saved)
  if (!isPendingDrawSession(session)) {
    throw new Error(
      'O registro da operação pendente não é compatível com uma sessão de sorteio. Verifique o histórico antes de continuar.',
    )
  }

  return session
}

export function clearPendingDraw(sessionId: string) {
  if (readPendingDraw()?.id === sessionId) {
    localStorage.removeItem(pendingDrawKey)
  }
}

function isPendingDrawSession(value: unknown): value is PendingDrawSession {
  if (typeof value !== 'object' || value === null || !('id' in value)) return false
  if (
    typeof value.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) ||
    !('prizeId' in value)
  ) {
    return false
  }

  return (
    value.prizeId === null ||
    (typeof value.prizeId === 'number' && Number.isSafeInteger(value.prizeId) && value.prizeId > 0)
  )
}
