require('dotenv').config();

const config = {
  moesifApiKey: process.env.MOESIF_MANAGEMENT_API_KEY,
  moesifBaseUrl: process.env.MOESIF_API_BASE_URL || 'https://api.moesif.com',
  port: parseInt(process.env.PORT, 10) || 9277,
  queryWindowSeconds: parseInt(process.env.MOESIF_QUERY_WINDOW_SECONDS, 10) || 60,
};

if (!config.moesifApiKey) {
  console.error('MOESIF_MANAGEMENT_API_KEY environment variable is required');
  process.exit(1);
}

module.exports = config;
