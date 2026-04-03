/**
 * LINE Webhook イベントハンドラ
 *
 * 予約フローのステップ管理とメッセージ送信を担う。
 * 各ステップ:
 *   IDLE → SELECT_DATE → SELECT_TIME → INPUT_INFO(LIFF) → AWAITING_FORM
 *        → CONFIRM_TERMS → CONFIRM_PLAN → AWAITING_PAYMENT → COMPLETED
 */

const line = require('@line/bot-sdk');
const { getSession, setSession, deleteSession, startBookingFlow, STEPS } = require('./session');
const { getAvailableDates, getSlotsForDate, confirmBooking } = require('./calendar');
const { getPlanForTags } = require('./pricing');
const { getUserTags, addTag } = require('./erume');
const {
  buildDateSelectionMessage,
  buildTimeSelectionMessage,
  buildFormInviteMessage,
  buildTermsMessage,
  buildPlanConfirmMessage,
  buildCompletionMessage,
  buildCancelMessage,
} = require('./messages');

const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

/**
 * LINEイベントのメインハンドラ
 * @param {object} event - LINE Webhookイベント
 */
async function handleEvent(event) {
  const { type, source } = event;
  const userId = source.userId;

  if (!userId) return;

  if (type === 'postback') {
    await handlePostback(event, userId);
  } else if (type === 'message' && event.message.type === 'text') {
    await handleTextMessage(event, userId);
  }
}

/**
 * Postback ハンドラ（ボタン操作）
 */
async function handlePostback(event, userId) {
  const params = new URLSearchParams(event.postback.data);
  const action = params.get('action');
  const session = getSession(userId);

  switch (action) {
    case 'start_booking':
      await handleStartBooking(userId);
      break;

    case 'select_date': {
      if (!session || session.step !== STEPS.SELECT_DATE) return;
      const date = params.get('date');
      await handleDateSelected(userId, date);
      break;
    }

    case 'select_time': {
      if (!session || session.step !== STEPS.SELECT_TIME) return;
      const slotId = params.get('slotId');
      const start = params.get('start');
      const end = params.get('end');
      const label = decodeURIComponent(params.get('label') || '');
      await handleTimeSelected(userId, { id: slotId, start, end, label });
      break;
    }

    case 'terms_agree': {
      if (!session || session.step !== STEPS.CONFIRM_TERMS) return;
      await handleTermsAgreed(userId);
      break;
    }

    case 'terms_decline': {
      deleteSession(userId);
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [buildCancelMessage('利用規約に同意されなかったため予約を終了しました。')],
      });
      break;
    }

    case 'select_region': {
      const region = params.get('region');
      const fallbackTags = [region, '受講未'];
      startBookingFlow(userId, fallbackTags);
      try {
        const availableDates = await getAvailableDates(60);
        await lineClient.pushMessage({
          to: userId,
          messages: [
            { type: 'text', text: `📅 ${region}のレッスン日程を選択してください。` },
            buildDateSelectionMessage(availableDates),
          ],
        });
      } catch (err) {
        console.error('select_region エラー:', err);
        await lineClient.pushMessage({
          to: userId,
          messages: [{ type: 'text', text: `エラーが発生しました。\n${err.message}\n\nお問い合わせください。` }],
        });
      }
      break;
    }

    case 'cancel': {
      deleteSession(userId);
      await lineClient.replyMessage({
        replyToken: event.replyToken,
        messages: [buildCancelMessage()],
      });
      break;
    }

    default:
      break;
  }
}

/**
 * テキストメッセージ ハンドラ
 * 「予約」キーワードでフロー開始
 */
async function handleTextMessage(event, userId) {
  const text = event.message.text.trim();

  if (text === '予約' || text === '予約する') {
    await handleStartBooking(userId, event.replyToken);
    return;
  }

  // フロー中のユーザーへのヘルプ
  const session = getSession(userId);
  if (session && session.step !== STEPS.IDLE) {
    await lineClient.replyMessage({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: '予約フロー進行中です。\nボタンを使って操作してください。\n\n予約をキャンセルする場合は「キャンセル」と送信してください。',
        },
      ],
    });
  }
}

// ────────────────────────────────────────────────────────────
// フロー各ステップの処理
// ────────────────────────────────────────────────────────────

/**
 * ① 予約フロー開始
 * タグ取得できた場合はそのまま日程選択へ。
 * 取得できなかった場合はLINE上で地域を選択させる。
 */
