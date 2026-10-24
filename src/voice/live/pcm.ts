// Audio conversion for live speech-to-text: microphone samples (any rate, float) to 16 kHz
// 16-bit PCM in 100 ms chunks. Pure functions so they can be tested without a browser.

export const TARGET_RATE = 16000;

// Streaming box-filter downsampler: each output sample is the average of the input samples it
// covers, which also low-passes enough for speech. Works for non-integer ratios (44.1 kHz).
export class Downsampler {
  readonly outRate: number;
  private readonly ratio: number;
  private next: number; // input index (from stream start) where the current output sample ends
  private index = 0; // input samples seen so far
  private acc = 0;
  private count = 0;

  constructor(inRate: number, outRate = TARGET_RATE) {
    // Never upsample: a mic at or below 16 kHz is sent at its own rate.
    this.outRate = inRate <= outRate ? inRate : outRate;
    this.ratio = inRate / this.outRate;
    this.next = this.ratio;
  }

  push(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input;
    const out = new Float32Array(Math.ceil(input.length / this.ratio) + 1);
    let n = 0;
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i];
      this.count++;
      this.index++;
      if (this.index >= this.next) {
        out[n++] = this.acc / this.count;
        this.acc = 0;
        this.count = 0;
        this.next += this.ratio;
      }
    }
    return out.subarray(0, n);
  }
}

export function toInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

// Collects samples into fixed-size chunks (100 ms at 16 kHz = 1,600 samples).
export class Chunker {
  private buf: Int16Array<ArrayBuffer>;
  private len = 0;

  constructor(private readonly size: number) {
    this.buf = new Int16Array(size);
  }

  push(samples: Int16Array): ArrayBuffer[] {
    const out: ArrayBuffer[] = [];
    let i = 0;
    while (i < samples.length) {
      const take = Math.min(this.size - this.len, samples.length - i);
      this.buf.set(samples.subarray(i, i + take), this.len);
      this.len += take;
      i += take;
      if (this.len === this.size) {
        out.push(this.buf.buffer);
        this.buf = new Int16Array(this.size);
        this.len = 0;
      }
    }
    return out;
  }
}

// Loudness 0..1 (RMS, scaled so normal speech sits around 0.3–0.8).
export function level(input: Float32Array): number {
  if (!input.length) return 0;
  let sum = 0;
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
  return Math.min(1, Math.sqrt(sum / input.length) * 4);
}
