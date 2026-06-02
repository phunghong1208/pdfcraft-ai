/** Chuẩn hóa thẻ BCP 47 (vi_VN → vi-vn). */
export function normalizeSpeechLang(tag: string): string {
  return tag.trim().replace(/_/g, '-').toLowerCase();
}

/** Các biến thể BCP 47 thử lần lượt khi chọn giọng (trình duyệt/OS khác nhau). */
const EXTRA_VARIANTS_BY_PREFIX: Record<string, string[]> = {
  vi: ['vi-VN', 'vi'],
  en: ['en-US', 'en-GB', 'en-AU', 'en'],
  ja: ['ja-JP', 'ja'],
  ko: ['ko-KR', 'ko'],
  es: ['es-ES', 'es-MX', 'es-US', 'es'],
  fr: ['fr-FR', 'fr-CA', 'fr'],
  de: ['de-DE', 'de-AT', 'de'],
  zh: ['zh-CN', 'zh-Hans', 'zh-Hans-CN', 'cmn-CN', 'zh'],
  'zh-tw': ['zh-TW', 'zh-Hant', 'zh-Hant-TW', 'zh-HK', 'zh-MO'],
  pt: ['pt-BR', 'pt-PT', 'pt'],
  ar: ['ar-SA', 'ar-EG', 'ar-AE', 'ar'],
  it: ['it-IT', 'it'],
  id: ['id-ID', 'id'],
  ro: ['ro-RO', 'ro'],
};

export function getSpeechLangVariants(primary: string): string[] {
  const trimmed = primary.trim();
  if (!trimmed) return ['en-US', 'en'];

  const norm = normalizeSpeechLang(trimmed);
  const base = norm.split('-')[0];
  const extras =
    EXTRA_VARIANTS_BY_PREFIX[norm] ??
    EXTRA_VARIANTS_BY_PREFIX[base] ??
    [];

  const ordered = [trimmed, ...extras, base];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of ordered) {
    const key = normalizeSpeechLang(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function langParts(tag: string): { lang: string; script?: string; region?: string } {
  const parts = normalizeSpeechLang(tag).split('-');
  const lang = parts[0] ?? '';
  let script: string | undefined;
  let region: string | undefined;
  for (let i = 1; i < parts.length; i += 1) {
    const p = parts[i];
    if (p.length === 4) script = p;
    else if (p.length === 2 || p.length === 3) region = p;
  }
  return { lang, script, region };
}

function scoreVoice(voiceLang: string, variants: string[]): number {
  const vNorm = normalizeSpeechLang(voiceLang);
  for (let i = 0; i < variants.length; i += 1) {
    if (vNorm === normalizeSpeechLang(variants[i])) return 1000 - i;
  }

  const voice = langParts(voiceLang);
  for (let i = 0; i < variants.length; i += 1) {
    const target = langParts(variants[i]);
    if (voice.lang !== target.lang) continue;
    if (target.region && voice.region && voice.region === target.region) return 500 - i;
    if (target.script && voice.script && voice.script === target.script) return 400 - i;
    return 300 - i;
  }
  return 0;
}

/**
 * Chọn giọng phù hợp nhất. Trả về null nếu không có giọng cùng ngôn ngữ —
 * khi đó chỉ set utterance.lang, không gán voice tiếng Anh mặc định.
 */
export function pickSpeechVoice(
  voices: SpeechSynthesisVoice[],
  langVariants: string[],
): SpeechSynthesisVoice | null {
  if (!voices.length || !langVariants.length) return null;

  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;

  for (const voice of voices) {
    const s = scoreVoice(voice.lang, langVariants);
    const localBonus = voice.localService ? 2 : 0;
    const total = s + localBonus;
    if (total > bestScore) {
      bestScore = total;
      best = voice;
    }
  }

  return bestScore >= 300 ? best : null;
}

/** Ngôn ngữ utterance ưu tiên — variant đầu tiên có giọng khớp, không thì variant đầu. */
export function resolveSpeechUtteranceLang(
  voices: SpeechSynthesisVoice[],
  langVariants: string[],
): string {
  for (const variant of langVariants) {
    const voice = pickSpeechVoice(voices, [variant, ...langVariants]);
    if (voice) return variant;
  }
  return langVariants[0] ?? 'en-US';
}

/** Chờ Web Speech API load danh sách giọng (Chrome/Safari thường trả rỗng lần đầu). */
export function waitForSpeechVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve([]);
  }

  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const finish = () => {
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    };

    const onChange = () => {
      if (synth.getVoices().length > 0 || Date.now() >= deadline) finish();
    };

    synth.addEventListener('voiceschanged', onChange);

    window.setTimeout(() => {
      if (synth.getVoices().length > 0 || Date.now() >= deadline) finish();
    }, 50);

    window.setTimeout(finish, timeoutMs);
  });
}
