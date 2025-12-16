/**
 * 이벤트 상태 상수
 * Backend + Frontend 공유
 */

const EVENT_STATUS = {
  UPCOMING: 'upcoming',      // 오픈 예정
  ON_SALE: 'on_sale',        // 예매 중
  ENDED: 'ended',            // 예매 종료
  CANCELLED: 'cancelled',    // 취소됨
  SOLD_OUT: 'sold_out',      // 매진
};

// Frontend용 디스플레이 텍스트
const EVENT_STATUS_DISPLAY = {
  [EVENT_STATUS.UPCOMING]: '오픈 예정',
  [EVENT_STATUS.ON_SALE]: '예매 중',
  [EVENT_STATUS.ENDED]: '예매 종료',
  [EVENT_STATUS.CANCELLED]: '취소됨',
  [EVENT_STATUS.SOLD_OUT]: '매진',
};

// Frontend용 상태 메시지
const EVENT_STATUS_MESSAGES = {
  [EVENT_STATUS.UPCOMING]: '⏰ 판매 시작 전입니다',
  [EVENT_STATUS.ON_SALE]: '🎫 판매 중입니다',
  [EVENT_STATUS.ENDED]: '⏰ 판매가 종료되었습니다',
  [EVENT_STATUS.CANCELLED]: '❌ 취소된 이벤트입니다',
  [EVENT_STATUS.SOLD_OUT]: '🚫 매진되었습니다',
};

module.exports = {
  EVENT_STATUS,
  EVENT_STATUS_DISPLAY,
  EVENT_STATUS_MESSAGES,
};
