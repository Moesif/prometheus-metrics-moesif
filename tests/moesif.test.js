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

describe('moesif.getEventCount', () => {
  test('calls the correct endpoint with from/to params', async () => {
    mockFetchResponse({ count: 42 });

    const result = await moesif.getEventCount();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/search\/~\/count\/events\?from=.*&to=.*/);
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');
    expect(result).toEqual({ count: 42 });
  });

  test('throws on non-ok response', async () => {
    mockFetchResponse({ error: 'unauthorized' }, 401);

    await expect(moesif.getEventCount()).rejects.toThrow('Moesif API error 401');
  });
});

describe('moesif.getEventMetrics', () => {
  test('sends aggregation query for status codes, latency, and routes', async () => {
    mockFetchResponse({ aggregations: {} });

    await moesif.getEventMetrics();

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.size).toBe(0);
    expect(body.aggs.status_class).toBeDefined();
    expect(body.aggs.latency_percentiles.percentiles.percents).toEqual([50, 90, 99]);
    expect(body.aggs.by_route).toBeDefined();
    expect(body.aggs.by_route.aggs.status_codes).toBeDefined();
    expect(body.aggs.by_route.aggs.latency).toBeDefined();
  });
});

describe('moesif.getActiveUsers', () => {
  test('sends cardinality aggregation on user_id.raw', async () => {
    mockFetchResponse({ aggregations: { unique_users: { value: 15 } } });

    const result = await moesif.getActiveUsers();

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.aggs.unique_users.cardinality.field).toBe('user_id.raw');
    expect(result.aggregations.unique_users.value).toBe(15);
  });
});

describe('moesif.getActiveCompanies', () => {
  test('sends cardinality aggregation on company_id.raw', async () => {
    mockFetchResponse({ aggregations: { unique_companies: { value: 5 } } });

    const result = await moesif.getActiveCompanies();

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.aggs.unique_companies.cardinality.field).toBe('company_id.raw');
    expect(result.aggregations.unique_companies.value).toBe(5);
  });
});

describe('date range', () => {
  test('from is before to and both are valid ISO dates', async () => {
    mockFetchResponse({});

    await moesif.getEventCount();

    const [url] = global.fetch.mock.calls[0];
    const urlObj = new URL(url);
    const from = new Date(urlObj.searchParams.get('from'));
    const to = new Date(urlObj.searchParams.get('to'));

    expect(from.getTime()).toBeLessThan(to.getTime());
    expect(to.getTime() - from.getTime()).toBeCloseTo(60 * 1000, -3); // ~60s window
  });
});
