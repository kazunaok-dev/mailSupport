const STATUS = {
  OPEN: "open",
  ANSWERED_PENDING: "answered_pending",
  RESOLVED: "resolved",
  ON_HOLD: "on_hold"
};

const MISUNDERSTANDING = {
  NONE: "none",
  SUSPECTED: "suspected"
};

const CUSTOMER_MARKERS = [/customer/i, /お客様/, /顧客/];
const SUPPORT_MARKERS = [/support/i, /サポート/, /担当/];
const QUESTION_SPLIT = /(?<=[。！？?\n])\s*/u;
const QUESTION_HINTS = ["?", "？", "でしょうか", "教えて", "確認", "原因", "どれくらい", "未対応", "可能ですか"];
const RESOLVED_HINTS = [/解決/i, /直りました/, /ありがとうございました/, /問題ありません/];
const ON_HOLD_HINTS = [/確認中/, /継続調査/, /保留/, /確認できるまで/];

export function analyzeCaseTextClient(caseText, caseId = createCaseId()) {
  const messages = parseMessages(caseText);
  const issues = linkIssuesWithRules(messages);

  return {
    case_id: caseId,
    analysis_mode: "static_fallback",
    ai_enabled: false,
    case_summary: buildFallbackSummary(messages, issues),
    messages,
    issues
  };
}

function parseMessages(caseText) {
  const normalized = caseText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks = normalized
    .split(/\n(?=From: )/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length === 1 && !chunks[0].startsWith("From: ")) {
    return [buildMessage("msg-1", chunks[0], 0)];
  }

  return chunks.map((chunk, index) => buildMessage(`msg-${index + 1}`, chunk, index));
}

function buildMessage(id, chunk, index) {
  const lines = chunk.split("\n");
  const from = readHeader(lines, "From");
  const date = readHeader(lines, "Date");
  const bodyStart = lines.findIndex((line) => line.trim() === "");
  const rawBody = bodyStart >= 0 ? lines.slice(bodyStart + 1).join("\n").trim() : lines.join("\n").trim();
  const { body, quotes, signature } = splitBodySections(rawBody);

  return {
    id,
    order: index,
    speaker: inferSpeaker(from, body),
    from,
    date,
    body,
    quotes,
    signature,
    raw_text: chunk
  };
}

