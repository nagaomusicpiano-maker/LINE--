/**
 * LINE メッセージ テンプレート
 *
 * 予約フローの各ステップで送信するメッセージを生成する
 */

const BASE_URL = process.env.BASE_URL || '';
const LIFF_ID = process.env.LIFF_ID || '';

/**
 * 日程選択メッセージ（Flex Message）
 * @param {Array} availableDates - [{date, displayDate, slots:[]}]
 */
function buildDateSelectionMessage(availableDates) {
  if (availableDates.length === 0) {
    return {
      type: 'text',
      text: '現在ご予約可能な日程がございません。\nしばらく経ってから再度お試しください。\nまたはお問い合わせよりご連絡ください。',
    };
  }

  // 最大10日分をボタンで表示
  const displayDates = availableDates.slice(0, 10);

  const bubbles = displayDates.map((d) => ({
    type: 'bubble',
    size: 'micro',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: d.displayDate,
          weight: 'bold',
          size: 'sm',
          wrap: true,
        },
        {
          type: 'text',
          text: `空き ${d.slots.length} 枠`,
          size: 'xs',
          color: '#27ae60',
          margin: 'xs',
        },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#3b82f6',
          height: 'sm',
          action: {
            type: 'postback',
            label: 'この日を選ぶ',
            data: `action=select_date&date=${d.date}`,
            displayText: `${d.displayDate} を選択`,
          },
        },
      ],
    },
  }));

  return {
    type: 'flex',
    altText: '📅 レッスン日程を選択してください',
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  };
}

/**
 * 時間帯選択メッセージ（Quick Reply）
 * @param {string} displayDate - 表示用日付
 * @param {Array} slots - [{id, label, start, end}]
 */
function buildTimeSelectionMessage(displayDate, slots) {
  const items = slots.map((slot) => ({
    type: 'action',
    action: {
      type: 'postback',
      label: slot.label,
      data: `action=select_time&slotId=${slot.id}&start=${slot.start}&end=${slot.end}&label=${encodeURIComponent(slot.label)}`,
      displayText: `${slot.label} を選択`,
    },
  }));

  return {
    type: 'text',
    text: `${displayDate}\nご希望の時間帯を選択してください。`,
    quickReply: { items },
  };
}

/**
 * LIFF フォームへの誘導メッセージ
 * @param {string} dateLabel - 選択した日時ラベル
 */
function buildFormInviteMessage(dateLabel) {
  const liffUrl = `https://liff.line.me/${LIFF_ID}`;

  return {
    type: 'flex',
    altText: '📝 ご予約情報の入力',
    contents: {
      type: 'bubble',
      hero: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '📅 選択日時',
            size: 'sm',
            color: '#888888',
          },
          {
            type: 'text',
            text: dateLabel,
            weight: 'bold',
            size: 'md',
          },
        ],
        paddingAll: '20px',
        backgroundColor: '#f0f9ff',
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'ご予約情報の入力',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: '以下の情報をご入力ください。\n・お名前\n・メールアドレス\n・現在のお悩み\n・特に見てほしいこと',
            size: 'sm',
            wrap: true,
            margin: 'md',
            color: '#555555',
          },
        ],
        paddingAll: '20px',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#3b82f6',
            action: {
              type: 'uri',
              label: '入力フォームを開く',
              uri: liffUrl,
            },
          },
        ],
        paddingAll: '12px',
      },
    },
  };
}

/**
 * 利用規約同意メッセージ
 */
