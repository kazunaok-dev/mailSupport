import { analyzeCaseTextClient } from "./browserAnalysis.js";

const DEFAULT_MODEL = "gpt-5.4";

export async function analyzeCaseWithBrowserAI(caseText, options = {}) {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error("OpenAI APIキーを入力してください。");
  }

  const base = analyzeCaseTextClient(caseText);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: options.model || DEFAULT_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "あなたは製品サポート窓口向けのケースアナリストです。顧客とサポートの往復メールを読み、担当者が短時間で状況を理解できるように論点を整理してください。質問の抜け漏れを避け、要約文は自然で実務向けの日本語にしてください。narrative_summary と handoff_summary は Markdown 形式で、短い見出しと箇条書きを使って読みやすく整形してください。recommended_next_step も 1〜3 行の簡潔な Markdown で返してください。各論点には、表示用タイトル、質問の要約、回答要約、未解決点、顧客に追加確認したい点、誤認候補、関連メールIDを含めてください。推測で断定せず、本文に根拠がある内容だけを返してください。"
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(
                base.messages.map((message) => ({
                  id: message.id,
                  speaker: message.speaker,
                  from: message.from,
                  date: message.date,
                  body: message.body,
                  quotes: message.quotes
                })),
                null,
                2
              )
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "support_case_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              narrative_summary: { type: "string" },
              handoff_summary: { type: "string" },
              recommended_next_step: { type: "string" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    display_title: { type: "string" },
                    summary: { type: "string" },
                    parent_issue_id: { type: ["string", "null"] },
                    customer_question: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["open", "answered_pending", "resolved", "on_hold"]
                    },
                    answer_summary: { type: "string" },
                    unanswered_points: {
                      type: "array",
                      items: { type: "string" }
                    },
                    confirmation_items: {
                      type: "array",
                      items: { type: "string" }
                    },
                    draft_reply: { type: "string" },
                    support_answers: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          message_id: { type: "string" },
                          type: {
                            type: "string",
                            enum: ["direct", "supplemental"]
                          },
                          text: { type: "string" }
                        },
                        required: ["message_id", "type", "text"]
                      }
                    },
                    related_message_ids: {
                      type: "array",
                      items: { type: "string" }
                    },
                    possible_misunderstandings: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          message_id: { type: "string" },
                          statement: { type: "string" },
                          reason: { type: "string" }
                        },
                        required: ["message_id", "statement", "reason"]
                      }
                    },
                    misunderstanding_flag: {
                      type: "string",
                      enum: ["none", "suspected", "confirmed"]
                    },
                    knowledge_refs: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: [
                    "id",
                    "display_title",
                    "summary",
                    "parent_issue_id",
                    "customer_question",
                    "status",
                    "answer_summary",
                    "unanswered_points",
                    "confirmation_items",
                    "draft_reply",
                    "support_answers",
                    "related_message_ids",
                    "possible_misunderstandings",
                    "misunderstanding_flag",
                    "knowledge_refs"
                  ]
                }
              }
            },
            required: ["narrative_summary", "handoff_summary", "recommended_next_step", "issues"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const responseText = extractResponseText(payload);
  const parsed = JSON.parse(responseText);
  const issues = normalizeIssues(parsed.issues, base.messages);

  return {
    case_id: base.case_id,
    analysis_mode: "ai_browser",
    ai_enabled: true,
    case_summary: buildSummary(base.messages, issues, parsed),
    messages: base.messages,
    issues
  };
}

export function getDefaultBrowserModel() {
  return DEFAULT_MODEL;
}

function normalizeIssues(issues, messages) {
  const messageIds = new Set(messages.map((message) => message.id));
  return issues.map((issue, index) => ({
    id: issue.id || `issue-${index + 1}`,
    display_title: issue.display_title,
    summary: issue.summary,
    parent_issue_id: issue.parent_issue_id,
    customer_question: issue.customer_question,
    status: issue.status,
    answer_summary: issue.answer_summary,
    unanswered_points: issue.unanswered_points,
    confirmation_items: issue.confirmation_items,
    draft_reply: issue.draft_reply,
    support_answers: issue.support_answers.filter((answer) => messageIds.has(answer.message_id)),
    related_message_ids: issue.related_message_ids.filter((id) => messageIds.has(id)),
    possible_misunderstandings: issue.possible_misunderstandings.filter((item) =>
      messageIds.has(item.message_id)
    ),
    misunderstanding_flag: issue.misunderstanding_flag,
    knowledge_refs: issue.knowledge_refs,
    next_actions: issue.confirmation_items
  }));
}

function buildSummary(messages, issues, parsed) {
  return {
    message_count: messages.length,
    issue_count: issues.length,
    open_issue_count: issues.filter((issue) => issue.status === "open").length,
    answered_pending_count: issues.filter((issue) => issue.status === "answered_pending").length,
    on_hold_count: issues.filter((issue) => issue.status === "on_hold").length,
    misunderstanding_count: issues.filter((issue) => issue.misunderstanding_flag !== "none").length,
    latest_customer_message_id: [...messages].reverse().find((message) => message.speaker === "customer")?.id ?? null,
    narrative_summary: parsed.narrative_summary,
    handoff_summary: parsed.handoff_summary,
    recommended_next_step: parsed.recommended_next_step
  };
}

function extractResponseText(payload) {
  const message = payload.output?.find((item) => item.type === "message" && item.role === "assistant");
  const outputText = message?.content
    ?.filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");

  if (!outputText) {
    throw new Error("OpenAI response did not contain output text.");
  }

  return outputText;
}
