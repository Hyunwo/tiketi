const { Pool } = require('pg');
const { CONFIG } = require('@tiketi/common');
const { logger } = require('@tiketi/common');
const { wrapPoolWithMetrics } = require('../metrics/db');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres-service',  // K8s service name
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || process.env.POSTGRES_DB || 'tiketi',
  user: process.env.DB_USER || process.env.POSTGRES_USER || 'tiketi_user',
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'tiketi_pass',
  max: CONFIG.DB_POOL_MAX,
  idleTimeoutMillis: CONFIG.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: CONFIG.DB_CONNECTION_TIMEOUT_MS,
});

pool.on('connect', () => {
  logger.info('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('❌ Unexpected error on idle client', err.message);
  // Don't exit process, just log the error
});

// 메트릭 수집 기능 추가
wrapPoolWithMetrics(pool);

logger.info('📊 Database query metrics enabled');

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};

