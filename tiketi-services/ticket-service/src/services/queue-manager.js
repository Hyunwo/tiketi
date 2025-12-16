const { client: redisClient } = require('../config/redis');

const { logger } = require('@tiketi/common');

const { queueWaitTime, queueUsers } = require('../metrics');
/**
 * 대기열 관리 시스템
 *
 * Redis Sorted Set을 사용하여 FIFO 대기열 구현
 * - Key: queue:{eventId}
 * - Score: 타임스탬프 (먼저 들어온 사람이 작은 score)
 * - Member: userId
 */
class QueueManager {
  /**
   * 이벤트별 동시 접속 임계값 가져오기
   * 대기열이 활성화되면 이 수치를 초과하는 사용자는 대기열로 이동
   */
  async getThreshold(eventId) {
    // TODO: 나중에 events 테이블에서 queue_threshold 값 가져오기
    // 현재는 기본값 1000명
    return 1000;
  }

  /**
   * 현재 이벤트에 접속 중인 사용자 수 확인
   */
  async getCurrentUsers(eventId) {
    const key = `active:${eventId}`;
    return await redisClient.sCard(key);
  }

  /**
   * 사용자를 활성 사용자로 등록
   */
  async addActiveUser(eventId, userId) {
    const key = `active:${eventId}`;
    await redisClient.sAdd(key, userId);
    // 5분 후 자동 삭제 (타임아웃)
    await redisClient.expire(key, 300);
  }

  /**
   * 사용자를 활성 사용자에서 제거
   */
  async removeActiveUser(eventId, userId) {
    const key = `active:${eventId}`;
    await redisClient.sRem(key, userId);
  }

  /**
   * 대기열 진입 확인 및 처리 (새로고침 대응)
   */
  async checkQueueEntry(eventId, userId) {
    // 1. 이미 대기열에 있는지 확인 (새로고침 시)
    const inQueue = await this.isInQueue(eventId, userId);

    if (inQueue) {
      // 이미 대기열에 있음 → 순번 유지
      const position = await this.getQueuePosition(eventId, userId);
      const estimatedWait = await this.getEstimatedWait(eventId, position);
      const currentUsers = await this.getCurrentUsers(eventId);
      const threshold = await this.getThreshold(eventId);


      logger.info(`🔄 User ${userId} already in queue (position: ${position}) - preserved on refresh`);
      return {
        queued: true,
        position,
        estimatedWait,
        threshold,
        currentUsers,
      };
    }

    // 2. 이미 입장한 사용자인지 확인 (새로고침 시)
    const isActive = await this.isActiveUser(eventId, userId);

    if (isActive) {
      // 이미 입장함 → 활성 상태 유지
      const currentUsers = await this.getCurrentUsers(eventId);
      const threshold = await this.getThreshold(eventId);


      logger.info(`✅ User ${userId} already active - preserved on refresh`);
      return {
        queued: false,
        currentUsers,
        threshold,
      };
    }

    // 3. 처음 접속하는 사용자 → 임계값 확인
    const currentUsers = await this.getCurrentUsers(eventId);
    const threshold = await this.getThreshold(eventId);

    if (currentUsers >= threshold) {
      // 대기열로 이동
      await this.addToQueue(eventId, userId);

      const position = await this.getQueuePosition(eventId, userId);
      const estimatedWait = await this.getEstimatedWait(eventId, position);


      logger.info(`⏳ User ${userId} added to queue (position: ${position})`);
      return {
        queued: true,
        position,
        estimatedWait,
        threshold,
        currentUsers,
      };
    }

    // 바로 입장 가능
    await this.addActiveUser(eventId, userId);


    logger.info(`✅ User ${userId} allowed entry immediately`);
    return {
      queued: false,
      currentUsers,
      threshold,
    };
  }

  /**
   * 대기열에 사용자 추가
   */
  async addToQueue(eventId, userId) {
    const queueKey = `queue:${eventId}`;
    const timestamp = Date.now();

    // Sorted Set에 추가 (score는 타임스탬프)
    await redisClient.zAdd(queueKey, {
      score: timestamp,
      value: userId,
    });

    logger.info(`⏳ User ${userId} added to queue:${eventId} at ${timestamp}`);
  }

  /**
   * 대기열에서 사용자 순번 확인
   */
  async getQueuePosition(eventId, userId) {
    const queueKey = `queue:${eventId}`;
    const rank = await redisClient.zRank(queueKey, userId);

    // rank는 0부터 시작하므로 +1
    return rank !== null ? rank + 1 : 0;
  }

  /**
   * 예상 대기 시간 계산 (초)
   */
  async getEstimatedWait(eventId, position) {
    // 초당 50명씩 입장 허용한다고 가정
    const processingRate = 50;
    return Math.ceil(position / processingRate);
  }

