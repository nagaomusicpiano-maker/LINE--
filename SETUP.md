# Piano Flex LINE予約システム セットアップ手順

## ファイル構成

```
LINE構築/
├── src/
│   ├── server.js        # メインサーバー（エントリポイント）
│   ├── line-handler.js  # LINEイベント・予約フロー制御
│   ├── calendar.js      # Google Calendar連携
│   ├── pricing.js       # 料金・Squareリンク判定
│   ├── session.js       # 予約セッション管理
│   ├── erume.js         # エルメAPIタグ管理
│   └── messages.js      # LINEメッセージテンプレート
├── liff/
│   └── index.html       # ユーザー情報入力フォーム（LIFF）
├── package.json
├── .env.example         # 環境変数テンプレート
└── SETUP.md             # この手順書
```

---

## 事前準備

### 1. Node.js インストール
Node.js 18以上が必要です。

```bash
node -v  # v18.0.0 以上であること
```

### 2. パッケージインストール

```bash
cd "LINE構築"
npm install
```

---

## 各サービスの設定

### 3. Google Cloud / Calendar API

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. 「Google Calendar API」を有効化
3. 「サービスアカウント」を作成し、JSONキーをダウンロード
4. ダウンロードしたJSONを `google-service-account-key.json` としてプロジェクトルートに配置
5. Googleカレンダーの「設定と共有」でサービスアカウントのメールアドレスに **編集権限** を付与
6. カレンダーIDをコピーして `.env` の `GOOGLE_CALENDAR_ID` に設定

**カレンダーの空き枠の作り方：**
- タイトルを `[空き枠]` で始まるイベントとして登録してください
  - 例：`[空き枠] 空き`
- 予約が入ると自動的に `[予約済]` に変わります

### 4. Square 決済リンク

1. [Square 管理画面](https://squareup.com/dashboard/) でリンク決済を作成
2. 料金プランごとに個別URLを作成（`.env.example` 参照）
3. 各URLを `.env` に設定

**重要：** 決済時に顧客の LINE ユーザーIDを `note` フィールドに含める必要があります。
Square リンクでは自動設定が難しいため、決済完了後の照合には以下の運用を推奨：
- Square の `reference_id` 機能を使うか、決済完了をSquare Webhookで受け取り管理者確認後に手動で `受講済` タグを付与する運用も可。

### 5. LINE Messaging API

1. [LINE Developers Console](https://developers.line.biz/) でプロバイダー・チャネル作成
2. 「Messaging API」チャネルを選択
3. チャネルアクセストークン（長期）とチャネルシークレットを取得
4. Webhook URL を `https://your-domain.com/webhook` に設定
5. 「Webhookの利用」を ON にする

### 6. LIFF アプリ登録

1. LINE Developers Console で「LIFF」タブを選択
2. 「LIFFアプリを追加」
   - エンドポイントURL：`https://your-domain.com/liff`
   - スコープ：`openid`, `profile`
   - サイズ：`Tall`
3. 発行された LIFF ID を `.env` の `LIFF_ID` に設定

### 7. エルメ API設定

1. エルメ管理画面 → API設定 → APIキーを取得
2. `.env` の `ERUME_API_KEY` に設定
3. エルメのシナリオで「予約」ボタンのアクションを以下に設定：
   - **Postback データ**：`action=start_booking`

---

## 環境変数設定

```bash
cp .env.example .env
# .env を編集して各値を入力
```

---

## サーバーの起動

```bash
# 開発環境
npm run dev

# 本番環境
npm start
```

---

## 本番デプロイ

LINEのWebhookにはHTTPS（SSL）が必要です。

**推奨デプロイ先：**
- Railway（無料枠あり、簡単デプロイ）
- Render.com（無料枠あり）
- Heroku
- Google Cloud Run

**Railwayでのデプロイ例：**
```bash
# Railway CLI インストール後
railway init
railway up
```

---

## 予約フロー動作確認

1. LINEでボット（Piano Flex公式アカウント）を友だち追加
2. 「予約」とメッセージを送信
3. 日程選択 → 時間選択 → フォーム入力（LIFF）→ 利用規約同意 → 料金確認 → 決済リンク が表示されることを確認
4. Googleカレンダーで `[空き枠]` イベントが `[予約済]` に変わっていることを確認

---

## よくある問題

| 症状 | 原因 | 対処 |
|------|------|------|
| 日程が表示されない | カレンダーIDが間違い、またはサービスアカウントに権限なし | カレンダー共有設定を確認 |
| タグが取得できない | エルメAPIキー未設定 | `.env` の `ERUME_API_KEY` を確認 |
| LIFFが開かない | LIFF IDが間違い | LINE Developers Console でLIFF IDを再確認 |
| Webhook受信エラー | 署名検証失敗 | `LINE_CHANNEL_SECRET` を確認 |
