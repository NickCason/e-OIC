declare module 'piexifjs' {
    export interface IExifData {
        '0th'?: Record<number, unknown>
        Exif?: Record<number, unknown>
        GPS?: Record<number, unknown>
        Interop?: Record<number, unknown>
        '1st'?: Record<number, unknown>
        thumbnail?: string | null
    }

    export function load(jpegBinary: string): IExifData

    const piexif: { load: typeof load }
    export default piexif
}
