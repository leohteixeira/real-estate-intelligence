import { describe, expect, it } from 'vitest';
import { verifyGatewayAcknowledgement } from './gateway-privacy.verifier';
import { acknowledged } from './model-test.fixture';

const model = 'anthropic/claude-haiku-5.5';
const observed =
  'System credentials planned for: anthropic, bedrock, vertexAnthropic, claudeaws. ZDR requested: all 4 attempts support ZDR. Execution order: anthropic(system) → bedrock(system) → vertexAnthropic(system) → claudeaws(system)';
function evidence(reasoning: string) {
  return {
    ...acknowledged(model),
    metadata: { gateway: { routing: { planningReasoning: reasoning } } },
  };
}
describe('Gateway privacy acknowledgement', () => {
  it('accepts the observed complete all-attempts system grammar and keeps numeric filtering support', () => {
    expect(() => verifyGatewayAcknowledgement(evidence(observed), model)).not.toThrow();
    expect(() => verifyGatewayAcknowledgement(acknowledged(model), model)).not.toThrow();
    expect(() =>
      verifyGatewayAcknowledgement(
        evidence(
          'ZDR requested: 4 attempts → 2 ZDR attempts. ZDR execution order: anthropic(system) → bedrock(system)',
        ),
        model,
      ),
    ).not.toThrow();
  });
  it.each([
    '',
    observed + '.',
    'OK: ' + observed,
    observed + '\n',
    observed.replace('all 4', 'all 0'),
    observed.replace('all 4', 'all 3'),
    observed.replace('all 4', 'all 9007199254740993'),
    observed.replace('support ZDR', 'do not support ZDR'),
    observed.replace('bedrock(system)', 'bedrock(byok)'),
    observed.replace('vertexAnthropic(system)', 'vertexanthropic(system)'),
    observed.replace('claudeaws(system)', 'other(system)'),
    observed.replace('anthropic, bedrock', 'anthropic, anthropic'),
    observed.replace('anthropic(system) → bedrock(system)', 'bedrock(system) → anthropic(system)'),
    observed.replace(' → claudeaws(system)', ''),
    'ZDR requested: 1 attempts → 0 ZDR attempts. ZDR execution order: anthropic(system)',
    'ZDR requested: 1 attempts → 2 ZDR attempts. ZDR execution order: anthropic(system) → bedrock(system)',
  ])('rejects malformed, negative, inconsistent or non-system evidence %s', (reasoning) => {
    expect(() => verifyGatewayAcknowledgement(evidence(reasoning), model)).toThrow();
  });
  it('rejects wrong identity, warnings and generated prose as evidence', () => {
    expect(() =>
      verifyGatewayAcknowledgement({ ...evidence(observed), model: 'different' }, model),
    ).toThrow();
    const wrongRoute = evidence(observed);
    Reflect.set(wrongRoute, 'route', 'different');
    expect(() => verifyGatewayAcknowledgement(wrongRoute, model)).toThrow();
    expect(() =>
      verifyGatewayAcknowledgement({ ...evidence(observed), warnings: [{}] }, model),
    ).toThrow();
    expect(() =>
      verifyGatewayAcknowledgement({ ...acknowledged(model, observed), metadata: {} }, model),
    ).toThrow();
  });
});
