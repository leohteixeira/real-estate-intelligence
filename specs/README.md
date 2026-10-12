# Specifications — Real Estate Intelligence

The product brief this repository originated from lives in the meta-workspace, under
`/workspace/docs/`. The versioned product specification kept **next to the code** is the BMad spec:
a kernel with its architecture, UX and listing-sources companions. This directory holds the
architecture decisions.

## Structure

```text
_bmad-output/
└── initiative-real-estate-intelligence/
    └── spec-real-estate-intelligence/   # product specification and its companions
specs/
└── adrs/                                # architecture decisions
docs/
└── architecture/
    └── architecture.html                # the architecture, drawn: opens in a browser, no build
```

## ADRs

`adrs/` holds the architecture decisions already taken. Every material decision about a framework,
persistence, telemetry or toolchain needs an ADR before it becomes code.

| ADRs         | Subject                                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| 0001         | The record itself                                                                      |
| 0003 to 0005 | Persistence, tests and telemetry                                                       |
| 0006         | Superseded frontend toolchain and TypeScript 5.9 decision                              |
| 0007 to 0010 | AI runtime boundary, typed routing, AI resilience, durable runs (0007 supersedes 0002) |
| 0011 to 0013 | Bounded contexts and layout, events and outbox, ports and resilience                   |
| 0014         | Zero Data Retention for every external model route that receives user text             |
| 0015         | Collected-data allowlist, permissions, snapshots, photographs and suppression          |
| 0016         | TypeScript 6 toolchain and retained frontend choices (supersedes 0006)                 |
| 0017 to 0020 | Delivery retention, snapshot retention/reconciliation, and typed Vitest integration    |
| 0021         | Event-fed Market median and explicit staged read provenance                            |
| 0022         | Causal property membership and complete Market price facts                             |
| 0023         | Structured Ask tracer, API-owned state and scoped execution authority                  |
| 0024         | Deterministic text-price admission and typed input refusals                            |
| 0025         | Run-scoped remote graph checkpoints, fenced grants and bounded retention               |
| 0026         | FIFO admission, three pending runs and truthful queued expiry                          |
| 0027         | Versioned receipt-bound model explanations and pre-transmission privacy                |

The architecture document is a reading of the spec and the ADRs, not a source: when it disagrees
with an accepted ADR, the ADR wins and the document is corrected.

The [Ask checkpoint protocol reference](../docs/api/ask-checkpoints.md) documents the
implemented internal transport and recovery/retention boundaries of ADR 0025.

Specifications and user-facing documentation are written in English, like the rest of the
repository: code, identifiers, comments, branch names and commit messages.
