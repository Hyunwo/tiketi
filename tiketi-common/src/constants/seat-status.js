/**
 * 좌석 상태 상수
 * Backend + Frontend 공유
 */

const SEAT_STATUS = {
  AVAILABLE: 'available',    // 선택 가능
  RESERVED: 'reserved',      // 예약 완료
  LOCKED: 'locked',          // 다른 사용자가 선택 중
  SELECTED: 'selected',      // 현재 사용자가 선택 (Frontend only)
};

// Frontend용 디스플레이 텍스트
const SEAT_STATUS_DISPLAY = {
  [SEAT_STATUS.AVAILABLE]: '선택 가능',
  [SEAT_STATUS.RESERVED]: '예약 완료',
  [SEAT_STATUS.LOCKED]: '선택 중',
  [SEAT_STATUS.SELECTED]: '선택됨',
};

// Frontend용 좌석 색상
const SEAT_STATUS_COLORS = {
  [SEAT_STATUS.AVAILABLE]: '#4CAF50',  // Green
  [SEAT_STATUS.RESERVED]: '#9E9E9E',   // Gray
  [SEAT_STATUS.LOCKED]: '#FF9800',     // Orange
  [SEAT_STATUS.SELECTED]: '#2196F3',   // Blue
};

module.exports = {
  SEAT_STATUS,
  SEAT_STATUS_DISPLAY,
  SEAT_STATUS_COLORS,
};
