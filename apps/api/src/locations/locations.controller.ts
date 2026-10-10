import { Controller, Get, Inject, NotFoundException, Param, Req } from '@nestjs/common';
import {
  LOCATIONS_FACADE,
  PROPERTIES_FACADE,
  type LocationsFacade,
  type PropertiesFacade,
} from '@rei/application';
import {
  parsePlaceResponse,
  parsePlacesResponse,
  parseReductionsResponse,
  type PlaceResponse,
  type PlacesResponse,
  type ReductionsResponse,
} from '@rei/contracts';
import type { Request } from 'express';
import { readId, readQuery, readResult } from '../http/read-query';

@Controller('places')
export class LocationsController {
  public constructor(
    @Inject(LOCATIONS_FACADE) private readonly locations: LocationsFacade,
    @Inject(PROPERTIES_FACADE) private readonly properties: PropertiesFacade,
  ) {}
  @Get()
  public async roots(@Req() request: Request): Promise<PlacesResponse> {
    readQuery(request, 'none');
    return parsePlacesResponse(await this.locations.roots());
  }
  @Get(':id')
  public async getPlace(@Param('id') id: string, @Req() request: Request): Promise<PlaceResponse> {
    readQuery(request, 'none');
    const result = await this.locations.getPlace(readId(id, 'place'));
    if (result === null) throw new NotFoundException();
    return parsePlaceResponse(result);
  }
  @Get(':id/children')
  public async children(@Param('id') id: string, @Req() request: Request): Promise<PlacesResponse> {
    readQuery(request, 'none');
    const result = await this.locations.children(readId(id, 'place'));
    if (result === null) throw new NotFoundException();
    return parsePlacesResponse(result);
  }
  @Get(':id/largest-reductions')
  public async reductions(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<ReductionsResponse> {
    const result = await readResult(
      this.properties.largestReductions(readId(id, 'place'), readQuery(request, 'page')),
    );
    if (result === null) throw new NotFoundException();
    return parseReductionsResponse(result);
  }
}
