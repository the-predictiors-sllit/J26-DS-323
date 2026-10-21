import { createElement, type CSSProperties } from 'react';
import { createHighlighter, bundledLanguages, type BundledLanguage } from 'shiki';

const instance = createHighlighter({ themes: ['github-light', 'github-dark'], langs: [] });

export async function loadHighlighter(language: string) {
  const highlighter = await instance;
  const lang = Object.prototype.hasOwnProperty.call(bundledLanguages, language)
    ? language as BundledLanguage : 'text';
  if (lang !== 'text') await highlighter.loadLanguage(lang);
  return {
    // Keep the previous source as state so multiline grammars remain correct.
    // Suitable for short UI snippets; re-tokenizes the accumulated prefix.
    highlight(code: string, previous = '') {
      const full = previous + code;
      const skip = previous ? previous.split('\n').length - 1 : 0;
      const { tokens } = highlighter.codeToTokens(full, {
        lang, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false,
      });
      const lines = tokens.slice(skip).map((line, lineIndex) => createElement(
        'span', { key: lineIndex },
        ...line.map((token, index) => createElement('span', {
          key: index,
          className: 'text-[var(--shiki-light)] dark:text-[var(--shiki-dark)]',
          style: token.htmlStyle as CSSProperties,
        }, token.content)),
      ));
      return { lines, state: full + '\n' };
    },
  };
}
