// Hash-based router navigation helper. Mirrors what App.jsx used to export;
// extracted so .tsx callers can import it without depending on the JS file.
// App.jsx re-exports this so existing import paths keep working until App is
// converted in Task 4.

// eslint-disable-next-line import/prefer-default-export -- single named export keeps the existing call sites (`import { nav }`) unchanged
export function nav(path: string): void {
    window.location.hash = path;
}
