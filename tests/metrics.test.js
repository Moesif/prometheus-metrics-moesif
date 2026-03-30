// Set env before requiring modules
process.env.MOESIF_MANAGEMENT_API_KEY = 'test-api-key';
process.env.MOESIF_QUERY_WINDOW_SECONDS = '60';

// Mock the moesif module so we don't make real API calls
jest.mock('../src/moesif');
const moesif = require('../src/moesif');
const { register, collectMetrics, _resetCacheForTesting } = require('../src/metrics');

// Helper to get a metric value from the registry
async function getMetricValue(name, labels) {
  const metric = await register.getSingleMetric(name).get();
  if (labels) {
    const match = metric.values.find((v) =>
      Object.entries(labels).every(([k, val]) => v.labels[k] === val),
    );
    return match ? match.value : undefined;
  }
  return metric.values[0]?.value;
}

// Full mock response from Moesif
const mockEventMetricsResponse = {
  aggregations: {
    status_class: {
      buckets: [
        { key: 200, doc_count: 100 },
        { key: 404, doc_count: 10 },
        { key: 500, doc_count: 2 },
      ],
    },
    latency_percentiles: {
      values: {
        '50.0': 45.2,
        '90.0': 120.8,
        '99.0': 350.5,
      },
    },
    by_route: {
      buckets: [
        {
          key: '/api/v1/users',
          doc_count: 80,
          status_codes: {
            buckets: [
              { key: 200, doc_count: 75 },
              { key: 500, doc_count: 5 },
            ],
          },
          latency: {
            values: { '50.0': 30.0, '90.0': 100.0, '99.0': 250.0 },
          },
        },
        {
          key: '/api/v1/orders',
          doc_count: 32,
          status_codes: {
            buckets: [{ key: 200, doc_count: 25 }, { key: 404, doc_count: 7 }],
          },
          latency: {
            values: { '50.0': 55.0, '90.0': 150.0, '99.0': 400.0 },
          },
        },
      ],
    },
  },
};

beforeEach(() => {
  _resetCacheForTesting();
  jest.clearAllMocks();

  moesif.getEventCount.mockResolvedValue({ count: 112 });
  moesif.getEventMetrics.mockResolvedValue(mockEventMetricsResponse);
  moesif.getActiveUsers.mockResolvedValue({
    aggregations: { unique_users: { value: 25 } },
  });
  moesif.getActiveCompanies.mockResolvedValue({
    aggregations: { unique_companies: { value: 8 } },
  });
});

afterEach(() => {
  register.resetMetrics();
});

describe('collectMetrics', () => {
  test('populates total API calls', async () => {
    await collectMetrics();

    const value = await getMetricValue('moesif_api_calls_total');
    expect(value).toBe(112);
  });

  test('populates status code breakdown', async () => {
    await collectMetrics();

    expect(await getMetricValue('moesif_api_calls_by_status', { status_code: '200' })).toBe(100);
    expect(await getMetricValue('moesif_api_calls_by_status', { status_code: '404' })).toBe(10);
    expect(await getMetricValue('moesif_api_calls_by_status', { status_code: '500' })).toBe(2);
  });

  test('populates latency percentiles', async () => {
    await collectMetrics();

    expect(await getMetricValue('moesif_api_latency_p50_ms')).toBe(45.2);
    expect(await getMetricValue('moesif_api_latency_p90_ms')).toBe(120.8);
    expect(await getMetricValue('moesif_api_latency_p99_ms')).toBe(350.5);
  });

  test('populates active users and companies', async () => {
    await collectMetrics();

    expect(await getMetricValue('moesif_active_users')).toBe(25);
    expect(await getMetricValue('moesif_active_companies')).toBe(8);
  });

  test('populates per-route metrics', async () => {
    await collectMetrics();

    expect(
      await getMetricValue('moesif_api_calls_by_route', { route: '/api/v1/users', status_code: '200' }),
    ).toBe(75);
    expect(
      await getMetricValue('moesif_api_calls_by_route', { route: '/api/v1/users', status_code: '500' }),
    ).toBe(5);
    expect(
      await getMetricValue('moesif_api_latency_by_route_ms', { route: '/api/v1/orders', percentile: 'p99' }),
    ).toBe(400.0);
  });

  test('handles numeric event count response', async () => {
    moesif.getEventCount.mockResolvedValue(99);
    await collectMetrics();

    expect(await getMetricValue('moesif_api_calls_total')).toBe(99);
  });

  test('handles event count from hits.total', async () => {
    moesif.getEventCount.mockResolvedValue({ hits: { total: 77 } });
    await collectMetrics();

    expect(await getMetricValue('moesif_api_calls_total')).toBe(77);
  });

  test('increments scrape error counter on failure', async () => {
    moesif.getEventCount.mockRejectedValue(new Error('API down'));
    await collectMetrics();

    expect(await getMetricValue('moesif_scrape_errors_total')).toBe(1);
  });

  test('records scrape duration', async () => {
    await collectMetrics();

    const duration = await getMetricValue('moesif_scrape_duration_ms');
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});

describe('caching', () => {
  test('does not call Moesif again within the cache window', async () => {
    await collectMetrics();
    expect(moesif.getEventCount).toHaveBeenCalledTimes(1);

    // Call again immediately — should be cached
    await collectMetrics();
    expect(moesif.getEventCount).toHaveBeenCalledTimes(1);
  });

  test('calls Moesif again after cache is reset', async () => {
    await collectMetrics();
    expect(moesif.getEventCount).toHaveBeenCalledTimes(1);

    // Reset cache and call again
    _resetCacheForTesting();
    await collectMetrics();
    expect(moesif.getEventCount).toHaveBeenCalledTimes(2);
  });
});

describe('metrics output format', () => {
  test('produces valid Prometheus exposition format', async () => {
    await collectMetrics();

    const output = await register.metrics();

    expect(output).toContain('# HELP moesif_api_calls_total');
    expect(output).toContain('# TYPE moesif_api_calls_total gauge');
    expect(output).toContain('moesif_api_calls_total{source="moesif"} 112');
    expect(output).toContain('# TYPE moesif_scrape_errors_total counter');
  });
});
