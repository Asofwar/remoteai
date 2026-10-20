const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
export const MAX_RECORDING_SECONDS = 120;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export interface Recording {
  result: Promise<Blob>;
  stop: () => void;
  cancel: () => void;
}

export function recordingSupported(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined';
}

function capture(stream: MediaStream, recorder: MediaRecorder): Recording {
  const chunks: Blob[] = [];
  let bytes = 0;
  let cancelled = false;
  let failure: Error | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const release = () => { clearTimeout(timer); stream.getTracks().forEach((track) => track.stop()); };
  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop();
    release();
  };
  const result = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = ({ data }) => {
      bytes += data.size;
      if (bytes > MAX_AUDIO_BYTES) {
        failure = new Error('录音无效或过大，请重新录制一段较短的语音。');
        stop();
      } else if (!cancelled) chunks.push(data);
    };
    recorder.onerror = () => { failure = new Error('录音中断，请检查麦克风后重试。'); stop(); };
    recorder.onstop = () => {
      release();
      if (cancelled) { reject(new DOMException('Cancelled', 'AbortError')); return; }
      if (failure) { reject(failure); return; }
      const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type });
      if (!blob.size) { reject(new Error('没有录到声音，请重新录音。')); return; }
      resolve(blob);
    };
  });
  // Cancellation may happen between getUserMedia resolving and the caller attaching its await.
  void result.catch(() => undefined);
  recorder.start(250);
  timer = setTimeout(stop, MAX_RECORDING_SECONDS * 1000);
  return { result, stop, cancel: () => { cancelled = true; chunks.length = 0; stop(); } };
}

export async function startRecording(signal: AbortSignal): Promise<Recording> {
  if (!recordingSupported()) throw new Error('当前环境无法录音，请在桌面客户端或 HTTPS 页面使用。');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    signal.throwIfAborted();
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('当前环境不支持语音录制，请更新客户端或浏览器。');
    return capture(stream, new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 }));
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

export function audioBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('无法读取录音，请重新录音。'));
    reader.readAsDataURL(blob);
  });
}
