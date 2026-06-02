'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getSpeechLangVariants,
  pickSpeechVoice,
  resolveSpeechUtteranceLang,
  waitForSpeechVoices,
} from '@/lib/speech/pick-speech-voice';
import { buildSpeechChunks, snapSpeechCharIndexToChunkStart } from '@/lib/speech/speech-chunks';

type SpeechStatus = 'idle' | 'playing' | 'paused';

function readSynthState(): SpeechStatus {
  if (typeof window === 'undefined' || !window.speechSynthesis) return 'idle';
  const synth = window.speechSynthesis;
  if (!synth.speaking) return 'idle';
  return synth.paused ? 'paused' : 'playing';
}

export type SpeechBoundaryEvent = {
  charIndex: number;
  charLength: number;
};

export function useDocumentSpeech(options?: {
  onBoundary?: (event: SpeechBoundaryEvent) => void;
}) {
  const onBoundaryRef = useRef(options?.onBoundary);
  onBoundaryRef.current = options?.onBoundary;

  const [status, setStatus] = useState<SpeechStatus>('idle');
  const sessionRef = useRef(0);
  const fullTextRef = useRef('');
  const langRef = useRef('vi-VN');
  const charIndexRef = useRef(0);
  const rateRef = useRef(1);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  /** true trong khoảng cancel → speak lại (đổi tốc độ / ngôn ngữ) */
  const restartingRef = useRef(false);
  /** true sau khi user bấm Dừng — chặn poll gán lại playing */
  const stoppedRef = useRef(false);
  const statusRef = useRef<SpeechStatus>('idle');

  const supported =
    typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';

  const setStatusSafe = useCallback((next: SpeechStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const syncFromSynth = useCallback(() => {
    if (!supported || restartingRef.current) return;
    const synth = window.speechSynthesis;

    if (stoppedRef.current) {
      if (synth.speaking) synth.cancel();
      else stoppedRef.current = false;
      setStatusSafe('idle');
      return;
    }

    const synthState = readSynthState();
    if (synthState === 'idle') {
      if (statusRef.current !== 'idle') {
        const hasProgress =
          fullTextRef.current.length > 0 &&
          charIndexRef.current > 0 &&
          charIndexRef.current < fullTextRef.current.length;
        if (!hasProgress) setStatusSafe('idle');
      }
      return;
    }
    setStatusSafe(synthState);
  }, [setStatusSafe, supported]);

  useEffect(() => {
    if (!supported) return;

    const syncVoices = () => {
      const loaded = window.speechSynthesis.getVoices();
      if (loaded.length > 0) voicesRef.current = loaded;
    };

    syncVoices();
    void waitForSpeechVoices().then((loaded) => {
      if (loaded.length > 0) voicesRef.current = loaded;
    });

    window.speechSynthesis.addEventListener('voiceschanged', syncVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', syncVoices);
  }, [supported]);

  /** Đồng bộ UI khi trình duyệt lệch trạng thái (Chrome sau cancel/restart). */
  useEffect(() => {
    if (!supported) return;
    const id = window.setInterval(syncFromSynth, 200);
    return () => window.clearInterval(id);
  }, [supported, syncFromSynth]);

  const speakFromOffset = useCallback(
    (text: string, lang: string, rate: number, fromChar: number) => {
      if (!supported || !text.trim()) return;

      fullTextRef.current = text;
      langRef.current = lang;
      rateRef.current = rate;
      const offset = Math.max(0, Math.min(fromChar, text.length));
      charIndexRef.current = offset;
      const slice = text.slice(offset);
      if (!slice.trim()) {
        setStatusSafe('idle');
        charIndexRef.current = text.length;
        return;
      }

      const session = ++sessionRef.current;
      stoppedRef.current = false;
      restartingRef.current = true;
      window.speechSynthesis.cancel();

      window.setTimeout(() => {
        void (async () => {
          if (session !== sessionRef.current) {
            restartingRef.current = false;
            return;
          }

          const voices =
            voicesRef.current.length > 0
              ? voicesRef.current
              : await waitForSpeechVoices();
          if (voices.length > 0) voicesRef.current = voices;

          if (session !== sessionRef.current) {
            restartingRef.current = false;
            return;
          }

          const langVariants = getSpeechLangVariants(lang);
          const utteranceLang = resolveSpeechUtteranceLang(voices, langVariants);
          const resolveVoice = () => pickSpeechVoice(voices, langVariants);
          const chunks = buildSpeechChunks(text, offset);
          let chunkIdx = 0;

          const notifyChunk = (charStart: number, charEnd: number) => {
            charIndexRef.current = charStart;
            onBoundaryRef.current?.({
              charIndex: charStart,
              charLength: Math.max(1, charEnd - charStart),
            });
          };

          const speakNextChunk = () => {
            if (session !== sessionRef.current) {
              restartingRef.current = false;
              return;
            }
            if (chunkIdx >= chunks.length) {
              restartingRef.current = false;
              charIndexRef.current = text.length;
              setStatusSafe('idle');
              return;
            }

            const chunk = chunks[chunkIdx];
            chunkIdx += 1;

            const utterance = new SpeechSynthesisUtterance(chunk.text);
            utterance.lang = utteranceLang;
            utterance.rate = Math.min(2, Math.max(0.5, rate));
            const voice = resolveVoice();
            if (voice) utterance.voice = voice;

            utterance.onstart = () => {
              if (session !== sessionRef.current) return;
              restartingRef.current = false;
              setStatusSafe('playing');
              notifyChunk(chunk.charStart, chunk.charEnd);
            };
            utterance.onend = () => {
              if (session !== sessionRef.current) return;
              charIndexRef.current = chunk.charEnd;
              speakNextChunk();
            };
            utterance.onerror = (event) => {
              if (session !== sessionRef.current) return;
              if (event.error === 'interrupted' || event.error === 'canceled') return;
              restartingRef.current = false;
              setStatusSafe('idle');
            };

            window.speechSynthesis.speak(utterance);
          };

          speakNextChunk();

          window.setTimeout(() => {
            if (session !== sessionRef.current) return;
            restartingRef.current = false;
            syncFromSynth();
          }, 400);
        })();
      }, 160);
    },
    [setStatusSafe, supported, syncFromSynth],
  );

  const speakFresh = useCallback(
    (text: string, lang: string, rate: number) => {
      charIndexRef.current = 0;
      speakFromOffset(text, lang, rate, 0);
    },
    [speakFromOffset],
  );

  const continueAtRate = useCallback(
    (rate: number, text?: string, lang?: string) => {
      if (text) {
        fullTextRef.current = text;
        if (lang) langRef.current = lang;
      }
      if (!fullTextRef.current) return;
      rateRef.current = rate;
      const snapped = snapSpeechCharIndexToChunkStart(
        fullTextRef.current,
        charIndexRef.current,
      );
      charIndexRef.current = snapped;
      speakFromOffset(fullTextRef.current, langRef.current, rate, snapped);
    },
    [speakFromOffset],
  );

  const stop = useCallback(() => {
    if (!supported) return;
    sessionRef.current += 1;
    restartingRef.current = false;
    stoppedRef.current = true;
    window.speechSynthesis.cancel();
    charIndexRef.current = 0;
    setStatusSafe('idle');
    onBoundaryRef.current?.({ charIndex: 0, charLength: 0 });
  }, [setStatusSafe, supported]);

  const pause = useCallback(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (synth.speaking && !synth.paused) {
      synth.pause();
      setStatusSafe('paused');
    }
  }, [setStatusSafe, supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (synth.paused) {
      synth.resume();
      setStatusSafe('playing');
      return;
    }
    if (
      !synth.speaking &&
      fullTextRef.current &&
      charIndexRef.current < fullTextRef.current.length
    ) {
      speakFromOffset(
        fullTextRef.current,
        langRef.current,
        rateRef.current,
        charIndexRef.current,
      );
    }
  }, [setStatusSafe, speakFromOffset, supported]);

  const isSynthSpeaking = useCallback(() => {
    if (!supported) return false;
    return window.speechSynthesis.speaking;
  }, [supported]);

  useEffect(() => () => stop(), [stop]);

  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isActive = status !== 'idle';

  return {
    supported,
    status,
    isPlaying,
    isPaused,
    isActive,
    isSynthSpeaking,
    speakFresh,
    continueAtRate,
    pause,
    resume,
    stop,
  };
};
