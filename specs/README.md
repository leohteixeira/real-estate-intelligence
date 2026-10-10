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
| 0003 to 0006 | Persistence, tests, telemetry, frontend toolchain                                      |
| 0007 to 0010 | AI runtime boundary, typed routing, AI resilience, durable runs (0007 supersedes 0002) |
| 0011 to 0013 | Bounded contexts and layout, events and outbox, ports and resilience                   |
| 0014         | Zero Data Retention for every external model route that receives user text             |

The architecture document is a reading of the spec and the ADRs, not a source: when it disagrees
with an accepted ADR, the ADR wins and the document is corrected.

Specifications and user-facing documentation are written in English, like the rest of the
repository: code, identifiers, comments, branch names and commit messages.
