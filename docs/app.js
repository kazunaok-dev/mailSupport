import { analyzeCaseTextClient } from "./browserAnalysis.js";
import { analyzeCaseWithBrowserAI, getDefaultBrowserModel } from "./openaiBrowserAnalysis.js";

const state = {
  caseRecord: null,
  selectedIssueId: null,
  runtimeMode: "server",
  lastAnalysisError: ""
};

const caseTextInput = document.querySelector("#caseText");
const analyzeButton = document.querySelector("#analyzeButton");
const loadDemoButton = document.querySelector("#loadDemoButton");
const issueTree = document.querySelector("#issueTree");
const issueDetail = document.querySelector("#issueDetail");
const messageViewer = document.querySelector("#messageViewer");
const summaryCards = document.querySelector("#summaryCards");
const summaryCardTemplate = document.querySelector("#summaryCardTemplate");
const insightBar = document.querySelector("#insightBar");
const apiKeyInput = document.querySelector("#apiKeyInput");
const modelInput = document.querySelector("#modelInput");
const clearKeyButton = document.querySelector("#clearKeyButton");

const sessionKeyName = "mail-support-openai-api-key";
apiKeyInput.value = sessionStorage.getItem(sessionKeyName) ?? "";
modelInput.value = getDefaultBrowserModel();

clearKeyButton.addEventListener("click", () => {
  sessionStorage.removeItem(sessionKeyName);
  apiKeyInput.value = "";
});

analyzeButton.addEventListener("click", async () => {
  const caseText = caseTextInput.value.trim();
  if (!caseText) {
    window.alert("ケーステキストを入力してください。");
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = "解析中...";

  try {
    const data = await analyzeCase(caseText);
    state.caseRecord = data;
    state.selectedIssueId = data.issues[0]?.id ?? null;
    render();
  } catch (error) {
    window.alert(error.message);
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "ケースを解析する";
  }
});

loadDemoButton.addEventListener("click", async () => {
  caseTextInput.value = await loadDemoCaseText();
});

function render() {
  renderSummary();
  renderInsights();
  renderTree();
  renderDetail();
  renderMessages();
}

function renderSummary() {
  summaryCards.innerHTML = "";
  if (!state.caseRecord) {
    return;
  }

  const summary = state.caseRecord.case_summary;
  const entries = [
    ["メール数", summary.message_count],
    ["抽出質問数", summary.issue_count],
    ["未回答", summary.open_issue_count],
    ["回答済み未解決", summary.answered_pending_count],
    ["保留", summary.on_hold_count],
    ["誤認候補", summary.misunderstanding_count]
  ];

  for (const [label, value] of entries) {
    const fragment = summaryCardTemplate.content.cloneNode(true);
    fragment.querySelector(".summary-label").textContent = label;
    fragment.querySelector(".summary-value").textContent = value;
    summaryCards.append(fragment);
  }
}

function renderInsights() {
  insightBar.innerHTML = "";
  if (!state.caseRecord) {
    return;
  }

  const summary = state.caseRecord.case_summary;
  const cards = [
    {
      title: state.caseRecord.analysis_mode.startsWith("ai") ? "AI解析" : "フォールバック解析",
      text:
        state.caseRecord.analysis_mode.startsWith("ai")
          ? state.runtimeMode === "browser_ai"
            ? "GitHub Pages 上で、入力した API キーを使ってブラウザから OpenAI を直接呼び出しています。"
            : "OpenAI を使って論点を人が読みやすい日本語に整理しています。"
          : state.runtimeMode === "static"
            ? `GitHub Pages 向けの静的モードです。ブラウザ内のローカル解析で表示しています。${
                state.lastAnalysisError ? ` AI 呼び出し失敗: ${state.lastAnalysisError}` : ""
              }`
            : "OPENAI_API_KEY 未設定などのため、現在はルールベース解析で表示しています。"
    },
    { title: "ケース要約", text: summary.narrative_summary },
    { title: "引継ぎメモ", text: summary.handoff_summary },
    { title: "次の一手", text: summary.recommended_next_step }
  ];

  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "insight-card";
    article.innerHTML = `<strong>${escapeHtml(card.title)}</strong><div class="markdown-body">${renderMarkdown(card.text)}</div>`;
    insightBar.append(article);
  }
}

