/**
 * Piano Flex LINE予約システム - メインサーバー
 *
 * エンドポイント一覧:
 *   POST /webhook          LINE Messaging API Webhook
 *   POST /liff-submit      LIFFフォーム送信受信
 *   POST /payment-complete Square 決済完了通知（要署名検証）
 *   GET  /liff             LIFFアプリ（HTML配信）
 *   GET  /health           ヘルスチェック
 */

require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const path = require('path');
const crypto = require('crypto');

const { handleEvent, handleFormSubmitted, handlePaymentCompleted } = require('./line-handler');

const app = express();
const PORT = process.env.PORT || 3000;

// ────────────────────────────────────────────────────────────
// LINE Webhook ミドルウェア（署名検証あり）
// ────────────────────────────────────────────────────────────
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// LINE Webhookは署名検証のため raw body が必要
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  line.middleware(lineConfig),
  async (req, res) => {
    const events = req.body.events;
    if (!Array.isArray(events)) return res.sendStatus(200);

    await Promise.all(events.map((event) => handleEvent(event).catch(console.error)));
    res.sendStatus(200);
  }
);

// ────────────────────────────────────────────────────────────
// JSON パーサー（/webhook 以外に適用）
// ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ────────────────────────────────────────────────────────────
// LIFF フォーム配信
// ────────────────────────────────────────────────────────────
app.get('/liff', (req, res) => {
  // LIFF IDを埋め込んで配信
  const fs = require('fs');
  const templatePath = path.join(__dirname, '../liff/index.html');
  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace('__LIFF_ID__', process.env.LIFF_ID || '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ────────────────────────────────────────────────────────────
// LIFF フォーム送信受信
// ────────────────────────────────────────────────────────────
app.post('/liff-submit', async (req, res) => {
  const { userId, name, email, concern, focus, note } = req.body;

  if (!userId || !name || !email || !concern || !focus) {
    return res.status(400).json({ error: '必須項目が不足しています' });
  }

  try {
    await handleFormSubmitted(userId, { name, email, concern, focus, note: note || '' });
    res.json({ success: true });
  } catch (err) {
    console.error('LIFF submit error:', err);
    res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
});

// ────────────────────────────────────────────────────────────
// Square 決済完了 Webhook
//
// Square の Webhook 署名を検証してから処理する。
// Square管理画面の Webhook設定 → エンドポイントURL に
// https://your-domain.com/payment-complete を登録すること。
//
// 対応イベント: payment.completed
// ────────────────────────────────────────────────────────────
app.post('/payment-complete', express.raw({ type: 'application/json' }), async (req, res) => {
  // Square 署名検証
  const squareSignature = req.headers['x-square-hmacsha256-signature'];
  const squareWebhookSignatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

  if (squareWebhookSignatureKey && squareSignature) {
    const body = req.body.toString('utf8');
    const url = `${process.env.BASE_URL}/payment-complete`;
    const expected = computeSquareSignature(squareWebhookSignatureKey, url, body);
    if (expected !== squareSignature) {
      console.warn('Square Webhook: 署名検証失敗');
      return res.sendStatus(403);
    }
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }

  // payment.completed イベントのみ処理
  if (payload.type !== 'payment.completed') {
    return res.sendStatus(200);
  }

  // Square の payment.note または referenceId に LINE ユーザーIDを埋め込む運用
  // SquareリンクURL生成時に metadata.note に lineUserId を含めておくこと
  const payment = payload.data?.object?.payment;
  const lineUserId = payment?.note || payment?.reference_id;

  if (!lineUserId) {
    console.warn('Square Webhook: lineUserId が取得できませんでした', payload);
    return res.sendStatus(200);
  }

  try {
    await handlePaymentCompleted(lineUserId);
  } catch (err) {
    console.error('payment-complete handler error:', err);
  }

  res.sendStatus(200);
});

// ────────────────────────────────────────────────────────────
// ヘルスチェック
// ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ────────────────────────────────────────────────────────────
// 起動
// ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Piano Flex LINE Server 起動: http://localhost:${PORT}`);
  console.log(`  Webhook URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}/webhook`);
});

// ─── ユーティリティ ───────────────────────────────────
/**
 * Square Webhook の HMAC-SHA256 署名を計算する
 * https://developer.squareup.com/docs/webhooks/step3validate
 */
function computeSquareSignature(signatureKey, notificationUrl, body) {
  const hmac = crypto.createHmac('sha256', signatureKey);
  hmac.update(notificationUrl + body);
  return hmac.digest('base64');
}
