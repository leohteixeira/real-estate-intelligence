import type { AuditTraceAcceptedResponse } from '../audit/index.js';
import type { PaginatedResponse } from './pagination.js';
import type { ProvenanceResponse } from './provenance.js';

type Expect<T extends true> = T;
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() => T extends TRight ? 1 : 2 ? true : false;

type RejectsNonJsonPageItem = Expect<Equal<PaginatedResponse<bigint>['items'][number], never>>;

type ComposesWithOrdinaryContractInterface = Expect<
  Equal<ProvenanceResponse<AuditTraceAcceptedResponse>['value'], AuditTraceAcceptedResponse>
>;
