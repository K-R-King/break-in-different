/* global AudioWorkletProcessor, registerProcessor */
// Microphone tap for live speech-to-text. Passes raw float samples to the page about every
// 20 ms; conversion to 16 kHz PCM happens in src/voice/live/pcm.ts (tested code).
// Served as a static file so the page's Content-Security-Policy (script-src 'self') allows it.
class MicTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1024);
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.len++] = ch[i];
        if (this.len === this.buf.length) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(1024);
          this.len = 0;
        }
      }
    }
    return true; // keep running even through silence
  }
}
registerProcessor("mic-tap", MicTap);
