import { onMounted, onBeforeUnmount } from 'vue'

export function startLiveUpdates() {
  const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
  const events = new EventSource(`${base}/events`)
  events.onmessage = () => window.dispatchEvent(new Event('evento-atualizado'))
  return () => events.close()
}

// Aguarda operações em andamento e agrupa alterações consecutivas.
export function useLiveRefresh(refresh, isBusy = () => false) {
  let timer
  let active = true
  let refreshing = false
  const schedule = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(async () => {
      if (!active) return
      if (refreshing || isBusy()) {
        schedule()
        return
      }
      refreshing = true
      try {
        await refresh()
      } finally {
        refreshing = false
      }
    }, 250)
  }
  onMounted(() => window.addEventListener('evento-atualizado', schedule))
  onBeforeUnmount(() => {
    active = false
    window.clearTimeout(timer)
    window.removeEventListener('evento-atualizado', schedule)
  })
}
