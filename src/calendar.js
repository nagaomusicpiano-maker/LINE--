/**
 * Google Calendar 連携モジュール
 * - 空き枠取得
 * - 予約登録（ブロック）
 * - 二重予約防止
 */

const { google } = require('googleapis');
const path = require('path');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

const SLOT_TITLE_PREFIX = '[空き枠]';
const BOOKED_TITLE_PREFIX = '[予約済]';

/**
 * 認証済み Google Calendar クライアントを返す
 * 環境変数 GOOGLE_SERVICE_ACCOUNT_KEY_JSON（JSON文字列）を優先して使用し、
 * なければファイルパスにフォールバックする
 */
async function getCalendarClient() {
  let authConfig;

  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    // 個別環境変数から認証（Railway推奨）
    authConfig = {
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    };
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON);
    authConfig = {
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    };
  } else {
    const keyFile = path.resolve(
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './google-service-account-key.json'
    );
    authConfig = {
      keyFile,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    };
  }

  const auth = new google.auth.GoogleAuth(authConfig);
  const authClient = await auth.getClient();
  return google.calendar({ version: 'v3', auth: authClient });
}

/**
 * 今日から指定日数分の空き日程一覧を取得する
 * @param {number} daysAhead - 何日先まで取得するか（デフォルト: 60日）
 * @returns {Array<{date: string, slots: Array<{id: string, start: string, end: string, label: string}>}>}
 */
async function getAvailableDates(daysAhead = 60) {
  const calendar = await getCalendarClient();

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    q: SLOT_TITLE_PREFIX,
  });

  const events = res.data.items || [];

  // 日付ごとにグループ化
  const dateMap = {};
  for (const event of events) {
    const start = new Date(event.start.dateTime || event.start.date);
    const end = new Date(event.end.dateTime || event.end.date);
    const dateKey = toJST(start).split('T')[0]; // YYYY-MM-DD（JST）

    if (!dateMap[dateKey]) {
      dateMap[dateKey] = [];
    }
    dateMap[dateKey].push({
      id: event.id,
      start: event.start.dateTime,
      end: event.end.dateTime,
      label: formatTimeLabel(start, end),
    });
  }

  // 日付昇順で配列に変換
  return Object.keys(dateMap)
    .sort()
    .map((date) => ({
      date,
      displayDate: formatDisplayDate(date),
      slots: dateMap[date],
    }));
}

/**
 * 特定日の空き時間スロット一覧を取得する
 * @param {string} dateStr - 'YYYY-MM-DD' 形式
 * @returns {Array<{id: string, start: string, end: string, label: string}>}
 */
async function getSlotsForDate(dateStr) {
  const calendar = await getCalendarClient();

  // JSTの日付をUTCに変換
  const jstDate = new Date(`${dateStr}T00:00:00+09:00`);
  const jstEnd = new Date(`${dateStr}T23:59:59+09:00`);

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: jstDate.toISOString(),
    timeMax: jstEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    q: SLOT_TITLE_PREFIX,
  });

  const events = res.data.items || [];
  return events.map((event) => {
    const start = new Date(event.start.dateTime);
    const end = new Date(event.end.dateTime);
    return {
      id: event.id,
      start: event.start.dateTime,
      end: event.end.dateTime,
      label: formatTimeLabel(start, end),
    };
  });
}

/**
 * 予約を確定する（空き枠イベントを「予約済」に更新 + 予約情報を記載）
 * 二重予約防止のため、更新前に空き枠の状態を再確認する
 *
 * @param {string} eventId - GoogleカレンダーイベントID
 * @param {Object} bookingInfo - 予約者情報
 * @param {string} bookingInfo.name - 氏名
 * @param {string} bookingInfo.email - メールアドレス
 * @param {string} bookingInfo.lineUserId - LINE ユーザーID
 * @param {string} bookingInfo.concern - お悩み
 * @param {string} bookingInfo.focus - 特に見てほしいこと
 * @param {string} bookingInfo.note - その他（任意）
 * @param {string} bookingInfo.region - 地域タグ
 * @param {string} bookingInfo.planName - プラン名
 * @param {string} bookingInfo.price - 料金（表示用）
 * @returns {{ success: boolean, event?: object, error?: string }}
 */
async function confirmBooking(eventId, bookingInfo) {
  const calendar = await getCalendarClient();

  // 二重予約チェック：現在のイベントタイトルを確認
  let currentEvent;
  try {
    const res = await calendar.events.get({ calendarId: CALENDAR_ID, eventId });
    currentEvent = res.data;
  } catch {
    return { success: false, error: 'イベントが見つかりません。日程を選び直してください。' };
  }

  if (!currentEvent.summary.startsWith(SLOT_TITLE_PREFIX)) {
    return { success: false, error: 'この時間枠はすでに予約済みです。別の日程を選択してください。' };
  }

  // イベントを予約済みに更新
  const description = buildEventDescription(bookingInfo);
  const updatedEvent = {
    summary: `${BOOKED_TITLE_PREFIX} ${bookingInfo.name}（${bookingInfo.region}/${bookingInfo.planName}）`,
    description,
    colorId: '11', // 赤：予約済みを視覚的に区別
  };

  try {
    const res = await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId,
      requestBody: updatedEvent,
    });
    return { success: true, event: res.data };
  } catch (err) {
    console.error('カレンダー更新エラー:', err.message);
    return { success: false, error: 'カレンダーへの予約登録に失敗しました。' };
  }
}

/**
 * 予約をキャンセルして空き枠に戻す
 * @param {string} eventId
 */
async function cancelBooking(eventId) {
  const calendar = await getCalendarClient();
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: {
      summary: `${SLOT_TITLE_PREFIX} 空き`,
      description: '',
      colorId: '2', // 緑：空き枠
    },
  });
}

// ────────────────────────────────────────────────────
// ユーティリティ
// ────────────────────────────────────────────────────

/**
 * ISO日時文字列 → JST の 'YYYY-MM-DDTHH:mm' 文字列
 */
function toJST(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace('Z', '+09:00');
}

/**
 * 開始・終了Dateから「10:00〜11:00」形式のラベルを生成
 */
function formatTimeLabel(start, end) {
  const fmt = (d) =>
    `${String(d.getUTCHours() + 9).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  // UTCに9h加算でJST
  const startJST = new Date(start.getTime() + 9 * 60 * 60 * 1000);
  const endJST = new Date(end.getTime() + 9 * 60 * 60 * 1000);
  return `${fmt(startJST)}〜${fmt(endJST)}`;
}

/**
 * 'YYYY-MM-DD' → '4月5日（土）' 形式
 */
function formatDisplayDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}

/**
 * カレンダーイベントの説明文を生成
 */
function buildEventDescription(info) {
  return [
    `【予約者】${info.name}`,
    `【メール】${info.email}`,
    `【LINE ID】${info.lineUserId}`,
    `【地域】${info.region}`,
    `【プラン】${info.planName}`,
    `【料金】${info.price}`,
    `【お悩み】${info.concern}`,
    `【見てほしいこと】${info.focus}`,
    info.note ? `【その他】${info.note}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  getAvailableDates,
  getSlotsForDate,
  confirmBooking,
  cancelBooking,
};