function renderTree() {
  issueTree.innerHTML = "";
  if (!state.caseRecord?.issues.length) {
    issueTree.classList.add("empty");
    issueTree.textContent = "抽出された質問がありません。";
    return;
  }

  issueTree.classList.remove("empty");
  for (const issue of state.caseRecord.issues) {
    const button = document.createElement("button");
    button.className = `issue-node ${issue.parent_issue_id ? "child" : ""} ${
      issue.id === state.selectedIssueId ? "active" : ""
    }`;
    button.innerHTML = `
      <h3>${escapeHtml(issue.display_title || issue.customer_question)}</h3>
      <p>${escapeHtml(issue.summary || issue.customer_question)}</p>
      <div class="chips">
        ${renderStatusChip(issue.status)}
        ${
          issue.misunderstanding_flag !== "none"
            ? '<span class="chip warning">誤認候補あり</span>'
            : ""
        }
      </div>
    `;
    button.addEventListener("click", () => {
      state.selectedIssueId = issue.id;
      render();
    });
    issueTree.append(button);
  }
}

function renderDetail() {
  const issue = state.caseRecord?.issues.find((item) => item.id === state.selectedIssueId);
  if (!issue) {
    issueDetail.className = "detail empty";
    issueDetail.textContent = "左の質問を選択してください。";
    return;
  }

  issueDetail.className = "detail";
  const answerSummary = issue.support_answers.length
    ? issue.answer_summary || issue.support_answers.map((answer) => answer.text).join(" / ")
    : issue.answer_summary || "まだ回答がありません。";

  issueDetail.innerHTML = `
    <section class="detail-section">
      <h3>顧客の質問</h3>
      <p>${escapeHtml(issue.customer_question)}</p>
      <p>${escapeHtml(issue.summary || "")}</p>
      <div class="chips">
        ${renderStatusChip(issue.status)}
        ${issue.parent_issue_id ? '<span class="chip">派生質問</span>' : '<span class="chip">主質問</span>'}
      </div>
    </section>
    <section class="detail-section">
      <h3>これまでの回答要約</h3>
      <p>${escapeHtml(answerSummary)}</p>
    </section>
    <section class="detail-section">
      <h3>未解決理由</h3>
      <ul>${buildList(issue.unanswered_points?.length ? issue.unanswered_points : resolvePendingPoints(issue))}</ul>
    </section>
    <section class="detail-section">
      <h3>顧客に確認すべき追加情報</h3>
      <ul>${buildList(issue.confirmation_items?.length ? issue.confirmation_items : issue.next_actions.length ? issue.next_actions : ["追加確認は特にありません。"])}</ul>
    </section>
    <section class="detail-section">
      <h3>誤情報候補</h3>
      <ul>${buildList(
        issue.possible_misunderstandings.length
          ? issue.possible_misunderstandings.map((item) => `${item.statement} (${item.reason})`)
          : ["誤認候補は見つかっていません。"]
      )}</ul>
    </section>
    <section class="detail-section">
      <h3>返信ドラフト</h3>
      <pre>${escapeHtml(issue.draft_reply || buildDraft(issue))}</pre>
    </section>
  `;
}

function renderMessages() {
  const issue = state.caseRecord?.issues.find((item) => item.id === state.selectedIssueId);
  if (!state.caseRecord?.messages.length) {
    messageViewer.className = "messages empty";
    messageViewer.textContent = "解析するとメール本文が表示されます。";
    return;
  }

  messageViewer.className = "messages";
  messageViewer.innerHTML = "";

  for (const message of state.caseRecord.messages) {
    const card = document.createElement("article");
    card.className = `message-card ${
      issue?.related_message_ids.includes(message.id) ? "active" : ""
    }`;
    card.innerHTML = `
      <div class="message-meta">
        <span>${escapeHtml(message.from || "unknown")}</span>
        <span>${escapeHtml(message.date || "")}</span>
      </div>
      <p class="message-body">${highlightMessage(issue, message.body)}</p>
    `;
    messageViewer.append(card);
  }
}

function renderStatusChip(status) {
  const map = {
    open: '<span class="chip danger">未回答</span>',
    answered_pending: '<span class="chip warning">回答済み未解決</span>',
    resolved: '<span class="chip success">解決済み</span>',
    on_hold: '<span class="chip">保留</span>'
  };
  return map[status] ?? '<span class="chip">不明</span>';
}

