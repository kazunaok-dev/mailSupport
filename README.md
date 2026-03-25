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
2. Codespace が開いたら、まずターミナルで `node -v` と `npm -v` を実行して Node.js / npm が使えることを確認
3. `.env` に `OPENAI_API_KEY` を設定
4. ターミナルで `npm start` を実行
5. `3000` 番ポートが自動転送されたら、Ports タブで `Visibility` を `Public` に変更

### Codespaces トラブルシュート

- `npm: command not found` と表示された場合は、dev container が正しく反映されていない可能性があります。
- `F1` または `Ctrl + Shift + P` でコマンドパレットを開き、`Codespaces: Rebuild Container` を実行してください。
- Rebuild 後にもう一度 `node -v` と `npm -v` を確認し、その後 `npm start` を実行してください。
- それでも解決しない場合は、古い Codespace の可能性があるため、最新コミットから Codespace を作り直してください。

開発用の一時公開として使う想定です。Codespace を停止すると公開も止まります。

## GitHub Pages

GitHub Pages でも公開できますが、Pages は静的ホスティングのため、公開版はブラウザ内のローカル解析モードで動作します。

- GitHub Pages 版では `server.js` や OpenAI API は使いません
- 解析はブラウザ内のルールベース解析に自動フォールバックします
- `docs/` 配下が GitHub Pages 配信用の静的サイトです

GitHub のリポジトリ設定で `Settings` -> `Pages` を開き、Source を `Deploy from a branch`、Branch を `master`、Folder を `/docs` にすると公開できます。
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
