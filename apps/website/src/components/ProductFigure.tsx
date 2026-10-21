import { Check, Command, Laptop, Monitor, MousePointer2, Smartphone, Terminal } from 'lucide-react';
import { copy } from '../content/copy';
import { featureImageAlt } from '../content/features';
import type { Feature, Language } from '../content/types';
import { asset } from '../lib/site';
import { ui } from '../lib/ui-text';

const dimensions: Record<string, [number, number]> = {
  'codex-gui': [1700, 925],
  dashboard: [1997, 950],
  conversations: [2002, 950],
  providers: [2001, 949],
  'token-usage': [1996, 951],
  'dream-skin': [1997, 950],
  skills: [1999, 952],
  'two-factor': [1996, 945],
  'floating-usage-expanded': [345, 238],
};

export function ProductImage({ name, alt, priority = false }: { name: string; alt: string; priority?: boolean }) {
  const [width, height] = dimensions[name] ?? [1700, 925];
  return (
    <img
      src={asset(`${name}.webp`)}
      alt={alt}
      width={width}
      height={height}
      srcSet={
        width > 800
          ? `${asset(`${name}-small.webp`)} 800w, ${asset(`${name}.webp`)} ${Math.min(width, 1700)}w`
          : undefined
      }
      sizes="(max-width: 800px) 95vw, 1200px"
      loading={priority ? 'eager' : 'lazy'}
      {...(priority ? { fetchpriority: 'high' } : {})}
      decoding="async"
    />
  );
}

export function ConnectionIllustration({ language }: { language: Language }) {
  return (
    <div className="connection-art" role="img" aria-label={ui(language, 'connectionArt')}>
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="connection-host">
        <div className="mini-window-bar">
          <span />
          <span />
          <span />
          <b>Remote AI</b>
        </div>
        <div className="connection-editor">
          <div className="editor-sidebar">
            <Terminal />
            <i />
            <i />
            <i />
          </div>
          <div className="editor-code">
            <span className="code-comment">// your next idea</span>
            <span>
              <em>const</em> possibilities = [
            </span>
            <span>&nbsp; 'build', 'connect', 'create'</span>
            <span>];</span>
            <div className="editor-status">
              <span />
              {ui(language, 'connectionRunning')}
            </div>
          </div>
        </div>
      </div>
      <div className="device-node browser-node">
        <Laptop size={25} />
        <span>{ui(language, 'connectionBrowser')}</span>
        <Check size={13} />
      </div>
      <div className="device-node phone-node">
        <Smartphone size={25} />
        <span>{ui(language, 'connectionMobile')}</span>
        <Check size={13} />
      </div>
      <div className="connection-label">
        <span />
        {ui(language, 'connectionCaption')}
      </div>
    </div>
  );
}

function ComputerIllustration({ language }: { language: Language }) {
  const labels = [ui(language, 'computerGoal'), ui(language, 'computerOperate'), ui(language, 'computerCheck')];
  const icons = [Command, MousePointer2, Check];
  return (
    <div className="computer-art" role="img" aria-label={labels.join(' → ')}>
      <div className="computer-art-title">
        <Monitor size={28} />
        <span>COMPUTER USE</span>
      </div>
      <div className="computer-art-flow">
        {labels.map((label, index) => {
          const Icon = icons[index];
          return (
            <div className="computer-art-step" key={label}>
              <span className="step-index">0{index + 1}</span>
              <Icon size={38} strokeWidth={1.4} />
              <strong>{label}</strong>
            </div>
          );
        })}
      </div>
      <p>{ui(language, 'computerCaption')}</p>
    </div>
  );
}

export function ProductFigure({
  feature,
  language,
  priority = false,
}: {
  feature: Feature;
  language: Language;
  priority?: boolean;
}) {
  let content = <ProductImage name={feature.image} alt={featureImageAlt(feature, language)} priority={priority} />;
  if (feature.image === 'remote-workspace') content = <ConnectionIllustration language={language} />;
  if (feature.image === 'computer-use') content = <ComputerIllustration language={language} />;
  return (
    <figure className={`product-figure ${feature.imageKind ?? 'screenshot'}`}>
      <div className="figure-surface">{content}</div>
      <figcaption>{copy(language).common[feature.imageKind === 'diagram' ? 'diagram' : 'screenshot']}</figcaption>
    </figure>
  );
}
