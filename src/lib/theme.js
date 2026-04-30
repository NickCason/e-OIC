// theme.js — manage light/dark/auto theme as data-theme attribute on <html>.

import { getSetting, setSetting } from '../db.js';

const KEY = 'theme';
//   'auto' | 'light' | 'dark'

export async function loadInitialTheme() {
  const saved = (await getSetting(KEY)) || 'auto';
  applyTheme(saved);
  if (saved === 'auto') {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', () => applyTheme('auto'));
  }
  return saved;
}

export function applyTheme(theme) {
  const effective = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;
  document.documentElement.setAttribute('data-theme', effective);
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', effective === 'light' ? '#F8F7F2' : '#06182F'
  );
}

export async function saveTheme(theme) {
  await setSetting(KEY, theme);
  applyTheme(theme);
}
