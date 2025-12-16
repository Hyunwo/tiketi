const db = require('../config/database');
const { logger } = require('@tiketi/common');
const { acquireLock, releaseLock } = require('../config/redis');

/**
 * 트랜잭션 래퍼 - 자동으로 BEGIN/COMMIT/ROLLBACK 처리
 * @param {Function} callback - 트랜잭션 내에서 실행할 함수 (client를 인자로 받음)
 * @returns {Promise<any>} - callback의 반환값
 *
 * @example
 * const result = await withTransaction(async (client) => {
 *   const user = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
 *   await client.query('UPDATE users SET name = $1 WHERE id = $2', [newName, userId]);
 *   return user.rows[0];
 * });
 */
async function withTransaction(callback) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 분산 락 래퍼 - 자동으로 락 획득/해제 처리
 * @param {string|string[]} lockKeys - 락 키 또는 락 키 배열
 * @param {number} ttl - 락 TTL (초)
 * @param {Function} callback - 락 획득 후 실행할 함수
 * @returns {Promise<any>} - callback의 반환값
 *
 * @example
 * // 단일 락
 * await withLock('seat:123', 30, async () => {
 *   // 비즈니스 로직
 * });
 *
 * // 다중 락
 * await withLock(['seat:123', 'seat:456'], 30, async () => {
 *   // 비즈니스 로직
 * });
 */
async function withLock(lockKeys, ttl, callback) {
  const keys = Array.isArray(lockKeys) ? lockKeys : [lockKeys];
  const acquiredLocks = [];

  try {
    // 모든 락 획득 시도
    for (const lockKey of keys) {
      const locked = await acquireLock(lockKey, ttl);

      if (!locked) {
        throw new Error(`Failed to acquire lock: ${lockKey}`);
      }

      acquiredLocks.push(lockKey);
    }

    // 락 획득 성공 후 콜백 실행
    return await callback();

  } finally {
    // 획득한 모든 락 해제 (역순으로)
    for (const lockKey of acquiredLocks.reverse()) {
      try {
        await releaseLock(lockKey);
      } catch (releaseError) {
        logger.error(`Failed to release lock ${lockKey}: ${releaseError.message}`);
      }
    }
  }
}

/**
 * 트랜잭션 + 분산 락 결합 래퍼
 * @param {string|string[]} lockKeys - 락 키 또는 락 키 배열
 * @param {number} ttl - 락 TTL (초)
 * @param {Function} callback - 실행할 함수 (client를 인자로 받음)
 * @returns {Promise<any>} - callback의 반환값
 *
 * @example
 * const result = await withTransactionAndLock('seat:123', 30, async (client) => {
 *   await client.query('UPDATE seats SET status = $1 WHERE id = $2', ['locked', 123]);
 *   return { success: true };
 * });
 */
async function withTransactionAndLock(lockKeys, ttl, callback) {
  return withLock(lockKeys, ttl, async () => {
    return withTransaction(callback);
  });
}

/**
 * 캐시 무효화 헬퍼 - 에러를 무시하고 로그만 남김
 * @param {Object} redisClient - Redis 클라이언트
 * @param {string|string[]} cacheKeys - 삭제할 캐시 키 또는 패턴
 *
 * @example
 * await invalidateCache(redisClient, 'event:123');
 * await invalidateCache(redisClient, ['event:123', 'events:*']);
 */
async function invalidateCache(redisClient, cacheKeys) {
  try {
    const keys = Array.isArray(cacheKeys) ? cacheKeys : [cacheKeys];

    for (const key of keys) {
      // 패턴인 경우 (와일드카드 포함)
      if (key.includes('*')) {
        const matchedKeys = await redisClient.keys(key);
        if (matchedKeys && matchedKeys.length > 0) {
          await redisClient.del(matchedKeys);
          logger.info(`🗑️  캐시 삭제: ${matchedKeys.length}개 (패턴: ${key})`);
        }
      } else {
        // 단일 키
        await redisClient.del(key);
        logger.info(`🗑️  캐시 삭제: ${key}`);
      }
    }
  } catch (cacheError) {
    // 캐시 무효화 실패는 치명적이지 않으므로 로그만 남김
    logger.error(`⚠️  캐시 무효화 중 에러 (계속 진행): ${cacheError.message}`);
  }
}

/**
 * 여러 캐시 패턴을 한 번에 무효화
 * @param {Object} redisClient - Redis 클라이언트
 * @param {string[]} patterns - 삭제할 캐시 패턴 배열
 *
 * @example
 * await invalidateCachePatterns(redisClient, [
 *   'event:123',
 *   'events:*',
 *   'seats:event:123:*'
 * ]);
 */
async function invalidateCachePatterns(redisClient, patterns) {
  for (const pattern of patterns) {
    await invalidateCache(redisClient, pattern);
  }
}

module.exports = {
  withTransaction,
  withLock,
  withTransactionAndLock,
  invalidateCache,
  invalidateCachePatterns,
};
