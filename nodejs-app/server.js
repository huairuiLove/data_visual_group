const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadEnv } = require('./services/env-loader');
loadEnv();

const config = require('./config');
const { router: apiRouter } = require('./routes/api');
const { closeDriver } = require('./services/neo4j');
const { sendError } = require('./services/errors');

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const isDev = process.env.NODE_ENV !== 'production';
const vueDist = path.join(__dirname, 'client', 'dist');
const viteDevServer = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

// API routes stay on Express in every environment.
app.use('/api', apiRouter);

// Serve data files
app.use('/data', express.static(path.join(__dirname, 'data')));

if (!isDev && fs.existsSync(vueDist)) {
  // Production: serve the built Vue SPA from Express.
  app.use(express.static(vueDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/data')) {
      res.sendFile(path.join(vueDist, 'index.html'));
    }
  });
} else {
  // Development: Vite owns the Vue app; Express is the API/data backend.
  app.get('/', (req, res) => res.redirect(viteDevServer));
}

// Error handler
app.use((err, req, res, _next) => {
  sendError(res, err, 'Server error');
});

// Start
const PORT = config.port;
const HOST = config.host;
const { ensureSchema } = require('./services/research-report-db');

const server = app.listen(PORT, HOST, async () => {
  console.log(`DataGraphX Node.js server running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  try {
    await ensureSchema();
    console.log('ResearchReport Neo4j schema ready');
  } catch (e) {
    console.warn('ResearchReport schema init skipped:', e.message);
  }
});

server.on('error', (error) => {
  console.error(`Unable to start server on http://${HOST}:${PORT}: ${error.message}`);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  server.close();
  await closeDriver();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  server.close();
  await closeDriver();
  process.exit(0);
});