function buildTermsMessage() {
  const termsText = `【利用規約】

Piano Flexレッスンをご予約いただくにあたり、以下の規約にご同意ください。

■ キャンセルポリシー
・レッスン7日前まで：無料キャンセル
・レッスン3〜6日前：料金の50%
・レッスン2日前〜当日：料金の100%

■ その他
・遅刻された場合、終了時間は変わりません
・天災等の不可抗力による中止は別途ご相談します

以上の規約に同意される場合は「同意する」を押してください。`;

  return {
    type: 'flex',
    altText: '📋 利用規約のご確認',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '📋 利用規約',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'text',
            text: termsText,
            size: 'sm',
            wrap: true,
            margin: 'md',
            color: '#444444',
          },
        ],
        paddingAll: '20px',
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'button',
            style: 'secondary',
            flex: 1,
            action: {
              type: 'postback',
              label: '同意しない',
              data: 'action=terms_decline',
              displayText: '同意しない',
            },
          },
          {
            type: 'button',
            style: 'primary',
            color: '#3b82f6',
            flex: 1,
            margin: 'sm',
            action: {
              type: 'postback',
              label: '同意する ✓',
              data: 'action=terms_agree',
              displayText: '利用規約に同意します',
            },
          },
        ],
        paddingAll: '12px',
      },
    },
  };
}

/**
 * 料金プラン確認メッセージ
 * @param {object} plan - { planName, price, duration, squareUrl }
 * @param {object} userInfo - { name, selectedDateLabel }
 */
function buildPlanConfirmMessage(plan, userInfo) {
  const lines = [
    `▼ ご予約内容の確認`,
    ``,
    `お名前：${userInfo.name} 様`,
    `日時：${userInfo.selectedDateLabel}`,
    ``,
    `▼ プラン`,
    `${plan.planName}`,
    `料金：${plan.price}`,
  ];
  if (plan.duration && plan.duration !== '—') {
    lines.push(`時間：${plan.duration}`);
  }

  return {
    type: 'flex',
    altText: '✅ ご予約内容の確認',
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '✅ ご予約内容の確認',
            weight: 'bold',
            size: 'lg',
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            contents: [
              row('お名前', `${userInfo.name} 様`),
              row('日時', userInfo.selectedDateLabel),
              row('プラン', plan.planName),
              row('料金', plan.price),
              ...(plan.duration && plan.duration !== '—' ? [row('時間', plan.duration)] : []),
            ],
          },
        ],
        paddingAll: '20px',
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#27ae60',
            action: {
              type: 'uri',
              label: '💳 決済へ進む',
              uri: plan.squareUrl || 'https://square.link/',
            },
          },
          {
            type: 'text',
            text: '※ 決済完了後に予約が確定されます',
            size: 'xs',
            color: '#888888',
            align: 'center',
            margin: 'sm',
          },
        ],
        paddingAll: '12px',
      },
    },
  };
}

/**
 * 予約完了メッセージ
 * @param {object} info - { name, selectedDateLabel, planName }
 */
function buildCompletionMessage(info) {
  return {
    type: 'flex',
    altText: '🎉 ご予約ありがとうございます！',
    contents: {
      type: 'bubble',
      hero: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#27ae60',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: '🎉 ご予約完了',
            weight: 'bold',
            size: 'xl',
            color: '#ffffff',
            align: 'center',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: `${info.name} 様\nご予約ありがとうございます！`,
            wrap: true,
            size: 'md',
          },
          {
            type: 'separator',
            margin: 'md',
          },
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            contents: [
              row('日時', info.selectedDateLabel),
              row('プラン', info.planName),
            ],
          },
          {
            type: 'text',
            text: 'レッスン当日は5分前を目安にご準備ください。\nご不明点はお問い合わせください。',
            size: 'sm',
            wrap: true,
            margin: 'lg',
            color: '#555555',
          },
        ],
        paddingAll: '20px',
      },
    },
  };
}

/**
 * エラー・キャンセルメッセージ
 */
function buildCancelMessage(reason = '') {
  return {
    type: 'text',
    text: `予約フローを終了しました。${reason ? '\n' + reason : ''}\n\nご予約はリッチメニューの「予約」ボタンからいつでも再開できます。`,
  };
}

// ─── ユーティリティ ───────────────────────────────────
function row(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#888888', flex: 2 },
      { type: 'text', text: value, size: 'sm', flex: 3, wrap: true },
    ],
  };
}

module.exports = {
  buildDateSelectionMessage,
  buildTimeSelectionMessage,
  buildFormInviteMessage,
  buildTermsMessage,
  buildPlanConfirmMessage,
  buildCompletionMessage,
  buildCancelMessage,
};
