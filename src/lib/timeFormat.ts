// Human-friendly relative time formatter for "just now / Xm ago / Xh ago /
// Xd ago / M/D/YY". Extracted from JobList so multiple components (JobList,
// JobView) can share it without tripping react-refresh's
// `only-export-components` rule.

// eslint-disable-next-line import/prefer-default-export -- single named export keeps the existing call sites (`import { fmtRelative }`) consistent with other lib/* helpers
export function fmtRelative(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}
