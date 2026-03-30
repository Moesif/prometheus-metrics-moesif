const config = require('./config');

async function queryMoesif(path, body = {}) {
  const url = `${config.moesifBaseUrl}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${config.moesifApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Moesif API error ${res.status}: ${text}`);
  }

  return res.json();
}

function buildTimeRange() {
  const now = new Date();
  const from = new Date(now.getTime() - config.queryWindowSeconds * 1000);
  return {
    from: from.toISOString(),
    to: now.toISOString(),
  };
}

// Total event count in the time window
async function getEventCount() {
  const { from, to } = buildTimeRange();
  const path = `/search/~/count/events?from=${from}&to=${to}`;
  return queryMoesif(path, {});
}

// Event count with aggregations: status codes, latency percentiles, top routes
async function getEventMetrics() {
  const { from, to } = buildTimeRange();
  const path = `/search/~/search/events?from=${from}&to=${to}`;
  const body = {
    aggs: {
      status_class: {
        terms: { field: 'response.status', size: 20 },
      },
      latency_percentiles: {
        percentiles: {
          field: 'duration_ms',
          percents: [50, 90, 99],
        },
      },
      by_route: {
        terms: { field: 'request.route.raw', size: 50 },
        aggs: {
          status_codes: {
            terms: { field: 'response.status', size: 10 },
          },
          latency: {
            percentiles: {
              field: 'duration_ms',
              percents: [50, 90, 99],
            },
          },
        },
      },
    },
    size: 0,
  };
  return queryMoesif(path, body);
}

// Unique user count
async function getActiveUsers() {
  const { from, to } = buildTimeRange();
  const path = `/search/~/search/events?from=${from}&to=${to}`;
  const body = {
    aggs: {
      unique_users: {
        cardinality: { field: 'user_id.raw' },
      },
    },
    size: 0,
  };
  return queryMoesif(path, body);
}

// Unique company count
async function getActiveCompanies() {
  const { from, to } = buildTimeRange();
  const path = `/search/~/search/events?from=${from}&to=${to}`;
  const body = {
    aggs: {
      unique_companies: {
        cardinality: { field: 'company_id.raw' },
      },
    },
    size: 0,
  };
  return queryMoesif(path, body);
}

module.exports = {
  getEventCount,
  getEventMetrics,
  getActiveUsers,
  getActiveCompanies,
};
