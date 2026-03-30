const client = require('prom-client');
const moesif = require('./moesif');
const config = require('./config');

const register = new client.Registry();

register.setDefaultLabels({ source: 'moesif' });

// --- Metric definitions ---

const apiCallsTotal = new client.Gauge({
  name: 'moesif_api_calls_total',
  help: `Total API calls in the last ${config.queryWindowSeconds}s window`,
  registers: [register],
});

const apiCallsByStatus = new client.Gauge({
  name: 'moesif_api_calls_by_status',
  help: 'API calls broken down by HTTP status code',
  labelNames: ['status_code'],
  registers: [register],
});

const latencyP50 = new client.Gauge({
  name: 'moesif_api_latency_p50_ms',
  help: 'API latency 50th percentile in milliseconds',
  registers: [register],
});

const latencyP90 = new client.Gauge({
  name: 'moesif_api_latency_p90_ms',
  help: 'API latency 90th percentile in milliseconds',
  registers: [register],
});

const latencyP99 = new client.Gauge({
  name: 'moesif_api_latency_p99_ms',
  help: 'API latency 99th percentile in milliseconds',
  registers: [register],
});

const activeUsers = new client.Gauge({
  name: 'moesif_active_users',
  help: `Unique active users in the last ${config.queryWindowSeconds}s window`,
  registers: [register],
});

const activeCompanies = new client.Gauge({
  name: 'moesif_active_companies',
  help: `Unique active companies in the last ${config.queryWindowSeconds}s window`,
  registers: [register],
});

const apiCallsByRoute = new client.Gauge({
  name: 'moesif_api_calls_by_route',
  help: 'API calls broken down by route and status code',
  labelNames: ['route', 'status_code'],
  registers: [register],
});

const latencyByRoute = new client.Gauge({
  name: 'moesif_api_latency_by_route_ms',
  help: 'API latency percentiles by route',
  labelNames: ['route', 'percentile'],
  registers: [register],
});

const scrapeErrors = new client.Counter({
  name: 'moesif_scrape_errors_total',
  help: 'Total number of errors when scraping Moesif API',
  registers: [register],
});

const scrapeDuration = new client.Gauge({
  name: 'moesif_scrape_duration_ms',
  help: 'Time taken to collect metrics from Moesif API in milliseconds',
  registers: [register],
});

// --- Collection logic ---

async function collectMetrics() {
  const start = Date.now();

  try {
    const [eventCountRes, eventMetricsRes, usersRes, companiesRes] = await Promise.all([
      moesif.getEventCount(),
      moesif.getEventMetrics(),
      moesif.getActiveUsers(),
      moesif.getActiveCompanies(),
    ]);

    // Total event count
    const total = typeof eventCountRes === 'number' ? eventCountRes : (eventCountRes.count || eventCountRes.hits?.total || 0);
    apiCallsTotal.set(total);

    // Aggregations from event metrics
    const aggs = eventMetricsRes.aggregations || {};

    // Status code breakdown
    apiCallsByStatus.reset();
    if (aggs.status_class?.buckets) {
      for (const bucket of aggs.status_class.buckets) {
        apiCallsByStatus.set({ status_code: String(bucket.key) }, bucket.doc_count);
      }
    }

    // Global latency percentiles
    if (aggs.latency_percentiles?.values) {
      const vals = aggs.latency_percentiles.values;
      latencyP50.set(vals['50.0'] || 0);
      latencyP90.set(vals['90.0'] || 0);
      latencyP99.set(vals['99.0'] || 0);
    }

    // Per-route breakdown
    apiCallsByRoute.reset();
    latencyByRoute.reset();
    if (aggs.by_route?.buckets) {
      for (const routeBucket of aggs.by_route.buckets) {
        const route = routeBucket.key;

        // Status codes per route
        if (routeBucket.status_codes?.buckets) {
          for (const statusBucket of routeBucket.status_codes.buckets) {
            apiCallsByRoute.set(
              { route, status_code: String(statusBucket.key) },
              statusBucket.doc_count,
            );
          }
        }

        // Latency per route
        if (routeBucket.latency?.values) {
          const vals = routeBucket.latency.values;
          latencyByRoute.set({ route, percentile: 'p50' }, vals['50.0'] || 0);
          latencyByRoute.set({ route, percentile: 'p90' }, vals['90.0'] || 0);
          latencyByRoute.set({ route, percentile: 'p99' }, vals['99.0'] || 0);
        }
      }
    }

    // Active users
    const userCount = usersRes.aggregations?.unique_users?.value || 0;
    activeUsers.set(userCount);

    // Active companies
    const companyCount = companiesRes.aggregations?.unique_companies?.value || 0;
    activeCompanies.set(companyCount);

  } catch (err) {
    scrapeErrors.inc();
    console.error('Error collecting Moesif metrics:', err.message);
  }

  scrapeDuration.set(Date.now() - start);
}

module.exports = { register, collectMetrics };
