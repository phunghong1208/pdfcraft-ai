'use client';

import { useMemo } from 'react';
import { WorkspaceAiLanguageSelect } from '@/components/workspace/WorkspaceAiLanguageSelect';
import { TRANSLATE_LANGUAGE_OPTIONS } from '@/services/translateDocsApi';

export interface TranslateTargetLanguageSelectProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  label: string;
  variant?: 'light' | 'dark';
}

export function TranslateTargetLanguageSelect({
  value,
  onChange,
  disabled,
  label,
  variant = 'light',
}: TranslateTargetLanguageSelectProps) {
  const items = useMemo(
    () => TRANSLATE_LANGUAGE_OPTIONS.map((l) => ({ apiName: l.code, nativeName: l.nativeName })),
    [],
  );

  return (
    <WorkspaceAiLanguageSelect
      appearance="pill"
      variant={variant}
      label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
      items={items}
    />
  );
}
