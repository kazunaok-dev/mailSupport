import OpenAI from "openai";

const defaultModel = process.env.OPENAI_MODEL || "gpt-5.4";

export function isAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function analyzeCaseWithAI(messages, options = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = options.model || defaultModel;
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "あなたは製品サポート窓口向けのケースアナリストです。まず顧客の質問を漏れなく台帳化し、その質問に後続のサポートメールだけを対応付けてください。メール本文にない回答を推測してはいけません。同じキーワードだけでは回答済みにせず、条件不足は未回答または部分回答にしてください。確認中、開発元確認中、後ほど回答は確定回答ではありません。各論点には元メールIDと回答原文を含め、statusは answered / partially_answered / unanswered / pending / resolved のいずれかにしてください。narrative_summary と handoff_summary は Markdown 形式で返してください。"
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              messages.map((message) => ({
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
                    enum: ["answered", "partially_answered", "unanswered", "pending", "resolved", "open", "answered_pending", "on_hold"]
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
  });

  const content = response.output_text;
  const parsed = JSON.parse(content);
  return normalizeAIResult(parsed, messages);
}

function normalizeAIResult(parsed, messages) {
  const messageIds = new Set(messages.map((message) => message.id));
  const normalizedIssues = parsed.issues.map((issue, index) => ({
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

  return {
    narrative_summary: parsed.narrative_summary,
    handoff_summary: parsed.handoff_summary,
    recommended_next_step: parsed.recommended_next_step,
    issues: normalizedIssues
  };
}
