import {
  AskLiveError,
  type ModelExplanationRepository,
  type TransactionRunner,
} from '@rei/application';
import { sameModelExplanation, validModelExplanation } from '@rei/domain';
import {
  parseModelExplanation,
  parseModelExplanationRequest,
  parseModelExplanationResponse,
  parsePriceToolReceipt,
  type ModelExplanationRequest,
  type ModelExplanationResponse,
  type ModelAttemptReservation,
} from '@rei/contracts';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { authorizeAskExecution, lockAskThread } from './ask-execution.authorization.js';

export class PostgresModelExplanationRepository implements ModelExplanationRepository {
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly transactions: TransactionRunner,
  ) {}
  public async execute(
    untrusted: ModelExplanationRequest,
    grant: string,
    signal: AbortSignal,
  ): Promise<ModelExplanationResponse> {
    let request: ModelExplanationRequest;
    try {
      request = structuredClone(parseModelExplanationRequest(untrusted));
    } catch {
      throw new AskLiveError('invalid');
    }
    try {
      return await this.transactions.runInTransaction(async (tx) => {
        const client = postgresClientFor(tx, this.connection);
        await lockAskThread(client, request.threadId);
        const run = await authorizeAskExecution(client, request, { scope: 'checkpoint', grant });
        if (run.basis !== 'text-price-explanation-v1') throw new AskLiveError('forbidden');
        const accepted = await client.query<{ document: unknown }>(
          'SELECT document FROM ask.model_explanation WHERE run_id=$1',
          [request.runId],
        );
        if (request.operation === 'get')
          return parseModelExplanationResponse({
            operation: 'get',
            explanation: accepted[0] ? parseModelExplanation(accepted[0].document) : null,
          });
        if (request.operation === 'reserve') {
          if (accepted[0]) throw new AskLiveError('conflict');
          const previous = await client.query<{ document: unknown; execution_id: string }>(
            'SELECT document,execution_id::text FROM ask.model_attempt WHERE run_id=$1 AND attempt_key=$2',
            [request.runId, request.attemptKey],
          );
          if (previous[0]) {
            const response = parseModelExplanationResponse({
              operation: 'reserve',
              reservation: previous[0].document,
            });
            if (
              response.operation !== 'reserve' ||
              previous[0].execution_id !== request.executionId ||
              response.reservation.model !== request.model ||
              response.reservation.route !== request.route ||
              response.reservation.purpose !== request.purpose ||
              response.reservation.maxOutputTokens !== request.maxOutputTokens
            )
              throw new AskLiveError('conflict');
            return response;
          }
          const totals = await client.query<{ total: number }>(
            'SELECT COALESCE(sum(max_output_tokens),0)::integer AS total FROM ask.model_attempt WHERE run_id=$1',
            [request.runId],
          );
          const total = totals[0]!.total + request.maxOutputTokens;
          if (total > 1000) throw new AskLiveError('invalid');
          const ids = await client.query<{ id: string }>('SELECT uuidv7()::text AS id');
          const reservation: ModelAttemptReservation = {
            reservationId: ids[0]!.id,
            attemptKey: request.attemptKey,
            purpose: request.purpose,
            model: request.model,
            route: request.route,
            maxOutputTokens: request.maxOutputTokens,
            reservedTotal: total,
          };
          await client.query(
            'INSERT INTO ask.model_attempt(run_id,id,attempt_key,execution_id,max_output_tokens,document) VALUES ($1,$2,$3,$4,$5,$6)',
            [
              request.runId,
              reservation.reservationId,
              request.attemptKey,
              request.executionId,
              request.maxOutputTokens,
              reservation,
            ],
          );
          return { operation: 'reserve', reservation };
        }
        const supplied = request.explanation;
        if (accepted[0]) {
          const previous = parseModelExplanation(accepted[0].document);
          if (!sameModelExplanation(previous, supplied)) throw new AskLiveError('conflict');
          return { operation: 'accept', explanation: previous };
        }
        const receipts = await client.query<{ document: unknown }>(
          'SELECT document FROM ask.tool_receipt WHERE run_id=$1',
          [request.runId],
        );
        if (!receipts[0]) throw new AskLiveError('forbidden');
        const receipt = parsePriceToolReceipt(receipts[0].document);
        if (
          receipt.executionId !== request.executionId ||
          !validModelExplanation(supplied, receipt, run.locale)
        )
          throw new AskLiveError('forbidden');
        const attempts = await client.query<{ document: unknown; execution_id: string }>(
          'SELECT document,execution_id::text FROM ask.model_attempt WHERE run_id=$1 AND id=$2',
          [request.runId, supplied.reservationId],
        );
        if (!attempts[0]) throw new AskLiveError('forbidden');
        const attempt = parseModelExplanationResponse({
          operation: 'reserve',
          reservation: attempts[0].document,
        });
        if (
          attempt.operation !== 'reserve' ||
          attempts[0].execution_id !== request.executionId ||
          attempt.reservation.purpose !== 'explanation' ||
          attempt.reservation.model !== supplied.model ||
          attempt.reservation.route !== supplied.route ||
          supplied.outputTokens > attempt.reservation.maxOutputTokens
        )
          throw new AskLiveError('forbidden');
        await client.query(
          'INSERT INTO ask.model_explanation(run_id,id,tool_receipt_id,reservation_id,document) VALUES ($1,$2,$3,$4,$5)',
          [
            request.runId,
            supplied.explanationId,
            supplied.toolReceiptId,
            supplied.reservationId,
            supplied,
          ],
        );
        return { operation: 'accept', explanation: supplied };
      }, signal);
    } catch (error) {
      if (signal.aborted || error instanceof AskLiveError) throw error;
      throw new AskLiveError(error instanceof TypeError ? 'invalid' : 'unavailable');
    }
  }
}
