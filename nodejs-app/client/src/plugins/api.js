import { defineNuxtPlugin } from '#app'
import { api } from '../services/api'

export default defineNuxtPlugin(() => ({
  provide: {
    api,
  },
}))
