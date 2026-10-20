import { useEffect, useState } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { LoaderCircle, Mic, Square, X } from 'lucide-react';
import { guiText } from '../../i18n/guiText';
import { useDictation } from './dictation/useDictation';
import { MAX_RECORDING_SECONDS } from './dictation/recording';
import styles from './ComposerDictation.module.less';

const LABELS = {
  idle: '语音输入', error: '语音输入', recording: '结束录音并转写',
  preparing: '正在准备麦克风…', transcribing: '正在转写',
};

function RecordingTimer({ started }: { started: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.min(MAX_RECORDING_SECONDS,
      Math.floor((Date.now() - started) / 1000))), 250);
    return () => clearInterval(timer);
  }, [started]);
  return <span className={styles.timer}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>;
}

export function ComposerDictation(props: {
  active: boolean; disabled: boolean; onText: (text: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const state = useDictation(props);
  const recording = state.phase === 'recording';
  const pending = state.phase === 'preparing' || state.phase === 'transcribing';
  const label = guiText(LABELS[state.phase]);
  const reset = () => { state.cancel(); };
  const panel = <div className={styles.panel} role={state.phase === 'error' ? 'alert' : 'status'}>
      <div className={styles.status}>
        {recording && <><span className={styles.dot} /><span>{guiText('正在录音')}</span>
          <RecordingTimer started={state.started ?? Date.now()} /></>}
        {state.phase === 'preparing' && <span>{guiText('正在准备麦克风…')}</span>}
        {state.phase === 'transcribing' && <span>{guiText('正在转写…')}</span>}
        {state.phase === 'error' && <span>{guiText(state.error ?? '转写失败，请重试。')}</span>}
        <button className={styles.close} type="button" aria-label={guiText('取消语音输入')} onClick={reset}>
          <X size={15} />
        </button>
      </div>
      {recording && <div className={styles.hint}>{guiText('点击麦克风结束，最长录制 2 分钟。')}</div>}
      {state.phase === 'error' && <div className={styles.actions}>
        {state.canRetry && <button type="button" onClick={state.retry}>{guiText('重试转写')}</button>}
        <button type="button" onClick={() => { reset(); void state.start(); }}>{guiText('重新录音')}</button>
      </div>}
    </div>;
  return <Popover open={state.phase !== 'idle'} content={panel} placement="topRight" arrow={false}
    styles={{ root: { maxWidth: 400 }, body: { padding: 0, background: 'transparent', boxShadow: 'none' } }}>
    <div className={styles.wrap}>
      <Tooltip title={label} open={state.phase === 'idle' ? undefined : false}
        styles={{ root: { maxWidth: 400 } }}>
        <Button type="text" shape="circle" className={styles.microphone} aria-label={label}
          aria-pressed={recording} disabled={(props.disabled && !recording) || pending}
          onClick={() => { if (recording) state.stop(); else { reset(); void state.start(); } }}>
          {pending ? <LoaderCircle size={19} className={styles.spinner} />
            : recording ? <Square size={14} fill="currentColor" /> : <Mic size={19} strokeWidth={1.7} />}
        </Button>
      </Tooltip>
    </div>
  </Popover>;
}
