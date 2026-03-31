/**
 * 料金・Squareリンク判定モジュール
 *
 * タグ（地域・年齢・受講ステータス）の組み合わせから
 * デフォルト表示プランとSquare決済URLを返す
 */

/**
 * タグ配列から地域・年齢・受講ステータスを判定してプラン情報を返す
 *
 * @param {string[]} tags - ユーザーに付与されているタグ配列
 * @returns {{ planName: string, price: string, duration: string, squareUrl: string, region: string } | null}
 */
function getPlanForTags(tags) {
  const region = detectRegion(tags);
  const ageGroup = detectAgeGroup(tags);
  const isFirstTime = !tags.includes('受講済');

  switch (region) {
    case '東京':
      return getTokyoPlan(isFirstTime);
    case '大阪':
      return getOsakaPlan(ageGroup, isFirstTime);
    case '宇都宮':
      return getUtsunomiyaPlan(ageGroup);
    default:
      return null; // 北海道・その他は料金プランなし
  }
}

/**
 * 東京プラン
 */
function getTokyoPlan(isFirstTime) {
  if (isFirstTime) {
    return {
      region: '東京',
      planName: '奏法診断',
      price: '12,000円',
      duration: '60分',
      squareUrl: process.env.SQUARE_TOKYO_FIRST,
    };
  }
  // 受講済はシングルをデフォルト表示
  return {
    region: '東京',
    planName: 'シングル',
    price: '20,000円',
    duration: '90分×1回',
    squareUrl: process.env.SQUARE_TOKYO_SINGLE,
  };
}

/**
 * 大阪プラン（デフォルト：動画添削あり）
 */
function getOsakaPlan(ageGroup, isFirstTime) {
  const plans = {
    大人: {
      受講未: {
        planName: '大阪レッスン（大人・初回）',
        price: '22,000円',
        duration: '—',
        squareUrl: process.env.SQUARE_OSAKA_ADULT_FIRST_W,
      },
      受講済: {
        planName: '大阪レッスン（大人・継続）',
        price: '25,000円',
        duration: '—',
        squareUrl: process.env.SQUARE_OSAKA_ADULT_DONE_W,
      },
    },
    学生: {
      受講未: {
        planName: '大阪レッスン（学生・初回）',
        price: '18,000円',
        duration: '—',
        squareUrl: process.env.SQUARE_OSAKA_STUDENT_FIRST_W,
      },
      受講済: {
        planName: '大阪レッスン（学生・継続）',
        price: '20,000円',
        duration: '—',
        squareUrl: process.env.SQUARE_OSAKA_STUDENT_DONE_W,
      },
    },
    ジュニア: {
      受講未: {
        planName: '大阪レッスン（ジュニア・初回）',
        price: '15,000円',
        duration: '—',
        squareUrl: process.env.SQUARE_OSAKA_JUNIOR_FIRST_W,
      },
      受講済: {
        planName: '大阪レッスン（ジュニア・継続）',
        price: '18,000円',
        duration: '—',
        squareUrl: process.env.SQUARE_OSAKA_JUNIOR_DONE_W,
      },
    },
  };

  const statusKey = isFirstTime ? '受講未' : '受講済';
  const agePlan = plans[ageGroup] || plans['大人']; // 年齢タグ未設定時は大人扱い
  return { region: '大阪', ...agePlan[statusKey] };
}

/**
 * 宇都宮プラン（月額制・受講未済の区別なし）
 */
function getUtsunomiyaPlan(ageGroup) {
  const plans = {
    幼児・低学年: {
      planName: '宇都宮レッスン（幼児・低学年）',
      price: '2,500円/月',
      duration: '—',
      squareUrl: process.env.SQUARE_UTSUNOMIYA_INFANT,
    },
    ジュニア: {
      planName: '宇都宮レッスン（小学生）',
      price: '5,000円/月',
      duration: '—',
      squareUrl: process.env.SQUARE_UTSUNOMIYA_JUNIOR,
    },
    学生: {
      planName: '宇都宮レッスン（学生）',
      price: '10,000円/月',
      duration: '—',
      squareUrl: process.env.SQUARE_UTSUNOMIYA_STUDENT,
    },
    教員志望大学生: {
      planName: '宇都宮レッスン（教員志望）',
      price: '2,500円/月',
      duration: '30分',
      squareUrl: process.env.SQUARE_UTSUNOMIYA_TEACHER,
    },
  };

  return { region: '宇都宮', ...(plans[ageGroup] || plans['学生']) };
}

/**
 * タグから地域を検出
 */
function detectRegion(tags) {
  const regions = ['東京', '大阪', '北海道', '宇都宮', 'その他'];
  return regions.find((r) => tags.includes(r)) || 'その他';
}

/**
 * タグから年齢グループを検出
 */
function detectAgeGroup(tags) {
  if (tags.includes('教員志望大学生')) return '教員志望大学生';
  if (tags.includes('幼児・低学年')) return '幼児・低学年';
  if (tags.includes('ジュニア')) return 'ジュニア';
  if (tags.includes('学生')) return '学生';
  if (tags.includes('大人')) return '大人';
  return '大人'; // デフォルト
}

/**
 * プラン情報をLINEメッセージ用テキストに整形
 */
function formatPlanMessage(plan) {
  const lines = [
    '📋 ご予約プランの確認',
    '─────────────────',
    `プラン：${plan.planName}`,
    `料金：${plan.price}`,
  ];
  if (plan.duration && plan.duration !== '—') {
    lines.push(`時間：${plan.duration}`);
  }
  lines.push('─────────────────');
  lines.push('※ 動画添削なしプランをご希望の方はお問い合わせください。');
  return lines.join('\n');
}

module.exports = {
  getPlanForTags,
  formatPlanMessage,
  detectRegion,
};
