export type SpeechChunk = {
  text: string;
  charStart: number;
  charEnd: number;
};

const MAX_LINE_CHARS = 220;

function pushChunk(chunks: SpeechChunk[], text: string, charStart: number) {
  if (!text.trim()) return;
  chunks.push({
    text,
    charStart,
    charEnd: charStart + text.length,
  });
}

function splitLongLine(line: string, lineStart: number, chunks: SpeechChunk[]) {
  if (line.length <= MAX_LINE_CHARS) {
    pushChunk(chunks, line, lineStart);
    return;
  }
  const sentenceRe = /[^\n.!?;]+[\n.!?;]+|[^\n.!?;]+$/g;
  let match: RegExpExecArray | null;
  while ((match = sentenceRe.exec(line)) !== null) {
    const sentence = match[0];
    if (!sentence.trim()) continue;
    pushChunk(chunks, sentence, lineStart + match.index);
  }
}

/** Chia theo dòng PDF — tránh regex `[^\n]*\n?` gây vòng lặp vô hạn ở cuối chuỗi. */
export function buildSpeechChunks(fullText: string, fromChar = 0): SpeechChunk[] {
  const slice = fullText.slice(fromChar);
  if (!slice.trim()) return [];

  const chunks: SpeechChunk[] = [];
  const lines = slice.split('\n');
  let cursor = fromChar;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const suffix = i < lines.length - 1 ? '\n' : '';
    const piece = line + suffix;

    if (line.trim()) {
      splitLongLine(piece, cursor, chunks);
    }
    cursor += piece.length;
  }

  if (!chunks.length) {
    pushChunk(chunks, slice, fromChar);
  }

  return chunks;
}

/** Đưa vị trí đọc về đầu dòng/chunk — tránh resume giữa từ khi đổi giọng/tốc độ. */
export function snapSpeechCharIndexToChunkStart(fullText: string, charIndex: number): number {
  const chunks = buildSpeechChunks(fullText, 0);
  for (const chunk of chunks) {
    if (charIndex >= chunk.charStart && charIndex < chunk.charEnd) {
      return chunk.charStart;
    }
  }
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    if (charIndex >= chunks[i].charStart) return chunks[i].charStart;
  }
  return charIndex;
}
