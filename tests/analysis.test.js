import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCaseText, buildDraftReply } from "../src/analysis.js";

const sampleCase = `From: customer@example.com
Date: 2026-03-20 09:10

起動時にエラーコードE-42が表示されます。
このエラーはライセンス切れが原因でしょうか？
管理画面の利用者一覧が空ですが、初期同期にはどれくらいかかりますか？
社内ではポート443は不要だと聞いています。

From: support@example.com
Date: 2026-03-20 11:00

E-42はライセンス切れではありません。設定ファイル不足の可能性があります。
利用者一覧の初期同期は通常15分以内です。
ポート443は初期同期で利用するため、疎通確認をお願いします。

From: customer@example.com
Date: 2026-03-20 13:30

利用者一覧はまだ空です。
別件ですが、CSV取込時に文字化けするのはUTF-8以外未対応だからですか？

From: support@example.com
Date: 2026-03-20 16:00

CSV取込はUTF-8とShift_JISに対応しています。
利用者一覧が空の件は、ポート443の通信結果を確認できるまで継続調査となります。`;

test("splits multiple customer questions into separate issues", async () => {
  const result = await analyzeCaseText(sampleCase, "case-test", { aiMode: "never" });
  assert.equal(result.messages.length, 4);
  assert.ok(result.issues.length >= 3);
  assert.match(
    result.issues.map((issue) => issue.customer_question).join("\n"),
    /ライセンス切れ/
  );
  assert.match(
    result.issues.map((issue) => issue.customer_question).join("\n"),
    /CSV取込/
  );
});

test("links support answers and flags misunderstandings", async () => {
  const result = await analyzeCaseText(sampleCase, "case-test", { aiMode: "never" });
  const licenseIssue = result.issues.find((issue) => /ライセンス切れ/.test(issue.customer_question));

  assert.ok(licenseIssue);
  assert.ok(licenseIssue.support_answers.length >= 1);
  assert.equal(licenseIssue.misunderstanding_flag, "suspected");
});

test("marks ongoing investigation as on_hold instead of resolved", async () => {
  const result = await analyzeCaseText(sampleCase, "case-test", { aiMode: "never" });
  const syncIssue = result.issues.find((issue) => /同期/.test(issue.customer_question));

  assert.ok(syncIssue);
  assert.equal(syncIssue.status, "on_hold");
});

test("builds a draft reply with summary and confirmation items", async () => {
  const result = await analyzeCaseText(sampleCase, "case-test", { aiMode: "never" });
  const csvIssue = result.issues.find((issue) => /CSV取込/.test(issue.customer_question));

  assert.ok(csvIssue);
  const draft = buildDraftReply(result, csvIssue);
  assert.match(draft.draft_reply, /ご案内します/);
  assert.ok(Array.isArray(draft.confirmation_items));
});
