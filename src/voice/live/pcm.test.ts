import { describe, expect, it } from "vitest";
import { Chunker, Downsampler, level, toInt16 } from "./pcm";

const sine = (rate: number, seconds: number, hz = 440) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));

describe("Downsampler", () => {
  it("turns 48 kHz into 16 kHz exactly, across arbitrary frame sizes", () => {
    const d = new Downsampler(48000);
    const input = sine(48000, 1);
    let n = 0;
    for (let i = 0; i < input.length; i += 128) n += d.push(input.subarray(i, i + 128)).length;
    expect(d.outRate).toBe(16000);
    expect(n).toBe(16000);
  });

  it("handles the non-integer 44.1 kHz ratio without drift", () => {
    const d = new Downsampler(44100);
    const input = sine(44100, 10);
    let n = 0;
    for (let i = 0; i < input.length; i += 1024) n += d.push(input.subarray(i, i + 1024)).length;
    expect(Math.abs(n - 160000)).toBeLessThanOrEqual(1);
  });

  it("keeps a speech-band tone at about the same loudness", () => {
    const out = new Downsampler(48000).push(sine(48000, 0.5, 300));
    const peak = Math.max(...Array.from(out, Math.abs));
    expect(peak).toBeGreaterThan(0.45);
    expect(peak).toBeLessThanOrEqual(0.5);
  });

  it("never upsamples a low-rate microphone", () => {
    const d = new Downsampler(8000);
    expect(d.outRate).toBe(8000);
    const x = sine(8000, 0.1);
    expect(d.push(x)).toBe(x);
  });
});

describe("PCM conversion", () => {
  it("clips and scales to signed 16-bit", () => {
    expect(Array.from(toInt16(Float32Array.from([0, 1, -1, 2, -2, 0.5])))).toEqual([0, 32767, -32768, 32767, -32768, 16384]);
  });

  it("emits exact 100 ms chunks and keeps the remainder for next time", () => {
    const c = new Chunker(1600);
    expect(c.push(new Int16Array(1000))).toHaveLength(0);
    const out = c.push(new Int16Array(2500)); // 3,500 total
    expect(out).toHaveLength(2);
    expect(out.every((b) => b.byteLength === 3200)).toBe(true);
    expect(c.push(new Int16Array(1300))).toHaveLength(1); // 300 + 1300
  });

  it("measures loudness: silence is 0, speech-level signal is clearly above it", () => {
    expect(level(new Float32Array(480))).toBe(0);
    expect(level(sine(48000, 0.02))).toBeGreaterThan(0.5);
  });
});
