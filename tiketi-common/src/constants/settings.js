/**
 * 시스템 설정 상수
 * Backend 전용 (일부 Frontend에서도 사용 가능)
 */

// 락 설정 (분산 락)
const LOCK_SETTINGS = {
  SEAT_LOCK_TTL: 10000,    // 좌석 락 TTL (10초)
  TICKET_LOCK_TTL: 10000,  // 티켓 락 TTL (10초)
};

// 캐시 설정
const CACHE_SETTINGS = {
  EVENTS_LIST_TTL: 30,     // 이벤트 목록 캐시 (30초)
  EVENT_DETAIL_TTL: 10,    // 이벤트 상세 캐시 (10초)
  SEATS_TTL: 5,            // 좌석 정보 캐시 (5초)
};

// 페이지네이션 기본값
const PAGINATION_DEFAULTS = {
  PAGE: 1,
  EVENTS_LIMIT: 10,
  RESERVATIONS_LIMIT: 20,
};

// 대기열 설정
const QUEUE_SETTINGS = {
  DEFAULT_THRESHOLD: 1000,     // 기본 대기열 임계값
  POLLING_INTERVAL_MS: 5000,   // 폴링 간격 (5초)
  POSITION_UPDATE_INTERVAL: 3000,  // 순번 업데이트 간격 (3초)
};

// 캐시 키 패턴 (Backend용)
const CACHE_KEYS = {
  EVENT: (eventId) => `event:${eventId}`,
  EVENTS_LIST: (status, page, limit, query) => 
    `events:${status || 'all'}:${page}:${limit}:${query || 'none'}`,
  EVENTS_PATTERN: 'events:*',
  SEATS: (eventId) => `seats:${eventId}`,
  QUEUE: (eventId) => `queue:event:${eventId}`,
  USER_SESSION: (userId) => `session:${userId}`,
};

// 락 키 패턴 (Backend용)
const LOCK_KEYS = {
  SEAT: (eventId, seatId) => `lock:seat:${eventId}:${seatId}`,
  TICKET: (ticketTypeId) => `lock:ticket:${ticketTypeId}`,
  RESERVATION: (reservationId) => `lock:reservation:${reservationId}`,
};

module.exports = {
  LOCK_SETTINGS,
  CACHE_SETTINGS,
  PAGINATION_DEFAULTS,
  QUEUE_SETTINGS,
  CACHE_KEYS,
  LOCK_KEYS,
};
