/** Gom segment ngắn (ô bảng, nhãn) vào ít request GPT hơn. */
export const DEFAULT_MAX_SEGMENTS_PER_BATCH = Number(
  process.env.TRANSLATE_BATCH_SIZE || '16',
);
export const DEFAULT_MAX_CHARS_PER_BATCH = Number(
  process.env.TRANSLATE_BATCH_MAX_CHARS || '4000',
);

export type SegmentBatch = {
  offset: number;
  segments: string[];
};

export function buildSegmentBatches(
  segments: string[],
  maxSegments = DEFAULT_MAX_SEGMENTS_PER_BATCH,
  maxChars = DEFAULT_MAX_CHARS_PER_BATCH,
): SegmentBatch[] {
  const batches: SegmentBatch[] = [];
  let current: string[] = [];
  let charCount = 0;
  let offset = 0;

  const flush = () => {
    if (!current.length) return;
    batches.push({ offset, segments: current });
    offset += current.length;
    current = [];
    charCount = 0;
  };

  for (const segment of segments) {
    const est = segment.length + 6;
    const overCount = current.length >= maxSegments;
    const overChars = charCount + est > maxChars && current.length > 0;

    if (overCount || overChars) flush();

    current.push(segment);
    charCount += est;
  }

  flush();
  return batches;
}

const DEFAULT_CONCURRENCY = Number(process.env.TRANSLATE_BATCH_CONCURRENCY || '3');

/** Chạy nhiều batch song song (giới hạn concurrency để tránh rate limit). */
export async function runSegmentBatches<T>(
  batches: SegmentBatch[],
  worker: (batch: SegmentBatch, index: number) => Promise<T>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<T[]> {
  if (!batches.length) return [];

  const results: T[] = new Array(batches.length);
  let next = 0;
  const limit = Math.max(1, Math.min(concurrency, batches.length));

  async function runWorker() {
    while (next < batches.length) {
      const index = next;
      next += 1;
      results[index] = await worker(batches[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}
