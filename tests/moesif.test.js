// Set env before requiring modules
process.env.MOESIF_MANAGEMENT_API_KEY = 'test-api-key';
process.env.MOESIF_API_BASE_URL = 'https://api.moesif.com';
process.env.MOESIF_QUERY_WINDOW_SECONDS = '60';

const moesif = require('../src/moesif');

// Mock global fetch
beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function mockFetchResponse(data, status = 200) {
  global.fetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

describe('moesif.getAllMetrics', () => {
  test('calls the correct endpoint with from/to params', async () => {
    mockFetchResponse({ hits: { total: 42 }, aggregations: {} });

    const result = await moesif.getAllMetrics();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/search\/~\/search\/events\?from=.*&to=.*/);
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');
    expect(result.hits.total).toBe(42);
  });

  test('sends all aggregations in a single query', async () => {
    mockFetchResponse({ hits: { total: 0 }, aggregations: {} });

    await moesif.getAllMetrics();

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.size).toBe(0);
    expect(body.aggs.status_class).toBeDefined();
    expect(body.aggs.latency_percentiles.percentiles.percents).toEqual([50, 90, 99]);
    expect(body.aggs.by_route).toBeDefined();
    expect(body.aggs.by_route.aggs.status_codes).toBeDefined();
    expect(body.aggs.by_route.aggs.latency).toBeDefined();
    expect(body.aggs.unique_users.cardinality.field).toBe('user_id.raw');
    expect(body.aggs.unique_companies.cardinality.field).toBe('company_id.raw');
  });

  test('throws on non-ok response', async () => {
    mockFetchResponse({ error: 'unauthorized' }, 401);

    await expect(moesif.getAllMetrics()).rejects.toThrow('Moesif API error 401');
  });

  test('only makes one API call', async () => {
    mockFetchResponse({ hits: { total: 0 }, aggregations: {} });

    await moesif.getAllMetrics();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('date range', () => {
  test('from is before to and both are valid ISO dates', async () => {
    mockFetchResponse({ hits: { total: 0 }, aggregations: {} });

    await moesif.getAllMetrics();

    const [url] = global.fetch.mock.calls[0];
    const urlObj = new URL(url);
    const from = new Date(urlObj.searchParams.get('from'));
    const to = new Date(urlObj.searchParams.get('to'));

    expect(from.getTime()).toBeLessThan(to.getTime());
    expect(to.getTime() - from.getTime()).toBeCloseTo(60 * 1000, -3); // ~60s window
  });
});
