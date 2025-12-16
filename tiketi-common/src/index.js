/**
 * @tiketi/common
 * 티케티(Tiketi) MSA 공통 라이브러리
 * 
 * @description
 * 모든 MSA 서비스에서 공유하는 상수와 유틸리티를 제공합니다.
 * 
 * @example
 * // 전체 import
 * const tiketi = require('@tiketi/common');
 * 
 * // 개별 import
 * const { EVENT_STATUS, CustomError, logger } = require('@tiketi/common');
 * 
 * // 카테고리별 import
 * const { constants, utils } = require('@tiketi/common');
 */

const constants = require('./constants');
const utils = require('./utils');

module.exports = {
  // 전체 카테고리
  constants,
  utils,
  
  // 개별 상수 (자주 사용되는 것들 직접 export)
  ...constants,
  
  // 개별 유틸리티
  ...utils,
};
