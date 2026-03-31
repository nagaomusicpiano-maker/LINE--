/**
 * エルメ（L-messe）API連携モジュール
 *
 * - ユーザーのタグ取得
 * - タグ付与（受講済など）
 *
 * エルメAPIドキュメント: https://lmesse.jp/api/
 * ※ API仕様はエルメ管理画面のAPI設定から確認すること
 */

const https = require('https');

const ERUME_API_KEY = process.env.ERUME_API_KEY;
const ERUME_API_BASE = 'https://api.l-messe.jp/v1';

/**
 * エルメAPIにリクエストを送る汎用関数
 */
async function apiRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(ERUME_API_BASE + endpoint);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${ERUME_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * LINE ユーザーIDからエルメのユーザー情報（タグ含む）を取得
 * @param {string} lineUserId
 * @returns {string[]} タグ配列
 */
async function getUserTags(lineUserId) {
  try {
    const res = await apiRequest('GET', `/users?line_user_id=${lineUserId}`);
    // エルメAPIのレスポンス構造に合わせて適宜調整
    if (res && res.user && Array.isArray(res.user.tags)) {
      return res.user.tags.map((t) => (typeof t === 'string' ? t : t.name));
    }
    return [];
  } catch (err) {
    console.error('エルメ タグ取得エラー:', err.message);
    return [];
  }
}

/**
 * ユーザーにタグを付与する
 * @param {string} lineUserId
 * @param {string} tagName - 付与するタグ名（例: '受講済'）
 */
async function addTag(lineUserId, tagName) {
  try {
    await apiRequest('POST', '/users/tags', {
      line_user_id: lineUserId,
      tag: tagName,
    });
    console.log(`タグ付与: ${lineUserId} → ${tagName}`);
  } catch (err) {
    console.error('エルメ タグ付与エラー:', err.message);
  }
}

/**
 * ユーザーからタグを削除する
 * @param {string} lineUserId
 * @param {string} tagName
 */
async function removeTag(lineUserId, tagName) {
  try {
    await apiRequest('DELETE', '/users/tags', {
      line_user_id: lineUserId,
      tag: tagName,
    });
  } catch (err) {
    console.error('エルメ タグ削除エラー:', err.message);
  }
}

module.exports = { getUserTags, addTag, removeTag };
