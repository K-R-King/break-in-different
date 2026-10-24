// Push-to-talk recording: the microphone is off until the user presses and holds.
export function recordingSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export class PushToTalkRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start();
  }

  stop(): Promise<{ audio: ArrayBuffer; mimeType: string } | null> {
    return new Promise((resolve) => {
      const r = this.recorder;
      if (!r || r.state === "inactive") {
        this.release();
        return resolve(null);
      }
      r.onstop = async () => {
        const type = r.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type });
        this.release();
        resolve(blob.size ? { audio: await blob.arrayBuffer(), mimeType: type } : null);
      };
      r.stop();
    });
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
