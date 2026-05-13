import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safe, shareSafeFilename } from './paths';

test('safe() strips Windows-reserved chars', () => {
    assert.equal(safe('A/B:C*D?E"F<G>H|I\\J'), 'A_B_C_D_E_F_G_H_I_J');
    assert.equal(safe(''), 'unnamed');
    assert.equal(safe(null), 'unnamed');
});

test('shareSafeFilename strips em-dash (Android share blocker)', () => {
    assert.equal(shareSafeFilename('Sample — Cooker Line.zip'), 'Sample - Cooker Line.zip');
});

test('shareSafeFilename strips en-dash and smart quotes', () => {
    assert.equal(shareSafeFilename('Plant 6 – E’s "Cookers".zip'), "Plant 6 - E's _Cookers_.zip");
});

test('shareSafeFilename strips diacritics via NFKD', () => {
    assert.equal(shareSafeFilename('Café Münchën.zip'), 'Cafe Munchen.zip');
});

test('shareSafeFilename keeps ASCII letters/numbers/spaces/dots/hyphens', () => {
    assert.equal(shareSafeFilename('Job 2026-05-01 v3.zip'), 'Job 2026-05-01 v3.zip');
});

test('shareSafeFilename empty/null falls back to "unnamed"', () => {
    assert.equal(shareSafeFilename(''), 'unnamed');
    assert.equal(shareSafeFilename(null), 'unnamed');
    assert.equal(shareSafeFilename('   '), 'unnamed');
});

test('shareSafeFilename strips emoji and other BMP non-ASCII', () => {
    assert.equal(shareSafeFilename('Test 🚀 Run.zip'), 'Test Run.zip');
});
