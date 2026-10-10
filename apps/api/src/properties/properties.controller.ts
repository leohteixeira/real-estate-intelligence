import { Controller, Get, Inject, NotFoundException, Param, Req } from '@nestjs/common';
import { PROPERTIES_FACADE, type PropertiesFacade } from '@rei/application';
import {
  parseListingResponse,
  parsePropertyResponse,
  parseSearchResponse,
  type ListingResponse,
  type PropertyResponse,
  type SearchResponse,
} from '@rei/contracts';
import type { Request } from 'express';
import { readId, readQuery, readResult } from '../http/read-query';

@Controller('properties')
export class PropertiesController {
  public constructor(@Inject(PROPERTIES_FACADE) private readonly properties: PropertiesFacade) {}
  @Get()
  public async search(@Req() request: Request): Promise<SearchResponse> {
    return parseSearchResponse(
      await readResult(this.properties.search(readQuery(request, 'search'))),
    );
  }
  @Get(':id')
  public async getProperty(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<PropertyResponse> {
    readQuery(request, 'none');
    const result = await this.properties.getProperty(readId(id, 'uuid'));
    if (result === null) throw new NotFoundException();
    return parsePropertyResponse(result);
  }
}
@Controller('listings')
export class ListingsController {
  public constructor(@Inject(PROPERTIES_FACADE) private readonly properties: PropertiesFacade) {}
  @Get(':id')
  public async getListing(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<ListingResponse> {
    readQuery(request, 'none');
    const result = await this.properties.getListing(readId(id, 'uuid'));
    if (result === null) throw new NotFoundException();
    return parseListingResponse(result);
  }
}