function resolvePendingPoints(issue) {
  if (issue.status === "open") {
    return ["サポートからの回答がまだ紐付いていません。"];
  }

  if (issue.status === "on_hold") {
    return ["追加の調査結果や顧客情報待ちです。"];
  }

  if (issue.status === "answered_pending") {
    return ["回答済みですが、顧客側での確認または追加案内が必要です。"];
  }

  return ["解決済みと判断されています。"];
}

function buildDraft(issue) {
  const summary = issue.support_answers.map((answer) => answer.text).join(" / ");
  const requested = issue.next_actions.length
    ? `追加で ${issue.next_actions.join("、")} をご共有ください。`
    : "追加で必要な情報はありません。";

  return `${issue.customer_question} についてご案内します。\n${summary || "現在確認中です。"}\n${requested}`;
}

function highlightMessage(issue, body) {
  const safe = escapeHtml(body);
  if (!issue) {
    return safe.replace(/\n/g, "<br />");
  }

  const terms = [...new Set(issue.customer_question.match(/[A-Za-z0-9_/-]{2,}|[一-龠ぁ-んァ-ヶ]{2,}/gu) ?? [])]
    .filter((token) => token.length > 1)
    .slice(0, 6);

  let highlighted = safe;
  for (const term of terms) {
    const pattern = new RegExp(escapeRegExp(term), "g");
    highlighted = highlighted.replace(pattern, `<mark>${term}</mark>`);
  }

  return highlighted.replace(/\n/g, "<br />");
}

function buildList(items) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function analyzeCase(caseText) {
  const apiKey = apiKeyInput.value.trim();
  if (apiKey) {
    sessionStorage.setItem(sessionKeyName, apiKey);

    try {
      state.runtimeMode = "browser_ai";
      state.lastAnalysisError = "";
      return await analyzeCaseWithBrowserAI(caseText, {
        apiKey,
        model: modelInput.value.trim() || getDefaultBrowserModel()
      });
    } catch (error) {
      console.error(error);
      state.lastAnalysisError = error.message || String(error);
    }
  }

  const apiUrl = resolveAppUrl("api/cases/analyze");

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_text: caseText })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "解析に失敗しました");
    }

    state.runtimeMode = "server";
    state.lastAnalysisError = "";
    return data;
  } catch {
    state.runtimeMode = "static";
    return analyzeCaseTextClient(caseText);
  }
}

async function loadDemoCaseText() {
  try {
    const response = await fetch(resolveAppUrl("api/demo-case"));
    if (!response.ok) {
      throw new Error("demo api unavailable");
    }

    const data = await response.json();
    state.runtimeMode = "server";
    return data.case_text;
  } catch {
    state.runtimeMode = "static";
    const response = await fetch(resolveAppUrl("demo-case.txt"));
    return response.text();
  }
}

function resolveAppUrl(path) {
  return new URL(path, window.location.href).toString();
}

function renderMarkdown(value) {
  const escaped = escapeHtml(value || "");
  const blocks = escaped.split(/\n\s*\n/).filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      if (!lines.length) {
        return "";
      }

      if (lines.every((line) => /^- /.test(line))) {
        return `<ul>${lines
          .map((line) => `<li>${formatInlineMarkdown(line.replace(/^- /, ""))}</li>`)
          .join("")}</ul>`;
      }

      return lines
        .map((line) => {
          if (/^### /.test(line)) {
            return `<h5>${formatInlineMarkdown(line.replace(/^### /, ""))}</h5>`;
          }

          if (/^## /.test(line)) {
            return `<h4>${formatInlineMarkdown(line.replace(/^## /, ""))}</h4>`;
          }

          if (/^# /.test(line)) {
            return `<h3>${formatInlineMarkdown(line.replace(/^# /, ""))}</h3>`;
          }

          if (/^- /.test(line)) {
            return `<ul><li>${formatInlineMarkdown(line.replace(/^- /, ""))}</li></ul>`;
          }

          return `<p>${formatInlineMarkdown(line)}</p>`;
        })
        .join("");
    })
    .join("");
}

function formatInlineMarkdown(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