  /**
   * 대기열 크기 확인
   */
  async getQueueSize(eventId) {
    const queueKey = `queue:${eventId}`;
    return await redisClient.zCard(queueKey);
  }

  /**
   * 대기열에서 다음 배치의 사용자들 가져오기
   * (입장 가능한 공간만큼)
   */
  async processQueue(eventId) {
    const queueKey = `queue:${eventId}`;

    const currentUsers = await this.getCurrentUsers(eventId);
    const threshold = await this.getThreshold(eventId);
    const available = threshold - currentUsers;

    if (available <= 0) {
      return [];
    }

    // 입장 가능한 만큼 사용자 꺼내기 (FIFO)
    const users = await redisClient.zRange(queueKey, 0, available - 1);

    if (users.length > 0) {
      // 대기 시간 측정을 위해 score(타임스탬프) 조회
      for (const userId of users) {
        const score = await redisClient.zScore(queueKey, userId);
        if (score) {
          const waitSeconds = (Date.now() - score) / 1000;
          queueWaitTime.labels(eventId).observe(waitSeconds); // 메트릭 기록
        }
      }
      // 대기열에서 제거
      await redisClient.zRemRangeByRank(queueKey, 0, available - 1);

      // 활성 사용자로 추가
      for (const userId of users) {
        await this.addActiveUser(eventId, userId);
      }

      logger.info(`✅ ${users.length} users entered from queue:${eventId}`);

      // 대기열 크기 메트릭 업데이트
      const remainingQueueSize = await this.getQueueSize(eventId);
      queueUsers.labels(eventId).set(remainingQueueSize);
    }

    return users;
  }

  /**
   * 대기열 상태 정보
   */
  async getQueueStatus(eventId, userId) {
    const queueSize = await this.getQueueSize(eventId);
    const position = await this.getQueuePosition(eventId, userId);
    const estimatedWait = await this.getEstimatedWait(eventId, position);
    const currentUsers = await this.getCurrentUsers(eventId);
    const threshold = await this.getThreshold(eventId);

    return {
      queued: position > 0,
      position,
      queueSize,
      estimatedWait,
      currentUsers,
      threshold,
    };
  }

  /**
   * 사용자가 대기열에 있는지 확인
   */
  async isInQueue(eventId, userId) {
    const queueKey = `queue:${eventId}`;
    const score = await redisClient.zScore(queueKey, userId);
    return score !== null;
  }

  /**
   * 사용자가 활성 사용자인지 확인 (입장한 상태)
   */
  async isActiveUser(eventId, userId) {
    const key = `active:${eventId}`;
    const isMember = await redisClient.sIsMember(key, userId);
    return isMember;
  }

  /**
   * 대기열에서 사용자 제거 (수동)
   */
  async removeFromQueue(eventId, userId) {
    const queueKey = `queue:${eventId}`;
    await redisClient.zRem(queueKey, userId);
    logger.info(`❌ User ${userId} removed from queue:${eventId}`);
  }

  /**
   * 대기열 전체 초기화 (이벤트 종료 시)
   */
  async clearQueue(eventId) {
    const queueKey = `queue:${eventId}`;
    const activeKey = `active:${eventId}`;

    await redisClient.del(queueKey);
    await redisClient.del(activeKey);

    logger.info(`🧹 Queue cleared for event:${eventId}`);
  }

  /**
   * 주기적으로 대기열 처리 (백그라운드 작업)
   * 1초마다 실행하여 공간이 생기면 자동으로 입장 허용
   */
  startQueueProcessor(io, eventId) {
    const intervalId = setInterval(async () => {
      try {
        const users = await this.processQueue(eventId);

        if (users.length > 0) {
          // 입장 허용된 사용자들에게 알림
          for (const userId of users) {
            io.to(`queue:${eventId}`).emit('queue-entry-allowed', {
              userId,
              message: '입장이 허용되었습니다. 잠시 후 자동으로 이동합니다.',
            });
          }

          // 남은 대기열 사용자들에게 순번 업데이트 알림
          const queueSize = await this.getQueueSize(eventId);
          io.to(`queue:${eventId}`).emit('queue-updated', {
            queueSize,
            timestamp: new Date(),
          });
        }
      } catch (error) {
        logger.error(`Error processing queue for event:${eventId}`, error);
      }
    }, 1000); // 1초마다 실행

    // intervalId를 저장하여 나중에 중지할 수 있도록
    return intervalId;
  }

  /**
   * 대기열 프로세서 중지
   */
  stopQueueProcessor(intervalId) {
    if (intervalId) {
      clearInterval(intervalId);
      logger.info(`⏹️  Queue processor stopped`);
    }
  }
}

module.exports = new QueueManager();
