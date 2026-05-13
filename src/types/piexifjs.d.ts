declare module 'piexifjs' {
    export interface IExifData {
        '0th'?: Record<number, unknown>;
        Exif?: Record<number, unknown>;
        GPS?: Record<number, unknown>;
        Interop?: Record<number, unknown>;
        '1st'?: Record<number, unknown>;
        thumbnail?: string | null;
    }

    export interface IGpsIfdTags {
        GPSLatitudeRef: number;
        GPSLatitude: number;
        GPSLongitudeRef: number;
        GPSLongitude: number;
        GPSHPositioningError: number;
        GPSDateStamp: number;
    }

    export function load(jpegBinary: string): IExifData
    export function dump(exifObj: IExifData): string
    export function insert(exifBytes: string, jpegBinary: string): string

    export const GPSIFD: IGpsIfdTags;

    const piexif: {
        load: typeof load;
        dump: typeof dump;
        insert: typeof insert;
        GPSIFD: IGpsIfdTags;
    };
    export default piexif;
}
