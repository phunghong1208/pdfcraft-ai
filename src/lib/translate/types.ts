export type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
};

export type TranslateTextRequest = {
  sourceLang: string;
  targetLang: string;
  model?: string;
  text?: string;
  segments?: string[];
};

export type TranslateTextResponse = {
  translated_text?: string;
  translations?: string[];
  token_usage?: TokenUsage;
};
