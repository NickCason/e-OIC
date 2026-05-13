import { ChevronLeft, ChevronDown, Plus, Settings, Search, Camera, Image, ImageOff, MapPin, ArrowRight, ArrowDown, Check, Trash2, Download, Link as LinkIcon, LayoutGrid, X, MoreHorizontal, Edit3, Sun, Moon, Monitor, AlertCircle, ChevronRight, RefreshCw, Copy, Unlink } from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';

// Curated icon set used across the app. Default size 18px, stroke width
// 1.75 — pairs well with Montserrat 14px body text.

export type IconName =
    | 'back' | 'expand' | 'next' | 'add' | 'settings' | 'search'
    | 'camera' | 'image' | 'imageOff' | 'gps' | 'arrowRight' | 'arrowDown'
    | 'check' | 'trash' | 'download' | 'link' | 'grid' | 'close'
    | 'more' | 'edit' | 'themeLight' | 'themeDark' | 'themeAuto'
    | 'warn' | 'refresh' | 'copy' | 'unlink';

const ICONS: Record<IconName, LucideIcon> = {
    back: ChevronLeft,
    expand: ChevronDown,
    next: ChevronRight,
    add: Plus,
    settings: Settings,
    search: Search,
    camera: Camera,
    image: Image,
    imageOff: ImageOff,
    gps: MapPin,
    arrowRight: ArrowRight,
    arrowDown: ArrowDown,
    check: Check,
    trash: Trash2,
    download: Download,
    link: LinkIcon,
    grid: LayoutGrid,
    close: X,
    more: MoreHorizontal,
    edit: Edit3,
    themeLight: Sun,
    themeDark: Moon,
    themeAuto: Monitor,
    warn: AlertCircle,
    refresh: RefreshCw,
    copy: Copy,
    unlink: Unlink,
};

export interface IIconProps extends Omit<LucideProps, 'name' | 'ref'> {
    name: IconName;
    size?: number | string;
    strokeWidth?: number | string;
}

const Icon = ({
    name, size = 18, strokeWidth = 1.75, ...rest
}: IIconProps) => {
    const Cmp = ICONS[name];
    if (!Cmp) {
        console.warn(`Icon: unknown name "${name}"`);
        return null;
    }
    // eslint-disable-next-line react/jsx-props-no-spreading -- pass-through SVG attrs (className, style, etc.)
    return <Cmp size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
};

export default Icon;
