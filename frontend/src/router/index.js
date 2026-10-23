import { createRouter, createWebHistory } from 'vue-router'

const EmptyView = {
  render: () => null,
}

const paths = ['/', '/credenciamento', '/sorteio', '/vencedores', '/premios', '/guia']

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: paths.map((path) => ({
    path,
    component: EmptyView,
  })),
})

export default router
