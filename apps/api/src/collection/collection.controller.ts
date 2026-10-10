import { Controller, Get, Inject } from '@nestjs/common';
import { COLLECTION_FACADE, type CollectionFacade } from '@rei/application';
import type { EnabledSourceDto, EnabledSourcesResponse } from '@rei/contracts';
import type { EnabledSourceView } from '@rei/domain';

function toDto(source: EnabledSourceView): EnabledSourceDto {
  return {
    sourceId: source.sourceId,
    displayLabel: source.displayLabel,
    enabled: true,
    permissions: {
      collectionAllowed: source.permissions.collectionAllowed,
      imageFetchingAllowed: source.permissions.imageFetchingAllowed,
      listingTextDisplayAllowed: source.permissions.listingTextDisplayAllowed,
    },
    licence: { ...source.licence },
  };
}

@Controller('collection/sources')
export class CollectionController {
  public constructor(@Inject(COLLECTION_FACADE) private readonly collection: CollectionFacade) {}

  @Get()
  public async listEnabledSources(): Promise<EnabledSourcesResponse> {
    const sources = await this.collection.listEnabledSources();
    return { sources: sources.map(toDto) };
  }
}
