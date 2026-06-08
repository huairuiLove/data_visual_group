import { defineNuxtPlugin } from '#app'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    components,
    directives,
    theme: {
      defaultTheme: 'datagraphx',
      themes: {
        datagraphx: {
          dark: true,
          colors: {
            background: '#111317',
            surface: '#181b20',
            'surface-bright': '#22262d',
            primary: '#4fb3a5',
            secondary: '#d6a24f',
            error: '#e25f5f',
            info: '#68a0cf',
            success: '#5fa878',
            warning: '#d6a24f',
          },
        },
      },
    },
    defaults: {
      VBtn: {
        rounded: 'sm',
        variant: 'flat',
      },
      VCard: {
        rounded: 'sm',
        elevation: 0,
      },
      VTextField: {
        density: 'comfortable',
        variant: 'solo-filled',
      },
      VCombobox: {
        density: 'comfortable',
        variant: 'solo-filled',
      },
      VSelect: {
        density: 'comfortable',
        variant: 'solo-filled',
      },
      VFileInput: {
        density: 'comfortable',
        variant: 'solo-filled',
      },
      VExpansionPanel: {
        rounded: 'sm',
      },
    },
  })

  nuxtApp.vueApp.use(vuetify)
})
