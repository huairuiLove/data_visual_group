/**
 * Pyodide 浏览器端 Python 执行器 — Jupyter Notebook 单元格运行
 */

let pyodideInstance = null
let loadPromise = null
const installedPackages = new Set(['micropip', 'matplotlib', 'numpy', 'pandas', 'networkx'])

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
const BASE_PACKAGES = ['micropip', 'matplotlib', 'numpy', 'pandas', 'networkx']
const STDLIB_MODULES = new Set([
  'abc', 'argparse', 'array', 'base64', 'bisect', 'collections', 'copy', 'csv', 'datetime',
  'decimal', 'enum', 'functools', 'hashlib', 'heapq', 'io', 'itertools', 'json', 'math',
  'operator', 'os', 'random', 're', 'statistics', 'string', 'sys', 'textwrap', 'time',
  'types', 'typing', 'uuid', 'warnings',
])
const PACKAGE_ALIASES = {
  PIL: 'pillow',
  bs4: 'beautifulsoup4',
  cv2: 'opencv-python',
  matplotlib: 'matplotlib',
  mpl_toolkits: 'matplotlib',
  networkx: 'networkx',
  numpy: 'numpy',
  pandas: 'pandas',
  scipy: 'scipy',
  seaborn: 'seaborn',
  sklearn: 'scikit-learn',
  statsmodels: 'statsmodels',
  sympy: 'sympy',
  wordcloud: 'wordcloud',
}

function importedModules(code) {
  const modules = new Set()
  const importRe = /^\s*import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*)/gm
  const fromRe = /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+/gm

  for (const match of code.matchAll(importRe)) {
    match[1].split(',').forEach((part) => {
      const name = part.trim().split(/\s+as\s+/)[0].split('.')[0]
      if (name) modules.add(name)
    })
  }
  for (const match of code.matchAll(fromRe)) {
    const name = match[1].split('.')[0]
    if (name) modules.add(name)
  }
  return [...modules]
}

async function ensurePackagesForCode(pyodide, code) {
  const packages = importedModules(code)
    .filter((name) => !STDLIB_MODULES.has(name))
    .map((name) => PACKAGE_ALIASES[name] || name)
    .filter((name) => name && !installedPackages.has(name))

  if (!packages.length) return []

  const loaded = []
  for (const pkg of [...new Set(packages)]) {
    try {
      await pyodide.loadPackage(pkg)
    } catch {
      const micropip = pyodide.pyimport('micropip')
      await micropip.install(pkg)
    }
    installedPackages.add(pkg)
    loaded.push(pkg)
  }
  return loaded
}

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
      await pyodide.loadPackage(BASE_PACKAGES)

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

    pyodide.globals.set('analysis_data', pyodide.toPy(analysisData || {}))

    const stdout = []
    const stderr = []

    pyodide.setStdout({ batched: (s) => stdout.push(s) })
    pyodide.setStderr({ batched: (s) => stderr.push(s) })

    let result = { stdout: '', stderr: '', images: [], error: null }

    try {
      const loadedPackages = await ensurePackagesForCode(pyodide, code)
      if (loadedPackages.length) stdout.push(`已按需加载 Python 包: ${loadedPackages.join(', ')}\n`)
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
    await loadPyodide()

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
