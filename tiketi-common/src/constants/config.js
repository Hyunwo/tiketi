/**
 * 시스템 설정 (CONFIG)
 * JWT, DB Pool, Admin 기본값 등
 */

const CONFIG = {
  // JWT 설정
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  JWT_EXPIRES_IN: '7d',
  BCRYPT_SALT_ROUNDS: 10,
  
  // Database Pool 설정
  DB_POOL_MAX: 20,
  DB_IDLE_TIMEOUT_MS: 30000,
  DB_CONNECTION_TIMEOUT_MS: 5000,
  
  // Admin Defaults (for development/demo only)
  DEFAULT_ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@tiketi.gg',
  DEFAULT_ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  DEFAULT_ADMIN_NAME: '관리자',
  DEFAULT_ADMIN_PHONE: '010-1234-5678',
};

module.exports = { CONFIG };