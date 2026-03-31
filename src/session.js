/**
 * 予約フロー セッション管理
 *
 * LINE ユーザーIDをキーとして、予約フローの進行状態をメモリキャッシュで管理する。
 * 本番運用ではRedisへの移行を推奨。
 */

const NodeCache = require('node-cache');

const TTL_SECONDS = (parseInt(process.env.SESSION_TTL_MINUTES) || 60) * 60;
const cache = new NodeCache({ stdTTL: TTL_SECONDS, checkperiod: 120 });

/**
 * 予約フローのステップ定義
 */
const STEPS = {
  IDLE: 'idle',
  SELECT_DATE: 'select_date',
  SELECT_TIME: 'select_time',
  INPUT_INFO: 'input_info',        // LIFFフォームへ誘導
  AWAITING_FORM: 'awaiting_form',  // LIFF送信待ち
  CONFIRM_TERMS: 'confirm_terms',
  CONFIRM_PLAN: 'confirm_plan',
  AWAITING_PAYMENT: 'awaiting_payment',
  COMPLETED: 'completed',
};

/**
 * セッションを取得（なければ null）
 * @param {string} userId
 */
function getSession(userId) {
  return cache.get(userId) || null;
}

/**
 * セッションを作成・更新
 * @param {string} userId
 * @param {object} data
 */
function setSession(userId, data) {
  cache.set(userId, { ...getSession(userId), ...data, userId });
}

/**
 * セッションを削除（フロー完了・キャンセル時）
 * @param {string} userId
 */
function deleteSession(userId) {
  cache.del(userId);
}

/**
 * 予約フローを開始する（新規セッション作成）
 * @param {string} userId
 * @param {string[]} tags - エルメから取得したユーザーのタグ配列
 */
function startBookingFlow(userId, tags) {
  cache.set(userId, {
    userId,
    step: STEPS.SELECT_DATE,
    tags,
    selectedDate: null,
    selectedSlot: null,
    userInfo: null,
    termsAgreed: false,
    plan: null,
    startedAt: new Date().toISOString(),
  });
}

module.exports = { getSession, setSession, deleteSession, startBookingFlow, STEPS };
