import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import type { Language } from '../content/types';
import { syncAppearance, toggleAppearance } from '../lib/appearance';
import { ui } from '../lib/ui-text';

export function ThemeToggle({ language }: { language: Language }) {
  useEffect(() => {
    window.addEventListener('storage', syncAppearance);
    return () => window.removeEventListener('storage', syncAppearance);
  }, []);

  return (
    <button className="theme-toggle" type="button" onClick={toggleAppearance}>
      <span className="show-in-dark">
        <Sun size={18} aria-hidden="true" />
        <span className="sr-only">{ui(language, 'themeToWhite')}</span>
      </span>
      <span className="show-in-light">
        <Moon size={18} aria-hidden="true" />
        <span className="sr-only">{ui(language, 'themeToDark')}</span>
      </span>
    </button>
  );
}
