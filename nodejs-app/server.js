const express = require('express')
const path = require('path')
const fs = require('fs')
const { loadEnv } = require('./services/env-loader')
loadEnv()

const config = require('./config')
const { router: apiRouter } = require('./routes/api')
const { closeDriver } = require('./services/neo4j')
const { sendError } = require('./services/errors')

const app = express()

app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

const vueDist = path.join(__dirname, 'client', 'dist')

app.use('/api', apiRouter)
app.use('/data', express.static(path.join(__dirname, 'data')))

if (fs.existsSync(vueDist)) {
  app.use(express.static(vueDist))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/data')) {
      res.sendFile(path.join(vueDist, 'index.html'))
    }
  })
} else {
  app.get('/', (_req, res) => {
    res.status(503).type('text/plain').send('Frontend not built. Run from repo root: bun run build')
  })
}

app.use((err, req, res, _next) => {
  sendError(res, err, 'Server error')
})

const PORT = config.port
const HOST = config.host
const { ensureSchema } = require('./services/research-report-db')

const server = app.listen(PORT, HOST, async () => {
  console.log(`DataGraphX server running on http://${HOST}:${PORT}`)
  try {
    await ensureSchema()
    console.log('ResearchReport Neo4j schema ready')
  } catch (e) {
    console.warn('ResearchReport schema init skipped:', e.message)
  }
})

server.on('error', (error) => {
  console.error(`Unable to start server on http://${HOST}:${PORT}: ${error.message}`)
  process.exit(1)
})

process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  server.close()
  await closeDriver()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  server.close()
  await closeDriver()
  process.exit(0)
})
