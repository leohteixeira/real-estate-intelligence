import { z } from 'zod';
import type { LanguageModelResult } from './language-model.port';
import { ModelExplanationFailure } from './language-model.port';
import { modelExplanationSettings } from './model-explanation.settings';
export interface GatewayPrivacyEvidence {
  readonly id: string;
  readonly model: string;
  readonly route: 'vercel-ai-gateway';
  readonly policy: 'gateway-zdr-routing-v1';
  readonly verifiedAt: number;
  readonly expiresAt: number;
}
const metadataSchema = z.object({
  gateway: z.object({ routing: z.object({ planningReasoning: z.string().max(2048) }) }),
});
/** Parse the documented gateway routing acknowledgement, never the generated probe text. */
export function verifyGatewayAcknowledgement(
  result: Pick<LanguageModelResult, 'model' | 'route' | 'metadata' | 'warnings'>,
  model: string,
): void {
  const metadata = metadataSchema.safeParse(result.metadata);
  if (
    !metadata.success ||
    result.model !== model ||
    result.route !== modelExplanationSettings.route ||
    result.warnings.length
  )
    throw new ModelExplanationFailure('policy');
  const matches =
    /^ZDR requested: ([1-9][0-9]*) attempts → ([1-9][0-9]*) ZDR attempts\. ZDR execution order: ([a-z0-9-]+\(system\)(?: → [a-z0-9-]+\(system\))*)$/.exec(
      metadata.data.gateway.routing.planningReasoning,
    );
  if (
    !matches ||
    Number(matches[2]) > Number(matches[1]) ||
    Number(matches[2]) !== matches[3]!.split(' → ').length
  )
    throw new ModelExplanationFailure('policy');
}
export function assertGatewayPrivacy(
  evidence: GatewayPrivacyEvidence,
  model: string,
  now: number,
): void {
  if (
    evidence.model !== model ||
    evidence.route !== modelExplanationSettings.route ||
    evidence.policy !== 'gateway-zdr-routing-v1' ||
    !Number.isFinite(evidence.verifiedAt) ||
    !Number.isFinite(evidence.expiresAt) ||
    evidence.verifiedAt > now ||
    evidence.expiresAt <= now ||
    evidence.expiresAt - evidence.verifiedAt !== modelExplanationSettings.evidenceTtlMs ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(evidence.id)
  )
    throw new ModelExplanationFailure('policy');
}

/** Only the documented numeric Gateway scalar is retained; metadata is never returned. */
export function gatewayCostUsd(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object' || !('gateway' in metadata)) return null;
  const gateway = metadata.gateway;
  if (!gateway || typeof gateway !== 'object' || !('cost' in gateway)) return null;
  const cost = gateway.cost;
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null;
}
