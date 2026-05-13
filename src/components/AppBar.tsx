import type { ReactNode } from 'react';
import Icon from './Icon';
import Marquee from './Marquee';

// Reusable app bar.
//
// The mark logo is drawn from a CSS background image (`--mark-src` token),
// which the theme swaps automatically between full-color (light) and
// white (dark).

export interface IAppBarProps {
    onBack?: () => void;
    wordmark?: string;
    crumb?: string;
    actions?: ReactNode;
    onWordmarkClick?: () => void;
}

const AppBar = ({
    onBack, wordmark = 'e-OIC', crumb, actions, onWordmarkClick,
}: IAppBarProps) => {
    const wordmarkInteractive = typeof onWordmarkClick === 'function';

    return (
        <header className="appbar">
            {onBack && (
                <button
                    className="appbar-back"
                    onClick={onBack}
                    aria-label="Back"
                    type="button"
                >
                    <Icon name="back" size={22} strokeWidth={2} />
                </button>
            )}
            <div className="appbar-mark" role="img" aria-label="E Tech Group" />
            <div className="appbar-titles">
                {wordmarkInteractive ? (
                    <button
                        type="button"
                        className="appbar-wordmark appbar-wordmark--button"
                        onClick={onWordmarkClick}
                    >
                        <Marquee>{wordmark}</Marquee>
                    </button>
                ) : (
                    <h1 className="appbar-wordmark"><Marquee>{wordmark}</Marquee></h1>
                )}
                {crumb && <div className="appbar-crumb"><Marquee>{crumb}</Marquee></div>}
            </div>
            {actions && <div className="appbar-actions">{actions}</div>}
        </header>
    );
};

export default AppBar;
