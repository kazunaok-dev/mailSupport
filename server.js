import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { analyzeCaseText, buildDraftReply, createCaseRecord } from "./src/analysis.js";
import { createCaseStore } from "./src/store.js";

const store = createCaseStore();
const rootDir = new URL(".", import.meta.url).pathname;
const publicDir = join(rootDir, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const { pathname } = requestUrl;

    if (pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/cases/analyze" && req.method === "POST") {
      const body = await readJson(req);
      const caseText = typeof body.case_text === "string" ? body.case_text : "";
      if (!caseText.trim()) {
        return sendJson(res, 400, { error: "case_text is required" });
      }

      const caseRecord = await createCaseRecord(caseText, body.case_id);
      store.save(caseRecord);
      return sendJson(res, 201, caseRecord);
    }

    if (pathname.startsWith("/api/cases/") && req.method === "GET") {
      const parts = pathname.split("/").filter(Boolean);

      if (parts.length === 3) {
        const [, , caseId] = parts;
        const caseRecord = store.get(caseId);
        if (!caseRecord) {
          return sendJson(res, 404, { error: "case not found" });
        }
        return sendJson(res, 200, caseRecord);
      }

      if (parts.length === 5 && parts[3] === "issues") {
        const [, , caseId, , issueId] = parts;
        const caseRecord = store.get(caseId);
        if (!caseRecord) {
          return sendJson(res, 404, { error: "case not found" });
        }

        const issue = caseRecord.issues.find((item) => item.id === issueId);
        if (!issue) {
          return sendJson(res, 404, { error: "issue not found" });
        }

        return sendJson(res, 200, {
          case_id: caseRecord.case_id,
          case_summary: caseRecord.case_summary,
          issue,
          messages: caseRecord.messages.filter((message) =>
            issue.related_message_ids.includes(message.id)
          )
        });
      }
    }

    if (
      pathname.startsWith("/api/cases/") &&
      pathname.endsWith("/draft-reply") &&
      req.method === "POST"
    ) {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length !== 6 || parts[3] !== "issues") {
        return sendJson(res, 404, { error: "not found" });
      }

      const [, , caseId, , issueId] = parts;
      const caseRecord = store.get(caseId);
      if (!caseRecord) {
        return sendJson(res, 404, { error: "case not found" });
      }

      const issue = caseRecord.issues.find((item) => item.id === issueId);
      if (!issue) {
        return sendJson(res, 404, { error: "issue not found" });
      }

      return sendJson(res, 200, buildDraftReply(caseRecord, issue));
    }

    if (pathname === "/api/demo-case" && req.method === "GET") {
      return sendJson(res, 200, { case_text: demoCaseText });
    }

    return serveStatic(pathname, res);
  } catch (error) {
    return sendJson(res, 500, {
      error: "internal server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";
server.listen(port, host, () => {
  console.log(`Server running on http://${host}:${port}`);
});

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDir, safePath));

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  try {
    const contents = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream"
    });
    res.end(contents);
  } catch {
    sendJson(res, 404, { error: "not found" });
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

const demoCaseText = `From: customer@example.com
Date: 2026-03-20 09:10
Subject: インストール後の動作について

サポートご担当者様

製品Aをインストールしたところ、起動時にエラーコードE-42が表示されます。
このエラーはライセンス切れが原因でしょうか？
また、管理画面の利用者一覧が空ですが、初期同期にはどれくらいかかりますか？
社内ではポート443は不要だと聞いています。

---
署名

From: support@example.com
Date: 2026-03-20 11:00
Subject: Re: インストール後の動作について

お問い合わせありがとうございます。
E-42は一般的には設定ファイル不足のときに発生します。ライセンス切れではありません。
利用者一覧の初期同期は通常15分以内です。
ポート443は初期同期で利用するため、疎通確認をお願いします。
設定ファイル config.yml の有無と、接続確認結果をご共有ください。

From: customer@example.com
Date: 2026-03-20 13:30
Subject: Re: インストール後の動作について

config.yml は存在していました。
利用者一覧はまだ空です。
別件ですが、CSV取込時に文字化けするのはUTF-8以外未対応だからですか？

2026-03-20 11:00 support@example.com:
> 利用者一覧の初期同期は通常15分以内です。
> ポート443は初期同期で利用するため、疎通確認をお願いします。

From: support@example.com
Date: 2026-03-20 16:00
Subject: Re: インストール後の動作について

CSV取込はUTF-8とShift_JISに対応しています。
そのため文字化けの原因は文字コード断定ではなく、列定義差異の可能性があります。
利用者一覧が空の件は、ポート443の通信結果を確認できるまで継続調査となります。`;
