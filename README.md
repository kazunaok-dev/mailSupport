# Mail Support Case Visualizer

長いメールケースを解析し、顧客の質問、サポート回答、未解決点、誤認候補を3ペインUIで可視化する社内向けツールです。`OPENAI_API_KEY` が設定されている場合は OpenAI を使って、担当者が読みやすい自然な論点整理を生成します。

## Features

- 生メールテキストをそのまま投入してケースを解析
- 顧客質問を抽出し、主質問と派生質問を質問ツリーで表示
- 各質問に紐づくサポート回答、未解決理由、確認依頼項目を表示
- 顧客の誤認と思われる記述を候補として提示
- 回答支援用の返信ドラフトを生成
- Ver.2では `questions` を中心に、`answers`、`relations`、`audit`、元メール根拠を返します
- 質問状態は `answered`、`partially_answered`、`unanswered`、`pending`、`resolved` を使用します（既存UI互換の `status` も保持）

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

### Ver.2解析フロー

サーバー解析では、メールを正規化して current body と quoted body を分離し、顧客質問、後続サポート回答、対応関係、状態、根拠、監査結果を個別に生成します。回答状態の判定は回答メール本文だけを根拠にし、確認中の連絡は確定回答として扱いません。APIキーが利用できない場合も同じ台帳形式のルールベース結果を返します。

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

GitHub Pages 版は `docs/` 配下の静的サイトを公開します。サーバーは使わず、次の2つのモードで動作します。

- OpenAI APIキーを画面で入力した場合: ブラウザから OpenAI を直接呼び出して AI 解析
- APIキー未入力または失敗時: ブラウザ内のルールベース解析に自動フォールバック

GitHub のリポジトリ設定で `Settings` -> `Pages` を開き、Source を `Deploy from a branch`、Branch を `master`、Folder を `/docs` にすると公開できます。

このリポジトリには現時点で `.github/workflows` のworkflowは存在しないため、GitHub Actionsによる自動解析・公開は既存設定として確認できません。Pagesの既存方式とサーバー起動方式は削除していません。
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
