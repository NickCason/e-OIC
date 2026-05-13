import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGpsIfd, parseDateTimeOriginal } from './photoExif';

test('parseGpsIfd: north + east DMS rationals', () => {
    const gpsIfd = {
        1: 'N',
        2: [[38, 1], [53, 1], [52500, 1000]],
        3: 'E',
        4: [[77, 1], [2, 1], [11000, 1000]],
    };
    const out = parseGpsIfd(gpsIfd);
    assert.ok(out);
    assert.ok(Math.abs(out.lat - 38.89791666666667) < 1e-6);
    assert.ok(Math.abs(out.lng - 77.03638888888889) < 1e-6);
});

test('parseGpsIfd: south + west are negated', () => {
    const gpsIfd = {
        1: 'S',
        2: [[34, 1], [0, 1], [0, 1]],
        3: 'W',
        4: [[58, 1], [30, 1], [0, 1]],
    };
    const out = parseGpsIfd(gpsIfd);
    assert.ok(out);
    assert.ok(out.lat < 0);
    assert.ok(out.lng < 0);
    assert.ok(Math.abs(out.lat + 34) < 1e-6);
    assert.ok(Math.abs(out.lng + 58.5) < 1e-6);
});

test('parseGpsIfd: missing required tags returns null', () => {
    assert.equal(parseGpsIfd({}), null);
    assert.equal(parseGpsIfd({ 1: 'N' }), null);
    assert.equal(parseGpsIfd(null), null);
    assert.equal(parseGpsIfd(undefined), null);
});

test('parseGpsIfd: includes accuracy when GPSHPositioningError present', () => {
    const gpsIfd = {
        1: 'N',
        2: [[10, 1], [0, 1], [0, 1]],
        3: 'E',
        4: [[20, 1], [0, 1], [0, 1]],
        31: [500, 100],
    };
    const out = parseGpsIfd(gpsIfd);
    assert.ok(out);
    assert.equal(out.accuracy, 5);
});

test('parseDateTimeOriginal: valid EXIF string -> epoch ms', () => {
    const ms = parseDateTimeOriginal({ 36867: '2024:06:15 14:30:45' });
    assert.ok(ms !== null);
    const d = new Date(ms);
    assert.equal(d.getFullYear(), 2024);
    assert.equal(d.getMonth(), 5);
    assert.equal(d.getDate(), 15);
    assert.equal(d.getHours(), 14);
    assert.equal(d.getMinutes(), 30);
    assert.equal(d.getSeconds(), 45);
});

test('parseDateTimeOriginal: missing tag returns null', () => {
    assert.equal(parseDateTimeOriginal({}), null);
    assert.equal(parseDateTimeOriginal(null), null);
});

test('parseDateTimeOriginal: malformed string returns null', () => {
    assert.equal(parseDateTimeOriginal({ 36867: 'not a date' }), null);
    assert.equal(parseDateTimeOriginal({ 36867: '0000:00:00 00:00:00' }), null);
});
