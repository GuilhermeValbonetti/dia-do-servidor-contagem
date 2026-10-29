import type { DrawResult } from '@services/draw-sevice'
import type { Participant } from '@services/participant-service'
import type { DrawStatus } from '@/components/draw board/DrawCard.vue'

export type DrawScreenParticipant = Pick<
  Participant,
  'name' | 'publicAgency' | 'registrationNumber'
>

export interface DrawScreenWinner {
  participant: DrawScreenParticipant
  prize: Pick<NonNullable<DrawResult['prize']>, 'name'> | null
}

export interface DrawScreenState {
  status: DrawStatus
  previewParticipant: DrawScreenParticipant | null
  winner: DrawScreenWinner | null
  selectedPrizeName: string | null
  reducedMotion: boolean
  celebrating: boolean
  preparingNextDraw: boolean
}

export type DrawScreenMessage =
  { type: 'ready' } | { type: 'state'; state: DrawScreenState } | { type: 'cancel' }

export function getDrawScreenChannelName(id: string) {
  return `pmc-draw-screen-${id}`
}
