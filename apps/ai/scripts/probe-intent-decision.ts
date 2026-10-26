/** Explicitly opt-in provider compatibility probe using fixed public fixture text only. */
import { GatewayIntentDecider } from '../dist/models/intent-decider.js';
if (!process.argv.includes('--live')) {
  console.info('Opt in with --live after building @rei/ai and supplying AI_GATEWAY_API_KEY.');
  process.exit(0);
}
if (!process.env.AI_GATEWAY_API_KEY) throw new Error('AI_GATEWAY_API_KEY is required.');
const controller = new AbortController();
const decider = new GatewayIntentDecider(process.env.AI_GATEWAY_API_KEY);
const queries = [
  ['en', 'Calculate price per square meter for BRL 785,000.00 and 68 square meters.'],
  ['pt-BR', 'Qual é o preço por metro quadrado de R$ 785.000,00 e 68 m²?'],
] as const;
for (const [locale, query] of queries) {
  const decision = await decider.decide(query, locale, controller.signal, Date.now() + 10000);
  console.info(
    JSON.stringify({
      taxonomyVersion: decision.taxonomyVersion,
      locale,
      intent: decision.intent,
      probability: decision.probability,
      source: decision.source,
      privacyVerified: decision.privacyEvidenceId !== null,
    }),
  );
}
