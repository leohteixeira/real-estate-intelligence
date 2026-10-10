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

The architecture document is a reading of the spec and the ADRs, not a source: when it disagrees
with an accepted ADR, the ADR wins and the document is corrected.

Specifications and user-facing documentation are written in English, like the rest of the
repository: code, identifiers, comments, branch names and commit messages.
