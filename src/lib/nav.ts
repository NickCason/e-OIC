// Hash-based router navigation helper. Pairs with the hashchange listener
// in src/App.tsx — setting `window.location.hash` triggers the router's
// re-parse and state update.

// eslint-disable-next-line import/prefer-default-export -- single named export keeps the existing call sites (`import { nav }`) unchanged
export function nav(path: string): void {
    window.location.hash = path;
}
