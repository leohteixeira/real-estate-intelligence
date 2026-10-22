import { describe, expect, it } from 'vitest';
import { AskStreamDecoder } from './ask-stream';
import { frames, wire } from './ask-fixtures.test';
import { AskSession } from './ask-session';

describe('Ask incremental framing', () => {
  it.each(['\n', '\r', '\r\n'])(
    'retains queued/running before invalid UTF-8 with %j in every chunk partition',
    (newline) => {
      const prefix = new TextEncoder().encode(wire(0, newline) + wire(1, newline));
      const bytes = new Uint8Array([...prefix, 0xc3, 0x28]);
      // Same chunk, split invalid code point, and one-byte network chunks.
      for (const chunks of [
        [bytes],
        [bytes.slice(0, -1), bytes.slice(-1)],
        [bytes.slice(0, prefix.length), bytes.slice(prefix.length)],
        [...bytes].map((byte) => Uint8Array.of(byte)),
      ]) {
        const decoder = new AskStreamDecoder();
        const session = new AskSession(frames[0]!.run);
        expect(() => {
          for (const chunk of chunks) decoder.push(chunk, (frame) => session.admit(frame));
          decoder.finish();
        }).toThrow('The public contract could not be read.');
        expect(session.run).toEqual(frames[1]!.run);
        expect(session.cursor).toBe(frames[1]!.id);
      }
    },
  );
  it.each(['\n', '\r', '\r\n'])(
    'retains complete %j frames before an unfinished UTF-8 code point at EOF',
    (newline) => {
      const decoder = new AskStreamDecoder();
      const session = new AskSession(frames[0]!.run);
      decoder.push(
        new Uint8Array([
          ...new TextEncoder().encode(wire(0, newline) + wire(1, newline)),
          0xe2,
          0x82,
        ]),
        (frame) => session.admit(frame),
      );
      expect(() => decoder.finish()).toThrow();
      expect(session.cursor).toBe(frames[1]!.id);
    },
  );
  it.each(['\n', '\r', '\r\n'])(
    'accepts split UTF-8 and %j separators, comments and multiline data',
    (newline) => {
      const text = `: português${newline}${newline}${wire(0, newline).replace('data: {', `data: {${newline}data: `)}`;
      const decoder = new AskStreamDecoder();
      const accepted = [...new TextEncoder().encode(text)].flatMap((byte) =>
        decoder.push(Uint8Array.of(byte)),
      );
      accepted.push(...decoder.finish());
      expect(accepted.map((item) => item.frame)).toEqual([frames[0]]);
    },
  );
  it('accepts multiple complete frames and ignores keepalive comments', () => {
    const decoder = new AskStreamDecoder();
    expect(
      decoder
        .push(new TextEncoder().encode(`: keepalive\n\n${wire(0)}${wire(1)}`))
        .map((item) => item.frame),
    ).toEqual(frames.slice(0, 2));
    expect(decoder.finish()).toEqual([]);
  });
  it.each([
    'data: {private invalid JSON}\n\n',
    wire(0).replace('event: ask.progress', 'event: ask.completed'),
    wire(0).replace(`id: ${frames[0]!.id}`, 'id: foreign'),
    wire(0).replace('"version":1', '"version":2'),
    wire(0).replace('event: ask.progress', 'event: ask.progress\nevent: ask.progress'),
    `data: ${'x'.repeat(66000)}\n\n`,
  ])('rejects malformed, conflicting or oversized frames without exposing data', (value) => {
    expect(() => new AskStreamDecoder().push(new TextEncoder().encode(value))).toThrow(
      'The public contract could not be read.',
    );
  });
  it('bounds incomplete buffering, rejects invalid UTF-8 and unfinished data at EOF', () => {
    expect(() => new AskStreamDecoder().push(new Uint8Array(140000))).toThrow();
    expect(() => new AskStreamDecoder().push(Uint8Array.of(255))).toThrow();
    const decoder = new AskStreamDecoder();
    decoder.push(new TextEncoder().encode('data: {'));
    expect(() => decoder.finish()).toThrow();
  });
  it('includes both bytes of CRLF in the frame ceiling across chunk partitions', () => {
    const bytes = new TextEncoder().encode('x\r\n'.repeat(22000) + wire(0, '\r\n'));
    for (const chunks of [[bytes], [...bytes].map((byte) => Uint8Array.of(byte))]) {
      const decoder = new AskStreamDecoder();
      expect(() => {
        for (const chunk of chunks) decoder.push(chunk);
      }).toThrow();
    }
  });
});
