import {
  GatewayIntentDecider,
  DegradedIntentDecider,
  INTENT_DECIDER,
  type IntentDecider,
} from '../models/intent-decider';
import { HttpIntentDecisionAdapter } from '../models/http-intent-decision.adapter';
import { Module } from '@nestjs/common';

import { NO_OP_GRAPH, noOpGraphProvider } from './no-op.graph';
import { PRICE_GRAPH } from './price-per-square-meter.graph';
import { PriceGraphFactory } from './price-graph.factory';
import { HttpGraphCheckpointAdapter } from './http-graph-checkpoint.adapter';
import { ResilientGraphCheckpointAdapter } from './resilient-graph-checkpoint.adapter';
import { GraphCheckpointFailure } from './graph-checkpoint.port';
import { readConfig } from '../config';
import { PRICE_TOOL, type PricePerSquareMeterTool } from '../tools/price-per-square-meter.port';
import { ToolsModule } from '../tools/tools.module';
import { LANGUAGE_MODEL, type LanguageModel } from '../models/language-model.port';
import { GatewayLanguageModelAdapter } from '../models/gateway-language-model.adapter';
import { ReceiptModelExplainer } from '../models/receipt-model-explainer';
import { HttpModelExplanationAdapter } from '../models/http-model-explanation.adapter';
import { ModelExplanationFailure } from '../models/language-model.port';
import { ModelPolicyTelemetry } from '../models/model-telemetry';

@Module({
  imports: [ToolsModule],
  providers: [
    ModelPolicyTelemetry,
    noOpGraphProvider,
    {
      provide: INTENT_DECIDER,
      useFactory: () =>
        new DegradedIntentDecider(new GatewayIntentDecider(readConfig(process.env).gatewayApiKey)),
    },
    {
      provide: LANGUAGE_MODEL,
      useFactory: () => new GatewayLanguageModelAdapter(readConfig(process.env).gatewayApiKey),
    },
    {
      provide: PRICE_GRAPH,
      inject: [PRICE_TOOL, LANGUAGE_MODEL, INTENT_DECIDER],
      useFactory: (tool: PricePerSquareMeterTool, model: LanguageModel, decider: IntentDecider) => {
        const origin = readConfig(process.env).apiBaseUrl;
        return new PriceGraphFactory(
          tool,
          origin
            ? new ResilientGraphCheckpointAdapter(new HttpGraphCheckpointAdapter(origin))
            : { execute: () => Promise.reject(new GraphCheckpointFailure('rejected')) },
          new ReceiptModelExplainer(
            model,
            origin
              ? new HttpModelExplanationAdapter(origin)
              : { execute: () => Promise.reject(new ModelExplanationFailure('policy')) },
          ),
          decider,
          origin
            ? new HttpIntentDecisionAdapter(origin)
            : { execute: () => Promise.reject(new ModelExplanationFailure('policy')) },
        );
      },
    },
  ],
  exports: [NO_OP_GRAPH, PRICE_GRAPH, LANGUAGE_MODEL],
})
export class GraphModule {}
