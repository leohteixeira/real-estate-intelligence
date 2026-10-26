import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  parseRoutedAskAccepted,
  parseAskLiveEvent,
  parseAskLiveRun,
} from '../../packages/contracts/dist/index.js';
import { EventStreamDecoder } from '../../apps/web/src/ask/ask-stream.ts';
import { requestHttp } from '../support/http.ts';

const base = 'https://leohteixeira.com/real-estate-intelligence/api/v1';
const output = process.argv[2];
if (!output) throw new Error('Supply a protected evidence JSON output path.');
const startedAt = new Date().toISOString();
const traceId = randomBytes(16).toString('hex');
const headers = {
  Authorization: `Bearer ${randomBytes(32).toString('base64url')}`,
  'Idempotency-Key': randomBytes(24).toString('base64url'),
  traceparent: `00-${traceId}-${randomBytes(8).toString('hex')}-01`,
};
const response = await requestHttp(`${base}/runs`, {
  method: 'POST',
  headers,
  body: {
    mode: 'routed-text-v1',
    threadId: null,
    placeId: null,
    query: 'What is the price per square meter for BRL 785,000.00 and 68 square meters?',
    locale: 'en',
  },
});
const acceptedBody = await response.json();
await writeFile(
  output,
  JSON.stringify({ startedAt, traceId, status: response.status, acceptedBody }, null, 2),
);
if (response.status !== 202) throw new Error(`Admission HTTP ${response.status}`);
const accepted = parseRoutedAskAccepted(acceptedBody);
const stream = await requestHttp(`${base}/runs/${accepted.runId}/events`, { headers });
if (stream.status !== 200 || !stream.headers.get('content-type')?.startsWith('text/event-stream'))
  throw new Error(`SSE HTTP ${stream.status}`);
const decoder = new EventStreamDecoder(parseAskLiveEvent);
const events = decoder.push(new TextEncoder().encode(await stream.text())).map((v) => v.frame);
decoder.finish();
const snapshot = await requestHttp(`${base}/runs/${accepted.runId}`, { headers });
const snapshotBody = await snapshot.json();
await writeFile(
  output,
  JSON.stringify(
    { startedAt, traceId, accepted, events, snapshotStatus: snapshot.status, snapshotBody },
    null,
    2,
  ),
);
if (snapshot.status !== 200) throw new Error(`Snapshot HTTP ${snapshot.status}`);
const run = parseAskLiveRun(snapshotBody);
if (
  events.length === 0 ||
  events.some((e, index) => e.runId !== accepted.runId || e.sequence !== index + 1)
)
  throw new Error('Missing, unordered or mismatched public events.');
const terminal = events.at(-1)!;
if (
  events.filter((e) => e.terminal).length !== 1 ||
  !terminal.terminal ||
  terminal.event !== 'ask.completed'
)
  throw new Error('Run did not explicitly complete.');
if (
  run.basis !== 'routed-text-v1' ||
  run.id !== accepted.runId ||
  run.threadId !== accepted.threadId ||
  run.state !== 'completed' ||
  JSON.stringify(run) !== JSON.stringify(terminal.run)
)
  throw new Error('Persisted snapshot and terminal disagree.');
if (
  run.result?.kind !== 'price_per_square_meter' ||
  run.result.minorUnits !== Math.round(78_500_000 / 68) ||
  run.result.currency !== 'BRL' ||
  run.result.areaUnit !== 'm2' ||
  run.result.inputs.priceMinorUnits !== 78_500_000 ||
  run.result.inputs.areaSquareMeters !== 68 ||
  run.decision?.intent !== 'price_per_square_meter'
)
  throw new Error('Incorrect deterministic result or decision.');
await writeFile(
  output,
  JSON.stringify(
    {
      result: 'passed',
      deliveredSource: 'b570a09427bea39ea03d4dda93c7dc0e0c502899',
      startedAt,
      completedAt: new Date().toISOString(),
      traceId,
      accepted,
      events,
      snapshot: run,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    result: 'passed',
    runId: run.id,
    traceId,
    frames: events.length,
    minorUnits: run.result.minorUnits,
    decisionSource: run.decision.source,
    degraded: run.decision.degraded,
    output,
  }),
);
