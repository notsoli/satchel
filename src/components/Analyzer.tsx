import { useState, useEffect, useRef } from "react";

interface AnalyzerProps {
  onUpdate?: (uniforms: { u_bands: [number, number, number] }) => void;
}

const BANDS = {
  low: [20, 300],
  mid: [300, 4000],
  high: [4000, 20000],
} as const;

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

export default function Analyzer({ onUpdate }: AnalyzerProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [blink, setBlink] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafIdRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const intervalIdRef = useRef<number | null>(null);

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

    await audioContextRef.current.suspend();
    sourceRef.current.disconnect();
    analyserRef.current.disconnect();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
    }
  };

  async function handleStart() {
    try {
      setError(undefined);

      const audioCtx = audioContextRef.current;
      if (!audioCtx) throw new Error("Audio context not initialized");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      await audioCtx.resume();

      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 2048;
      analyserRef.current = analyserNode;
      dataArrayRef.current = new Uint8Array(analyserNode.frequencyBinCount);

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyserNode);

      const tick = () => {
        rafIdRef.current = requestAnimationFrame(tick);
        onUpdate?.({ u_bands: getBands(analyserNode, dataArrayRef.current!) });
      };
      tick();

      setIsRecording(true);
      intervalIdRef.current = setInterval(
        () => setBlink((prev) => !prev),
        1000,
      );
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
      }}
    >
      {!isRecording && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
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
            width: "10px",
            height: "10px",
            borderRadius: "5px",
            backgroundColor: blink ? "#c2293a" : "#7a222c",
          }}
          onClick={disconnect}
        ></div>
      )}
      {error && <span>{error}</span>}
    </div>
  );
}
