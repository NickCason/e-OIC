// Inputs to the SharePoint-flavoured pull/re-sync dialogs. These are not
// SharePoint-specific in the codebase yet — the same shapes drive the local
// file-picker flow in PullDialog.jsx and ResyncDialog.jsx, but the name is
// kept for forward-compatibility with a future SharePoint integration.

import type { IParsedXlsx, IJobDiff, IResyncDecisions } from './xlsx';
import type { IJobSource } from './job';

export interface IPullDialogInput {
    parsed: IParsedXlsx;
    sourceFilename: string;
    // Mirrors the `meta` object passed to applyParsedXlsxToNewJob.
    meta: {
        name: string;
        client: string;
        location: string;
        source: IJobSource | null;
    };
}

export interface IResyncDialogInput {
    jobId: string;
    parsed: IParsedXlsx;
    diff: IJobDiff;
    decisions: IResyncDecisions;
}
