// Subtests share a single fake-IDB instance (no reset between tests).
// All assertions must be scoped by job/panel UUID — counting all jobs or
// all panels would silently include leftover state from earlier subtests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import {createJob, createPanel, createRow, listAllRows,
    exportPanelRaw, restorePanelRaw, exportJobRaw, restoreJobRaw,
    deletePanel, deleteJob, getJob, listPanels,} from '../db';

test('exportPanelRaw + restorePanelRaw round-trips a panel after delete', async () => {
    const job = await createJob({ name: 'T1' });
    const panel = await createPanel({ jobId: job.id, name: 'P1' });
    await createRow({
        panelId: panel.id, sheet: 'main', data: { foo: 'bar' },
    });
    const snap = await exportPanelRaw(panel.id);
    await deletePanel(panel.id);
    assert.equal((await listPanels(job.id)).length, 0);
    await restorePanelRaw(snap);
    const panels = await listPanels(job.id);
    assert.equal(panels.length, 1);
    const firstPanel = panels[0];
    assert.ok(firstPanel, 'expected restored panel');
    const rows = await listAllRows(firstPanel.id);
    assert.equal(rows.length, 1);
    const firstRow = rows[0];
    assert.ok(firstRow, 'expected restored row');
    assert.equal(firstRow.data.foo, 'bar');
});

test('exportJobRaw + restoreJobRaw round-trips a whole job after delete', async () => {
    const job = await createJob({ name: 'T2' });
    const panel = await createPanel({ jobId: job.id, name: 'P2' });
    await createRow({
        panelId: panel.id, sheet: 'main', data: { x: 1 },
    });
    const snap = await exportJobRaw(job.id);
    await deleteJob(job.id);
    assert.equal(await getJob(job.id), undefined);
    await restoreJobRaw(snap);
    assert.ok(await getJob(job.id));
    assert.equal((await listPanels(job.id)).length, 1);
});
