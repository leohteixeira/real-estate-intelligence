import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ASK_LIVE_FACADE,
  MARKET_CALCULATION_FACADE,
  type AskLiveFacade,
  type MarketCalculationFacade,
} from '@rei/application';
import { parsePriceToolReceipt, parsePriceToolRequest } from '@rei/contracts';
import type { Request } from 'express';
import { liveAuthorized, strongAskBearer } from './ask-live.controller';
import { askRequestWork } from './ask-request-signal';
@Controller('ask/runs/:id/tools')
export class AskToolController {
  public constructor(
    @Inject(ASK_LIVE_FACADE) private readonly live: AskLiveFacade,
    @Inject(MARKET_CALCULATION_FACADE) private readonly market: MarketCalculationFacade,
  ) {}
  @Post('price-per-square-meter')
  @HttpCode(200)
  public async price(@Param('id') id: string, @Body() body: unknown, @Req() request: Request) {
    const grant = strongAskBearer(request.headers.authorization);
    let input;
    try {
      input = parsePriceToolRequest(body);
      if (input.runId !== id) throw new Error();
    } catch {
      throw new BadRequestException();
    }
    return parsePriceToolReceipt(
      await askRequestWork(request, (signal) =>
        liveAuthorized(() =>
          this.live.tool(
            input,
            grant,
            (at) => this.market.pricePerSquareMeter(input.inputs, at),
            signal,
          ),
        ),
      ),
    );
  }
}
