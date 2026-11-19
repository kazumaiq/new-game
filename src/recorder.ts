export class HighlightRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timerId: number | null = null;
  private tickId: number | null = null;
  private stream: MediaStream | null = null;
  public isRecording = false;

  public isSupported(): boolean {
    if (typeof MediaRecorder === 'undefined') return false;
    const probe = document.createElement('canvas') as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    return typeof probe.captureStream === 'function';
  }

  public start(
    canvas: HTMLCanvasElement,
    onTick?: (secondsLeft: number) => void,
    onFinish?: (status: 'saved' | 'shared' | 'unsupported' | 'error') => void
  ): boolean {
    if (this.isRecording) {
      this.stop();
      return false;
    }

    const streamCanvas = canvas as HTMLCanvasElement & {
      captureStream?: (fps?: number) => MediaStream;
    };
    if (!this.isSupported() || typeof streamCanvas.captureStream !== 'function') {
      onFinish?.('unsupported');
      return false;
    }

    try {
      const candidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];
      const mimeType = candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
      const stream = streamCanvas.captureStream(30);
      this.stream = stream;
      this.chunks = [];

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_200_000 })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          this.chunks.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        this.cleanupTimers();
        this.isRecording = false;
        this.stream?.getTracks().forEach((tr) => tr.stop());
        this.stream = null;

        if (this.chunks.length === 0) {
          onFinish?.('error');
          return;
        }

        const outType = mimeType || 'video/webm';
        const ext = outType.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(this.chunks, { type: outType });
        this.chunks = [];

        try {
          const file = new File([blob], `aether-rift-clip.${ext}`, { type: outType });
          if (
            typeof navigator.canShare === 'function' &&
            navigator.canShare({ files: [file] }) &&
            typeof navigator.share === 'function'
          ) {
            await navigator.share({
              title: 'AETHER RIFT — Боевой клип',
              text: 'Мой лучший момент в AETHER RIFT!',
              files: [file],
            });
            onFinish?.('shared');
            return;
          }
        } catch {
          // Если пользователь отменил или Web Share не поддержан для файлов — скачаем локально
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aether-rift-${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
        onFinish?.('saved');
      };

      recorder.onerror = () => {
        this.cleanupTimers();
        this.isRecording = false;
        onFinish?.('error');
      };

      this.mediaRecorder = recorder;
      this.isRecording = true;
      recorder.start(250);

      let left = 10;
      onTick?.(left);
      this.tickId = window.setInterval(() => {
        left = Math.max(0, left - 1);
        onTick?.(left);
      }, 1000);

      this.timerId = window.setTimeout(() => {
        this.stop();
      }, 10000);

      return true;
    } catch {
      this.cleanupTimers();
      this.isRecording = false;
      onFinish?.('unsupported');
      return false;
    }
  }

  public stop(): void {
    this.cleanupTimers();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        this.isRecording = false;
      }
    } else {
      this.isRecording = false;
    }
  }

  private cleanupTimers(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.tickId !== null) {
      clearInterval(this.tickId);
      this.tickId = null;
    }
  }
}
