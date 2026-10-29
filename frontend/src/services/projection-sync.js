import { mapDrawRecord } from './draw-view-model'

export function subscribeProjection(onState, onError = () => {}) {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
  const events = new EventSource(`${base}/projection/events`)
  events.onmessage = ({ data }) => {
    try {
      const state = JSON.parse(data)
      const draw = state.result ? mapDrawRecord(state.result, state.drawNumber) : null
      onState({
        ...state,
        type: 'state',
        ballNumber: state.phase === 'winner' ? draw?.matricula : '?',
        ...(state.phase === 'winner' ? { draw } : {}),
        ...(state.phase === 'preparing' ? { lastDraw: draw } : {}),
      })
    } catch {
      onError()
    }
  }
  events.onerror = onError
  return () => events.close()
}
