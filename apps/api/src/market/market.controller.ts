import { Controller, Get, Inject, NotFoundException, Param, Req } from '@nestjs/common';
import { MARKET_FACADE, type MarketFacade } from '@rei/application';
import {
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketResponse,
  parsePlaceMarketSeriesResponse,
  type PlaceMarketNeighboursResponse,
  type PlaceMarketResponse,
  type PlaceMarketSeriesResponse,
} from '@rei/contracts';
import type { Request } from 'express';
import { readId, readQuery, readResult } from '../http/read-query';

@Controller('places/:id/market')
export class MarketController {
  public constructor(@Inject(MARKET_FACADE) private readonly market: MarketFacade) {}
  @Get()
  public async overview(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<PlaceMarketResponse> {
    readQuery(request, 'none');
    const result = await readResult(this.market.getPlaceMarket(readId(id, 'place')));
    if (result === null) throw new NotFoundException();
    return parsePlaceMarketResponse(result);
  }
  @Get('neighbours')
  public async neighbours(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<PlaceMarketNeighboursResponse> {
    readQuery(request, 'none');
    const result = await readResult(this.market.neighbours(readId(id, 'place')));
    if (result === null) throw new NotFoundException();
    return parsePlaceMarketNeighboursResponse(result);
  }
  @Get('monthly-series')
  public async monthlySeries(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<PlaceMarketSeriesResponse> {
    readQuery(request, 'none');
    const result = await readResult(this.market.monthlySeries(readId(id, 'place')));
    if (result === null) throw new NotFoundException();
    return parsePlaceMarketSeriesResponse(result);
  }
}
