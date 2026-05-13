// theme.ts — manage light/dark/auto theme as data-theme attribute on <html>.

import { getSetting, setSetting } from '../db';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

const KEY = 'theme';

function isThemeMode(v: unknown): v is ThemeMode {
    return v === 'auto' || v === 'light' || v === 'dark';
}

export function applyTheme(theme: ThemeMode): void {
    const effective: EffectiveTheme = theme === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : theme;
    document.documentElement.setAttribute('data-theme', effective);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        effective === 'light' ? '#F8F7F2' : '#06182F',
    );
}

export async function loadInitialTheme(): Promise<ThemeMode> {
    const stored = await getSetting<ThemeMode>(KEY);
    const saved: ThemeMode = isThemeMode(stored) ? stored : 'auto';
    applyTheme(saved);
    if (saved === 'auto') {
        const mq = window.matchMedia('(prefers-color-scheme: light)');
        mq.addEventListener('change', () => applyTheme('auto'));
    }
    return saved;
}

export async function saveTheme(theme: ThemeMode): Promise<void> {
    await setSetting(KEY, theme);
    applyTheme(theme);
}