async function handleStartBooking(userId, replyToken) {
  const tags = await getUserTags(userId);
  const plan = getPlanForTags(tags);

  // タグ取得失敗 or 地域タグ未設定 → 地域を選択させる
  if (!plan) {
    const REGION_TAGS = ['東京', '大阪', '北海道', '宇都宮', 'その他'];
    const hasRegionTag = tags.some((t) => REGION_TAGS.includes(t));

    // 明示的に北海道・その他タグが付いている場合のみ予約不可
    if (hasRegionTag && (tags.includes('北海道') || tags.includes('その他'))) {
      await lineClient.pushMessage({
        to: userId,
        messages: [{ type: 'text', text: '現在、お住まいの地域ではオンライン予約を受け付けておりません。\nレッスン開催時にご案内しますので、お問い合わせください。' }],
      });
      return;
    }

    // 地域タグ未設定 or タグ取得失敗 → 地域選択を促す
    await lineClient.pushMessage({
      to: userId,
      messages: [
        {
          type: 'text',
          text: 'レッスンの地域を選択してください。',
          quickReply: {
            items: ['東京', '大阪', '宇都宮'].map((r) => ({
              type: 'action',
              action: { type: 'postback', label: r, data: `action=select_region&region=${r}`, displayText: r },
            })),
          },
        },
      ],
    });
    return;
  }

  startBookingFlow(userId, tags);

  const availableDates = await getAvailableDates(60);
  const msg = buildDateSelectionMessage(availableDates);

  await lineClient.pushMessage({
    to: userId,
    messages: [
      { type: 'text', text: '📅 ご希望のレッスン日を選択してください。' },
      msg,
    ],
  });
}

/**
 * ② 日程選択 → 時間帯一覧を表示
 */
async function handleDateSelected(userId, date) {
  const slots = await getSlotsForDate(date);

  if (slots.length === 0) {
    await lineClient.pushMessage({
      to: userId,
      messages: [
        {
          type: 'text',
          text: 'この日の空き枠がなくなりました。\n別の日程を選択してください。',
        },
      ],
    });
    // 日程選択に戻す
    const session = getSession(userId);
    const availableDates = await getAvailableDates(60);
    await lineClient.pushMessage({
      to: userId,
      messages: [buildDateSelectionMessage(availableDates)],
    });
    return;
  }

  const displayDate = formatDisplayDate(date);
  setSession(userId, { step: STEPS.SELECT_TIME, selectedDate: date, selectedDateDisplay: displayDate });

  await lineClient.pushMessage({
    to: userId,
    messages: [buildTimeSelectionMessage(displayDate, slots)],
  });
}

/**
 * ③ 時間帯選択 → LIFFフォーム誘導
 */
async function handleTimeSelected(userId, slot) {
  const dateLabel = `${getSession(userId)?.selectedDateDisplay || ''} ${slot.label}`;
  setSession(userId, {
    step: STEPS.INPUT_INFO,
    selectedSlot: slot,
    selectedDateLabel: dateLabel,
  });

  await lineClient.pushMessage({
    to: userId,
    messages: [buildFormInviteMessage(dateLabel)],
  });

  setSession(userId, { step: STEPS.AWAITING_FORM });
}

/**
 * ④ LIFFフォーム送信後に呼ばれる（POST /liff-submit から）
 * @param {string} userId
 * @param {object} formData - { name, email, concern, focus, note }
 */
async function handleFormSubmitted(userId, formData) {
  const session = getSession(userId);
  if (!session || session.step !== STEPS.AWAITING_FORM) return;

  setSession(userId, {
    step: STEPS.CONFIRM_TERMS,
    userInfo: formData,
  });

  await lineClient.pushMessage({
    to: userId,
    messages: [buildTermsMessage()],
  });
}

/**
 * ⑤ 利用規約同意 → プラン・料金確認メッセージ送信
 */
async function handleTermsAgreed(userId) {
  const session = getSession(userId);
  const plan = getPlanForTags(session.tags);

  if (!plan || !plan.squareUrl) {
    await lineClient.pushMessage({
      to: userId,
      messages: [{ type: 'text', text: '決済リンクの取得に失敗しました。お問い合わせください。' }],
    });
    deleteSession(userId);
    return;
  }

  setSession(userId, {
    step: STEPS.CONFIRM_PLAN,
    termsAgreed: true,
    plan,
  });

  await lineClient.pushMessage({
    to: userId,
    messages: [
      buildPlanConfirmMessage(plan, {
        name: session.userInfo.name,
        selectedDateLabel: session.selectedDateLabel,
      }),
    ],
  });

  setSession(userId, { step: STEPS.AWAITING_PAYMENT });
}

/**
 * ⑥ 決済完了 Webhook（Square から POST /payment-complete）で呼ばれる
 * @param {string} userId
 */
async function handlePaymentCompleted(userId) {
  const session = getSession(userId);
  if (!session) return;

  // Googleカレンダーに予約登録
  const result = await confirmBooking(session.selectedSlot.id, {
    ...session.userInfo,
    lineUserId: userId,
    region: session.plan.region,
    planName: session.plan.planName,
    price: session.plan.price,
  });

  if (!result.success) {
    await lineClient.pushMessage({
      to: userId,
      messages: [
        {
          type: 'text',
          text: `⚠️ 決済は完了しましたが、カレンダー登録でエラーが発生しました。\n${result.error}\n\nご不便をおかけして申し訳ありません。担当者より連絡いたします。`,
        },
      ],
    });
    return;
  }

  // 受講済タグを付与
  await addTag(userId, '受講済');

  // 完了メッセージ送信
  await lineClient.pushMessage({
    to: userId,
    messages: [
      buildCompletionMessage({
        name: session.userInfo.name,
        selectedDateLabel: session.selectedDateLabel,
        planName: session.plan.planName,
      }),
    ],
  });

  deleteSession(userId);
}

// ─── ユーティリティ ───────────────────────────────────
function formatDisplayDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`;
}

module.exports = {
  handleEvent,
  handleFormSubmitted,
  handlePaymentCompleted,
};
