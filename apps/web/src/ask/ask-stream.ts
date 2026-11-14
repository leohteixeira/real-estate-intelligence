import { parseAskProgressEvent, type AskProgressEvent } from '@rei/contracts';
import { ApiReadError } from '../api/read-error.js';

export const askStreamPolicy = { maxFrameBytes: 64 * 1024, maxBufferedBytes: 128 * 1024 } as const;
export interface StreamEnvelope {
  readonly id: string;
  readonly event: string;
  readonly terminal: boolean;
}
export interface AdmittedFrame<T extends StreamEnvelope = AskProgressEvent> {
  readonly frame: T;
  readonly serialized: string;
}

/** Incremental SSE framing. A cursor exists only after a complete public envelope. */
export class EventStreamDecoder<T extends StreamEnvelope> {
  private readonly parse: (value: unknown) => T;
  constructor(parse: (value: unknown) => T) {
    this.parse = parse;
  }
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private line: string[] = [];
  private bytes = 0;
  private skipLf = false;
  private id: string | undefined;
  private event: string | undefined;
  private data: string[] = [];

  /** `onHeartbeat` reports a complete comment line received between frames, never a partial one. */
  push(
    chunk: Uint8Array,
    onFrame?: (frame: AdmittedFrame<T>) => void,
    onHeartbeat?: () => void,
  ): AdmittedFrame<T>[] {
    try {
      if (chunk.byteLength > askStreamPolicy.maxBufferedBytes) throw new ApiReadError(502);
      const frames: AdmittedFrame<T>[] = [];
      let start = 0;
      for (let index = 0; index < chunk.length; index++) {
        const byte = chunk[index];
        if (this.skipLf) {
          this.skipLf = false;
          if (byte === 10) {
            if (this.bytes) this.count(1);
            start = index + 1;
            continue;
          }
        }
        if (byte !== 10 && byte !== 13) continue;
        this.append(chunk.subarray(start, index + 1));
        // A CR completes the line now; a following LF belongs to the same separator.
        const text = this.line.join('');
        this.line = [];
        // Reserve an optional LF before a blank CR commits the frame. Other CRLF
        // separators count their LF when it arrives, including in another chunk.
        if (byte === 13 && text === '\r') this.count(1);
        this.acceptLine(text.slice(0, -1), frames, onFrame, onHeartbeat);
        this.skipLf = byte === 13;
        start = index + 1;
      }
      if (start < chunk.length) this.append(chunk.subarray(start));
      return frames;
    } catch {
      throw new ApiReadError(502);
    }
  }

  finish(): AdmittedFrame<T>[] {
    try {
      const tail = this.decoder.decode();
      if (
        tail ||
        this.line.length ||
        this.data.length ||
        this.id !== undefined ||
        this.event !== undefined
      )
        throw new ApiReadError(502);
      return [];
    } catch {
      throw new ApiReadError(502);
    }
  }

  private append(chunk: Uint8Array): void {
    this.count(chunk.byteLength);
    const text = this.decoder.decode(chunk, { stream: true });
    if (text) this.line.push(text);
  }

  private count(bytes: number): void {
    this.bytes += bytes;
    if (this.bytes > askStreamPolicy.maxFrameBytes) throw new ApiReadError(502);
  }

  private acceptLine(
    line: string,
    frames: AdmittedFrame<T>[],
    onFrame?: (frame: AdmittedFrame<T>) => void,
    onHeartbeat?: () => void,
  ): void {
    if (!line) {
      if (this.data.length) {
        const serialized = this.data.join('\n');
        const value: unknown = JSON.parse(serialized);
        const frame = this.parse(value);
        if (frame.id !== this.id || frame.event !== this.event) throw new ApiReadError(502);
        const admitted = { frame, serialized };
        frames.push(admitted);
        // Commit complete envelopes as they arrive, even if a later envelope in this chunk corrupts.
        onFrame?.(admitted);
      } else if (this.id !== undefined || this.event !== undefined) throw new ApiReadError(502);
      this.id = undefined;
      this.event = undefined;
      this.data = [];
      this.bytes = 0;
    } else if (line.startsWith(':')) {
      if (!this.data.length && this.id === undefined && this.event === undefined) onHeartbeat?.();
    } else {
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'data') this.data.push(value);
      if (field === 'id' || field === 'event') {
        if (this[field] !== undefined || value.includes('\0')) throw new ApiReadError(502);
        this[field] = value;
      }
    }
  }
}

export class AskStreamDecoder extends EventStreamDecoder<AskProgressEvent> {
  constructor() {
    super(parseAskProgressEvent);
  }
}
