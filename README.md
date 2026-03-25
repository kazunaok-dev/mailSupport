# Mail Support Case Visualizer

長いメールケースを解析し、顧客の質問、サポート回答、未解決点、誤認候補を3ペインUIで可視化する社内向けツールです。`OPENAI_API_KEY` が設定されている場合は OpenAI を使って、担当者が読みやすい自然な論点整理を生成します。

## Features

- 生メールテキストをそのまま投入してケースを解析
- 顧客質問を抽出し、主質問と派生質問を質問ツリーで表示
- 各質問に紐づくサポート回答、未解決理由、確認依頼項目を表示
- 顧客の誤認と思われる記述を候補として提示
- 回答支援用の返信ドラフトを生成

## Run

```bash
cp .env.example .env
```

`.env` を開いて `OPENAI_API_KEY` を設定してから起動します。

```bash
npm start
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開きます。

`OPENAI_API_KEY` 未設定時はルールベース解析へ自動フォールバックします。

## GitHub Codespaces

このリポジトリは GitHub Codespaces でそのまま起動できます。

1. GitHub のリポジトリ画面で `Code` -> `Codespaces` -> `Create codespace on master`
2. Codespace が開いたら `.env` に `OPENAI_API_KEY` を設定
3. ターミナルで `npm start` を実行
4. `3000` 番ポートが自動転送されたら、Ports タブで `Visibility` を `Public` に変更

開発用の一時公開として使う想定です。Codespace を停止すると公開も止まります。

## Environment Variables

- `OPENAI_API_KEY`: OpenAI APIキー
- `OPENAI_MODEL`: 使用モデル。既定値は `gpt-5.4`

## API

- `POST /api/cases/analyze`
  - body: `{ "case_text": "..." }`
- `GET /api/cases/{case_id}`
- `GET /api/cases/{case_id}/issues/{issue_id}`
- `POST /api/cases/{case_id}/issues/{issue_id}/draft-reply`
- `GET /api/demo-case`

## Test

```bash
npm test
```