function readHeader(lines, name) {
  const prefix = `${name}:`;
  const line = lines.find((item) => item.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

function splitBodySections(rawBody) {
  const lines = rawBody.split("\n");
  const bodyLines = [];
  const quoteLines = [];
  const signatureLines = [];
  let inSignature = false;

  for (const line of lines) {
    if (line.trim() === "---" || line.trim() === "--") {
      inSignature = true;
      signatureLines.push(line);
      continue;
    }

    if (line.trim().startsWith(">") || /^[0-9]{4}-[0-9]{2}-[0-9]{2} .*:$/u.test(line.trim())) {
      quoteLines.push(line);
      continue;
    }

    if (inSignature) {
      signatureLines.push(line);
      continue;
    }

    bodyLines.push(line);
  }

  return {
    body: bodyLines.join("\n").trim(),
    quotes: quoteLines.join("\n").trim(),
    signature: signatureLines.join("\n").trim()
  };
}

function inferSpeaker(from, body) {
  if (CUSTOMER_MARKERS.some((pattern) => pattern.test(from) || pattern.test(body))) {
    return "customer";
  }

  if (SUPPORT_MARKERS.some((pattern) => pattern.test(from) || pattern.test(body))) {
    return "support";
  }

  return "unknown";
}

function linkIssuesWithRules(messages) {
  const issues = [];

  for (const message of messages) {
    if (message.speaker === "customer") {
      const extracted = extractCustomerIssues(message, issues.length);
      issues.push(...extracted);
      continue;
    }

    if (message.speaker === "support") {
      attachSupportAnswers(message, issues);
    }
  }

  for (const issue of issues) {
    issue.status = determineStatus(issue);
    issue.misunderstanding_flag = issue.possible_misunderstandings.length
      ? MISUNDERSTANDING.SUSPECTED
      : MISUNDERSTANDING.NONE;
    issue.next_actions = buildConfirmationItems(issue);
    issue.answer_summary = summarizeSupportAnswers(issue) || "まだ回答がありません。";
    issue.unanswered_points = buildPendingPoints(issue);
    issue.confirmation_items = issue.next_actions;
    issue.draft_reply = [
      `${issue.customer_question} についてご案内します。`,
      issue.answer_summary ? `現時点の確認結果: ${issue.answer_summary}` : "現時点では追加確認が必要です。",
      issue.unanswered_points.length
        ? `未解決の点: ${issue.unanswered_points.join(" / ")}`
        : "現時点で未解決の点は見当たりません。",
      issue.confirmation_items.length
        ? `ご提供いただきたい情報: ${issue.confirmation_items.join(" / ")}`
        : "追加でご提供いただきたい情報はありません。"
    ].join("\n");
  }

  return issues;
}

function extractCustomerIssues(message, issueOffset) {
  const segments = message.body
    .split(QUESTION_SPLIT)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const issues = [];
  let firstIssueId = null;

  for (const segment of segments) {
    const hasQuestionShape = QUESTION_HINTS.some((hint) => segment.includes(hint));
    const hasMisunderstandingShape = /(不要|使わない|未対応|できない|原因)/u.test(segment);
    if (!hasQuestionShape && !hasMisunderstandingShape) {
      continue;
    }

    const parentIssueId = issues.length > 0 ? firstIssueId : detectParentIssue(segment, issues);
    const issueId = `issue-${issueOffset + issues.length + 1}`;
    const mismatch = extractMisunderstanding(segment, message.id);
    const issue = {
      id: issueId,
      display_title: segment,
      summary: segment,
      parent_issue_id: parentIssueId,
      customer_question: segment,
      status: STATUS.OPEN,
      support_answers: [],
      related_message_ids: [message.id],
      possible_misunderstandings: mismatch ? [mismatch] : [],
      knowledge_refs: [],
      misunderstanding_flag: mismatch ? MISUNDERSTANDING.SUSPECTED : MISUNDERSTANDING.NONE,
      next_actions: [],
      answer_summary: "",
      unanswered_points: ["サポートからの回答がまだありません。"],
      confirmation_items: [],
      draft_reply: ""
    };

    if (!firstIssueId) {
      firstIssueId = issueId;
      issue.parent_issue_id = null;
    }

    issues.push(issue);
  }

  return issues;
}

function detectParentIssue(segment, currentIssues) {
  if (!currentIssues.length) {
    return null;
  }

  if (/別件|追加で|また/u.test(segment)) {
    return currentIssues[0]?.id ?? null;
  }

  return currentIssues[currentIssues.length - 1]?.id ?? null;
}

function extractMisunderstanding(segment, messageId) {
  if (!/(不要|未対応|ライセンス切れ|できない|使えない)/u.test(segment)) {
    return null;
  }

  return {
    message_id: messageId,
    statement: segment,
    reason: "顧客の前提や断定表現に、確認が必要な内容が含まれています。"
  };
}

function attachSupportAnswers(message, issues) {
  const sentences = message.body
    .split(QUESTION_SPLIT)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (const issue of issues) {
    const relevant = sentences.filter((sentence) => isRelevantAnswer(issue, sentence));
    if (!relevant.length) {
      continue;
    }

    issue.support_answers.push({
      message_id: message.id,
      type: relevant.length > 1 ? "supplemental" : "direct",
      text: relevant.join(" ")
    });
    issue.related_message_ids.push(message.id);

    for (const answer of relevant) {
      const correction = detectCorrection(issue, answer, message.id);
      if (correction) {
        issue.possible_misunderstandings.push(correction);
      }
    }
  }
}

function isRelevantAnswer(issue, sentence) {
  const keywords = collectKeywords(issue.customer_question);
  return keywords.some((keyword) => sentence.includes(keyword));
}

function collectKeywords(text) {
  const directTerms = text.match(/[A-Za-z]+-\d+|ポート\d+|[A-Za-z0-9_/-]{2,}|[一-龠ァ-ヶ]{2,}/gu) ?? [];
  return [...new Set(directTerms.filter((token) => token.length > 1))];
}

function detectCorrection(issue, answer, messageId) {
  const question = issue.customer_question;
  if (/ライセンス切れ/u.test(question) && /ではありません/u.test(answer)) {
    return {
      message_id: messageId,
      statement: question,
      reason: "サポート回答で顧客の想定が否定されています。"
    };
  }

  if (/不要/u.test(question) && /利用する|必要/u.test(answer)) {
    return {
      message_id: messageId,
      statement: question,
      reason: "顧客の認識とサポート回答が矛盾しています。"
    };
  }

  if (/未対応/u.test(question) && /対応しています/u.test(answer)) {
    return {
      message_id: messageId,
      statement: question,
      reason: "未対応という認識に対して、サポート回答で対応済みと示されています。"
    };
  }

  return null;
}

function determineStatus(issue) {
  const allAnswerText = issue.support_answers.map((answer) => answer.text).join("\n");

  if (!issue.support_answers.length) {
    return STATUS.OPEN;
  }

  if (RESOLVED_HINTS.some((pattern) => pattern.test(allAnswerText))) {
    return STATUS.RESOLVED;
  }

  if (ON_HOLD_HINTS.some((pattern) => pattern.test(allAnswerText))) {
    return STATUS.ON_HOLD;
  }

  return STATUS.ANSWERED_PENDING;
}

function summarizeSupportAnswers(issue) {
  return issue.support_answers.map((answer) => answer.text).join(" / ");
}

function buildPendingPoints(issue) {
  if (issue.status === STATUS.OPEN) {
    return ["サポートからの回答がまだありません。"];
  }

  if (issue.status === STATUS.ON_HOLD) {
    return ["追加確認待ちのため保留中です。"];
  }

  if (issue.status === STATUS.ANSWERED_PENDING) {
    return ["回答はあるものの、顧客側の確認または追加案内が必要です。"];
  }

  return [];
}

function buildConfirmationItems(issue) {
  const items = [];

  if (/エラー|コード|起動/u.test(issue.customer_question)) {
    items.push("再現手順", "エラーログ", "設定ファイルの有無");
  }

  if (/同期|一覧/u.test(issue.customer_question)) {
    items.push("通信結果", "同期開始時刻");
  }

  if (/CSV|文字化け|取込/u.test(issue.customer_question)) {
    items.push("CSVサンプル", "文字コード", "列定義");
  }

  return [...new Set(items)];
}

function buildFallbackSummary(messages, issues) {
  return {
    message_count: messages.length,
    issue_count: issues.length,
    open_issue_count: issues.filter((issue) => issue.status === STATUS.OPEN).length,
    answered_pending_count: issues.filter((issue) => issue.status === STATUS.ANSWERED_PENDING).length,
    on_hold_count: issues.filter((issue) => issue.status === STATUS.ON_HOLD).length,
    misunderstanding_count: issues.filter((issue) => issue.misunderstanding_flag !== MISUNDERSTANDING.NONE).length,
    latest_customer_message_id: [...messages].reverse().find((message) => message.speaker === "customer")?.id ?? null,
    narrative_summary: `## GitHub Pages モード\n- これは静的公開向けのブラウザ内解析です。\n- AI 解析は使わず、端末内で質問と回答を整理しています。`,
    handoff_summary: "## 引継ぎメモ\n- 未解決の質問と関連メールを確認してください。\n- GitHub Pages 版ではサーバー側シークレットを使いません。",
    recommended_next_step: "## 次の一手\n- まず未回答または保留の質問を確認してください。"
  };
}

function createCaseId() {
  return `case-${Math.random().toString(36).slice(2, 10)}`;
}
