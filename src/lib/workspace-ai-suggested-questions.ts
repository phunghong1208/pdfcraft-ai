/** Parse câu hỏi từ phản hồi /chat (JSON array hoặc danh sách). */
export function parseSuggestedQuestionsFromResponse(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const jsonSlice = trimmed.match(/\[[\s\S]*\]/);
  if (jsonSlice) {
    try {
      const parsed = JSON.parse(jsonSlice[0]) as unknown;
      if (Array.isArray(parsed)) {
        return normalizeSuggestedQuestions(parsed.map(String));
      }
    } catch {
      // fall through
    }
  }

  const lines = trimmed
    .split('\n')
    .map((line) =>
      line
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/, '')
        .replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '')
        .replace(/^["']|["']$/g, '')
        .trim(),
    )
    .filter(Boolean);

  return normalizeSuggestedQuestions(lines);
}

function normalizeSuggestedQuestions(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    let q = item.replace(/\s+/g, ' ').trim();
    if (q.startsWith('- ')) q = q.slice(2).trim();
    if (q.length < 8 || q.length > 120) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!q.endsWith('?') && !q.endsWith('？')) q = `${q}?`;
    out.push(q);
    if (out.length >= 3) break;
  }

  return out;
}

/** Prompt ngắn — ngữ cảnh lấy từ kho vector qua document_id, không gửi tóm tắt. */
export function buildSuggestedQuestionsPrompt(language: string): string {
  return [
    'Based on the indexed PDF content for this document, list the 3 most important questions a reader should ask to understand it better.',
    `Write all questions in ${language}.`,
    'Each question must be specific to this document (not generic), concise (under 90 characters), and end with ?',
    'Reply with ONLY a JSON array of exactly 3 strings. No markdown, no explanation.',
    'Example: ["What is the exam structure?", "How many points is Part I worth?", "What topics appear in Part II?"]',
  ].join('\n');
}

export function suggestedQuestionsCacheKey(documentId: number, language: string): string {
  return `${documentId}:${language}`;
}

const memorySuggestedQuestions = new Map<string, string[]>();

export function peekSuggestedQuestions(cacheKey: string): string[] | null {
  const cached = memorySuggestedQuestions.get(cacheKey);
  return cached?.length ? cached : null;
}

export function rememberSuggestedQuestions(cacheKey: string, questions: string[]): void {
  if (questions.length > 0) {
    memorySuggestedQuestions.set(cacheKey, questions);
  }
}
