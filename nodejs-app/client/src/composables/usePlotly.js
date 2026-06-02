/**
 * Plotly.js composable for Vue 3
 */
import { ref, onMounted, onUnmounted } from 'vue'

let plotlyPromise = null

function loadPlotly() {
  if (!plotlyPromise) {
    plotlyPromise = import('plotly.js-dist-min').then((module) => module.default || module)
  }
  return plotlyPromise
}

export function usePlotly(elRef, options = {}) {
  const plotReady = ref(false)

  function render(data, layout = {}) {
    const el = elRef.value
    if (!el) return

    const defaultLayout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#888' },
      margin: { l: 40, r: 20, t: 40, b: 40 },
      ...options.layout,
      ...layout,
    }

    loadPlotly().then((Plotly) => {
      if (!elRef.value) return
      Plotly.newPlot(el, data, defaultLayout, {
        responsive: true,
        displayModeBar: false,
      })
      plotReady.value = true
    })
  }

  function resize() {
    const el = elRef.value
    if (el) {
      loadPlotly().then((Plotly) => Plotly.Plots.resize(el))
    }
  }

  onMounted(() => window.addEventListener('resize', resize))
  onUnmounted(() => window.removeEventListener('resize', resize))

  return { plotReady, render, resize }
}

export function generateColors(n) {
  const colors = []
  for (let i = 0; i < n; i++) {
    const hue = (i / n) * 360
    const h = hue / 60
    const x = 1 - Math.abs((h % 2) - 1)
    let r, g, b
    if (h < 1) { r = 1; g = x; b = 0 }
    else if (h < 2) { r = x; g = 1; b = 0 }
    else if (h < 3) { r = 0; g = 1; b = x }
    else if (h < 4) { r = 0; g = x; b = 1 }
    else if (h < 5) { r = x; g = 0; b = 1 }
    else { r = 1; g = 0; b = x }
    const m = 0.55
    r = Math.round((r * 0.7 + 0.3) * m * 255)
    g = Math.round((g * 0.7 + 0.3) * m * 255)
    b = Math.round((b * 0.7 + 0.3) * m * 255)
    colors.push(`rgb(${r},${g},${b})`)
  }
  return colors
}
