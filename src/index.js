const express = require('express');
const config = require('./config');
const { register, collectMetrics } = require('./metrics');

const app = express();

app.get('/metrics', async (req, res) => {
  try {
    await collectMetrics();
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    console.error('Error serving /metrics:', err.message);
    res.status(500).end(err.message);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(config.port, () => {
  console.log(`Prometheus Moesif exporter listening on port ${config.port}`);
  console.log(`Metrics available at http://localhost:${config.port}/metrics`);
  console.log(`Query window: last ${config.queryWindowSeconds} seconds`);
});
