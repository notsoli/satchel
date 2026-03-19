import { useState, useEffect, useRef, type RefObject } from "react";
import { guess } from "web-audio-beat-detector";
import type { SharedUniforms } from "../lib/uniforms";

interface AnalyzerProps {
  onUpdate?: (uniforms: {
    u_bands: [number, number, number];
    u_beat: number;
  }) => void;
  uniformsRef: RefObject<SharedUniforms>;
}

const BANDS = {
  low: [20, 300],
  mid: [300, 4000],
  high: [4000, 20000],
} as const;

const BUFFER_SECONDS = 10;

const WORKLET_CODE = `
  class SampleCapture extends AudioWorkletProcessor {
    process(inputs) {
      const channel = inputs[0]?.[0];
      if (channel) this.port.postMessage(channel);
      return true;
    }
  }
  registerProcessor('sample-capture', SampleCapture);
`;

function getBands(
  analyser: AnalyserNode,
  dataArray: Uint8Array<ArrayBuffer>,
): [number, number, number] {
  analyser.getByteFrequencyData(dataArray);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const len = dataArray.length;

  function avg(lo: number, hi: number): number {
    const start = Math.floor(lo / binHz);
    const end = Math.min(Math.ceil(hi / binHz), len - 1);
    let sum = 0;
    for (let i = start; i <= end; i++) sum += dataArray[i];
    return sum / (end - start + 1) / 255;
  }

  return [avg(...BANDS.low), avg(...BANDS.mid), avg(...BANDS.high)];
}

export default function Analyzer({ onUpdate, uniformsRef }: AnalyzerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const bpmIntervalRef = useRef<number | null>(null);

  // Circular buffer for raw PCM samples
  const sampleBufRef = useRef<Float32Array | null>(null);
  const sampleBufWriteRef = useRef(0);
  const sampleBufFilledRef = useRef(false);

  // Beat phase state derived from guess()
  const firstBeatTimeRef = useRef<number | null>(null);
  const beatIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    audioContextRef.current = new AudioContext();

    return () => {
      disconnect().catch((err) => {
        console.error("Error during cleanup on unmount", err);
      });
      audioContextRef.current?.close();
    };
  }, []);

  const disconnect = async () => {
    if (!audioContextRef.current || !sourceRef.current || !analyserRef.current)
      return;

    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = 0;

    if (bpmIntervalRef.current !== null) {
      clearInterval(bpmIntervalRef.current);
      bpmIntervalRef.current = null;
    }

    await audioContextRef.current.suspend();
    sourceRef.current.disconnect();
    analyserRef.current.disconnect();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    sampleBufRef.current = null;
    sampleBufWriteRef.current = 0;
    sampleBufFilledRef.current = false;
    firstBeatTimeRef.current = null;
    beatIntervalRef.current = null;

    setIsRecording(false);
  };

  async function handleStart() {
    try {
      setError(undefined);

      const audioCtx = audioContextRef.current;
      if (!audioCtx) throw new Error("Audio context not initialized");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      await audioCtx.resume();

      // Load worklet
      const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await audioCtx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      // Set up analyser for frequency bands
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserRef.current = analyserNode;
      dataArrayRef.current = new Uint8Array(analyserNode.frequencyBinCount);

      // Set up circular buffer for beat detection (~20s of mono PCM)
      const bufLen = Math.ceil(audioCtx.sampleRate * BUFFER_SECONDS);
      sampleBufRef.current = new Float32Array(bufLen);

      // Set up worklet to capture raw samples
      const worklet = new AudioWorkletNode(audioCtx, "sample-capture", {
        numberOfOutputs: 0,
      });
      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        const chunk = e.data;
        const buf = sampleBufRef.current!;
        const writeIdx = sampleBufWriteRef.current;
        const bufLen = buf.length;

        if (writeIdx + chunk.length <= bufLen) {
          buf.set(chunk, writeIdx);
        } else {
          // Wrap around
          const firstPart = bufLen - writeIdx;
          buf.set(chunk.subarray(0, firstPart), writeIdx);
          buf.set(chunk.subarray(firstPart), 0);
        }

        sampleBufWriteRef.current = (writeIdx + chunk.length) % bufLen;
        if (
          !sampleBufFilledRef.current &&
          sampleBufWriteRef.current < writeIdx
        ) {
          sampleBufFilledRef.current = true;
        }
      };

      // Connect graph
      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyserNode);
      analyserNode.connect(worklet);

      // RAF loop for frequency bands + beat phase
      const tick = () => {
        rafIdRef.current = requestAnimationFrame(tick);
        const firstBeat = firstBeatTimeRef.current;
        const beatInterval = beatIntervalRef.current;
        const u_beat =
          firstBeat !== null && beatInterval !== null
            ? ((audioCtx.currentTime - firstBeat) % beatInterval) / beatInterval
            : 0;
        onUpdate?.({
          u_bands: getBands(analyserNode, dataArrayRef.current!),
          u_beat,
        });
      };
      tick();

      // BPM analysis loop — runs once per second once buffer has enough data
      let analyzing = false;
      bpmIntervalRef.current = setInterval(async () => {
        if (analyzing || !sampleBufFilledRef.current) return;
        const buf = sampleBufRef.current;
        if (!buf) return;

        analyzing = true;
        try {
          // Unwrap circular buffer into a linear copy
          const writeIdx = sampleBufWriteRef.current;
          const linear = new Float32Array(buf.length);
          linear.set(buf.subarray(writeIdx));
          linear.set(buf.subarray(0, writeIdx), buf.length - writeIdx);

          const bufferStartTime = audioCtx.currentTime - BUFFER_SECONDS;

          const audioBuffer = audioCtx.createBuffer(
            1,
            linear.length,
            audioCtx.sampleRate,
          );
          audioBuffer.copyToChannel(linear, 0);

          const { bpm, offset } = await guess(audioBuffer);
          firstBeatTimeRef.current = bufferStartTime + offset;
          beatIntervalRef.current = 60 / bpm;
        } catch {
          // Not enough signal or undetectable tempo — ignore
        } finally {
          analyzing = false;
        }
      }, 10000) as unknown as number;

      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);

      let errorMessage = "Failed to access microphone";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          errorMessage =
            "Microphone access denied. Please allow microphone access.";
        } else if (err.name === "NotFoundError") {
          errorMessage = "No microphone found. Please connect a microphone.";
        } else {
          errorMessage = err.message;
        }
      }

      setError(errorMessage);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      {!isRecording && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          onClick={handleStart}
        >
          <path d="M12 19v3" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <rect x="9" y="2" width="6" height="13" rx="3" />
        </svg>
      )}
      {isRecording && (
        <div
          style={{
            width: "20px",
            height: "20px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
          onClick={disconnect}
        >
          <Blinker uniformsRef={uniformsRef} />
        </div>
      )}
      {error && <span>{error}</span>}
    </div>
  );
}

function Blinker({ uniformsRef }: { uniformsRef: RefObject<SharedUniforms> }) {
  const [beat, setBeat] = useState<number>(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setBeat(1 - uniformsRef.current.u_beat);
    }, 17);

    return () => {
      clearInterval(intervalId);
    };
  }, [uniformsRef]);

  return (
    <div
      style={{
        width: "10px",
        height: "10px",
        borderRadius: "5px",
        backgroundColor: `hsl(353, 72%, ${25 + beat * 25}%)`,
      }}
    ></div>
  );
}
