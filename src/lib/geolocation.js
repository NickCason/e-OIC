// geolocation.js — request and read GPS, with a cached consent setting.

import { getSetting, setSetting } from '../db.js';

const CONSENT_KEY = 'geolocationConsent';
//   'granted' | 'denied' | undefined (= not asked yet)

export async function getGeolocationConsent() {
  return getSetting(CONSENT_KEY);
}

export async function setGeolocationConsent(value) {
  await setSetting(CONSENT_KEY, value); // 'granted' | 'denied'
}

// Ask the OS-level permission. The browser shows its own dialog —
// our app's "consent" stored in DB is just whether the user wants us
// to attempt to use location at all, not the OS permission state.
export async function requestGeolocation({ timeout = 8000 } = {}) {
  if (!('geolocation' in navigator)) return null;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: Date.now(),
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout, maximumAge: 30000 }
    );
  });
}

// Convenience: get current GPS only if the user previously granted consent.
export async function maybeGetGps() {
  const consent = await getGeolocationConsent();
  if (consent !== 'granted') return null;
  return requestGeolocation();
}
