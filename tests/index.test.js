// Set env before requiring modules
process.env.MOESIF_MANAGEMENT_API_KEY = 'test-api-key';
process.env.MOESIF_QUERY_WINDOW_SECONDS = '60';
process.env.PORT = '0'; // random port

jest.mock('../src/moesif');
const moesif = require('../src/moesif');

const http = require('http');

let server;
let baseUrl;

beforeAll((done) => {
  moesif.getEventCount.mockResolvedValue({ count: 10 });
  moesif.getEventMetrics.mockResolvedValue({ aggregations: {} });
  moesif.getActiveUsers.mockResolvedValue({ aggregations: { unique_users: { value: 1 } } });
  moesif.getActiveCompanies.mockResolvedValue({ aggregations: { unique_companies: { value: 1 } } });

  // Require the app but we need to capture the server
  const express = require('express');
  const { register, collectMetrics } = require('../src/metrics');

  const app = express();

  app.get('/metrics', async (req, res) => {
    try {
      await collectMetrics();
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err.message);
    }
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  server = app.listen(0, () => {
    const port = server.address().port;
    baseUrl = `http://localhost:${port}`;
    done();
  });
});

afterAll((done) => {
  server.close(done);
});

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

describe('GET /health', () => {
  test('returns 200 with ok status', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });
});

describe('GET /metrics', () => {
  test('returns 200 with prometheus content type', async () => {
    const res = await get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  test('response contains prometheus metrics', async () => {
    const res = await get('/metrics');
    expect(res.body).toContain('moesif_api_calls_total');
    expect(res.body).toContain('# HELP');
    expect(res.body).toContain('# TYPE');
  });
});
