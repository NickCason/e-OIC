// geolocation.ts — request and read GPS, with a cached consent setting.

import { getSetting, setSetting } from '../db';

export type GeolocationConsent = 'granted' | 'denied';

export interface IGpsReading {
    lat: number;
    lng: number;
    accuracy: number;
    capturedAt: number;
}

export interface IRequestGeolocationOptions {
    timeout?: number;
}

const CONSENT_KEY = 'geolocationConsent';
//   'granted' | 'denied' | undefined (= not asked yet)

export async function getGeolocationConsent(): Promise<GeolocationConsent | null> {
    return getSetting<GeolocationConsent>(CONSENT_KEY);
}

export async function setGeolocationConsent(value: GeolocationConsent): Promise<void> {
    await setSetting(CONSENT_KEY, value);
}

// Ask the OS-level permission. The browser shows its own dialog —
// our app's "consent" stored in DB is just whether the user wants us
// to attempt to use location at all, not the OS permission state.
export async function requestGeolocation(
    { timeout = 8000 }: IRequestGeolocationOptions = {},
): Promise<IGpsReading | null> {
    if (!('geolocation' in navigator)) return null;
    return new Promise<IGpsReading | null>((resolve) => {
        const timer = setTimeout(() => resolve(null), timeout + 500);
        navigator.geolocation.getCurrentPosition(
            (pos: GeolocationPosition) => {
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
            {
                enableHighAccuracy: true, timeout, maximumAge: 30000
            },
        );
    });
}

// Convenience: get current GPS only if the user previously granted consent.
export async function maybeGetGps(): Promise<IGpsReading | null> {
    const consent = await getGeolocationConsent();
    if (consent !== 'granted') return null;
    return requestGeolocation();
}
