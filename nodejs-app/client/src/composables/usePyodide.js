/**
 * Pyodide 浏览器端 Python 执行器 — Jupyter Notebook 单元格运行
 */

let pyodideInstance = null
let loadPromise = null

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'

export function usePyodide() {
  async function loadPyodide() {
    if (pyodideInstance) return pyodideInstance
    if (loadPromise) return loadPromise

    loadPromise = (async () => {
      if (!window.loadPyodide) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script')
          script.src = `${PYODIDE_CDN}pyodide.js`
          script.onload = resolve
          script.onerror = reject
          document.head.appendChild(script)
        })
      }

      const pyodide = await window.loadPyodide({ indexURL: PYODIDE_CDN })
      await pyodide.loadPackage(['micropip', 'matplotlib', 'numpy', 'pandas', 'networkx'])

      pyodide.runPython(`
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
      `)

      pyodideInstance = pyodide
      return pyodide
    })()

    return loadPromise
  }

  async function runCell(code, analysisData) {
    const pyodide = await loadPyodide()

    pyodide.globals.set('analysis_data', analysisData)

    const stdout = []
    const stderr = []

    pyodide.setStdout({ batched: (s) => stdout.push(s) })
    pyodide.setStderr({ batched: (s) => stderr.push(s) })

    let result = { stdout: '', stderr: '', images: [], error: null }

    try {
      await pyodide.runPythonAsync(code)
      result.stdout = stdout.join('')
      result.stderr = stderr.join('')

      // Capture matplotlib figures
      const imgB64 = pyodide.runPython(`
import io, base64
figs = []
try:
    import matplotlib.pyplot as _plt
    for fig_num in _plt.get_fignums():
        fig = _plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
        buf.seek(0)
        figs.append(base64.b64encode(buf.read()).decode())
    _plt.close('all')
except Exception:
    pass
figs
      `)
      result.images = imgB64?.toJs?.() || imgB64 || []
    } catch (e) {
      result.error = e.message
      result.stderr = stderr.join('') || e.message
    }

    return result
  }

  async function runNotebook(notebook, analysisData, onProgress) {
    const results = []
    const pyodide = await loadPyodide()

    for (let i = 0; i < notebook.cells.length; i++) {
      const cell = notebook.cells[i]
      if (cell.cell_type !== 'code') {
        results.push({ index: i, type: 'markdown', source: cell.source })
        continue
      }

      const code = Array.isArray(cell.source) ? cell.source.join('') : cell.source
      if (onProgress) onProgress(i, notebook.cells.length, 'running')

      const output = await runCell(code, analysisData)
      results.push({ index: i, type: 'code', source: code, output })
    }

    if (onProgress) onProgress(notebook.cells.length, notebook.cells.length, 'done')
    return results
  }

  return { loadPyodide, runCell, runNotebook, isLoaded: () => !!pyodideInstance }
}
