import { test } from 'node:test';
import assert from 'node:assert/strict';
import {isInWrapper, isAndroidWrapper, getWrapperVersion, compareWrapperVersions,} from './wrapperBridge';

type GlobalsPatch = Record<string, unknown>;

function withGlobals<T>(globals: GlobalsPatch, fn: () => T): T {
    const saved: GlobalsPatch = {};
    const g = globalThis as unknown as Record<string, unknown>;
    Object.keys(globals).forEach((k) => {
        saved[k] = g[k];
        g[k] = globals[k];
    });
    try {
        return fn();
    } finally {
        Object.keys(saved).forEach((k) => {
            if (saved[k] === undefined) delete g[k];
            else g[k] = saved[k];
        });
    }
}

test('isInWrapper: false when no Capacitor', () => {
    withGlobals({ Capacitor: undefined }, () => {
        assert.equal(isInWrapper(), false);
    });
});

test('isInWrapper: false when Capacitor lacks isNativePlatform', () => {
    withGlobals({ Capacitor: {} }, () => {
        assert.equal(isInWrapper(), false);
    });
});

test('isInWrapper: false when isNativePlatform returns false', () => {
    withGlobals({ Capacitor: { isNativePlatform: () => false } }, () => {
        assert.equal(isInWrapper(), false);
    });
});

test('isInWrapper: true when isNativePlatform returns true', () => {
    withGlobals({ Capacitor: { isNativePlatform: () => true } }, () => {
        assert.equal(isInWrapper(), true);
    });
});

test('isAndroidWrapper: false when not in wrapper', () => {
    withGlobals({ Capacitor: undefined }, () => {
        assert.equal(isAndroidWrapper(), false);
    });
});

test('isAndroidWrapper: false when in wrapper but platform is ios', () => {
    withGlobals({Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },}, () => {
        assert.equal(isAndroidWrapper(), false);
    });
});

test('isAndroidWrapper: true when in wrapper and platform is android', () => {
    withGlobals({Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },}, () => {
        assert.equal(isAndroidWrapper(), true);
    });
});

test('getWrapperVersion: null when EoicWrapper absent', () => {
    withGlobals({ EoicWrapper: undefined }, () => {
        assert.equal(getWrapperVersion(), null);
    });
});

test('getWrapperVersion: null when getVersion missing', () => {
    withGlobals({ EoicWrapper: {} }, () => {
        assert.equal(getWrapperVersion(), null);
    });
});

test('getWrapperVersion: returns string from getVersion()', () => {
    withGlobals({ EoicWrapper: { getVersion: () => 'v3' } }, () => {
        assert.equal(getWrapperVersion(), 'v3');
    });
});

test('getWrapperVersion: null when getVersion returns non-string', () => {
    withGlobals({ EoicWrapper: { getVersion: () => 42 } }, () => {
        assert.equal(getWrapperVersion(), null);
    });
});

test('getWrapperVersion: null when getVersion throws', () => {
    withGlobals({EoicWrapper: { getVersion: () => { throw new Error('boom'); } },}, () => {
        assert.equal(getWrapperVersion(), null);
    });
});

test('compareWrapperVersions: equal', () => {
    assert.equal(compareWrapperVersions('v2', 'v2'), 0);
});

test('compareWrapperVersions: a < b', () => {
    assert.equal(compareWrapperVersions('v1', 'v2'), -1);
});

test('compareWrapperVersions: a > b', () => {
    assert.equal(compareWrapperVersions('v10', 'v2'), 1);
});

test('compareWrapperVersions: malformed returns 0', () => {
    assert.equal(compareWrapperVersions('foo', 'v2'), 0);
    assert.equal(compareWrapperVersions('v2', null), 0);
    assert.equal(compareWrapperVersions(undefined, 'v1'), 0);
});
