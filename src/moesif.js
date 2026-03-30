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
  const delayMs = config.queryDelaySeconds * 1000;
  const to = new Date(now.getTime() - delayMs);
  const from = new Date(to.getTime() - config.queryWindowSeconds * 1000);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

// Single query that fetches all metrics in one API call
async function getAllMetrics() {
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
      unique_users: {
        cardinality: { field: 'user_id.raw' },
      },
      unique_companies: {
        cardinality: { field: 'company_id.raw' },
      },
    },
    size: 0,
  };
  return queryMoesif(path, body);
}

module.exports = {
  getAllMetrics,
};
