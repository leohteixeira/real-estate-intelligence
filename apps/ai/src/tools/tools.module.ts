import { Module } from '@nestjs/common';
import { readConfig } from '../config';
import {
  PRICE_TOOL,
  PriceToolFailure,
  type PricePerSquareMeterTool,
} from './price-per-square-meter.port';
import { HttpPricePerSquareMeterTool } from './http-price-per-square-meter.tool';
import { ResilientPricePerSquareMeterTool } from './resilient-price-per-square-meter.tool';
import { PriceToolTelemetry } from './price-tool.telemetry';
@Module({
  providers: [
    PriceToolTelemetry,
    {
      provide: PRICE_TOOL,
      useFactory: (): PricePerSquareMeterTool => {
        const config = readConfig(process.env);
        if (!config.apiBaseUrl) return { calculate: () => Promise.reject(new PriceToolFailure()) };
        return new ResilientPricePerSquareMeterTool(
          new HttpPricePerSquareMeterTool(config.apiBaseUrl),
        );
      },
    },
  ],
  exports: [PRICE_TOOL],
})
export class ToolsModule {}
