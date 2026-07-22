# LinkedOut local documentation index

This directory contains internal product, architecture, contract, research, and operations
narratives as of backend/frontend 1.1.4 (2026-07-23). Current Markdown authorities are committed;
local environment material remains ignored.

## Authority order

When two documents differ, use this order:

1. Runtime Zod schemas in the root `packages/contracts` exports
2. Generated `/v1/openapi.json`
3. `docs/api-contract-v1.md` and its `contract.md` reading mirror for behavioral rules
4. `ARCHITECTURE.md` and `RUNBOOK.md` for implementation and operations
5. `CONTEXT.md` and accepted entries in `PRODUCT-FLOW-QUESTIONS.md` for approved future product language and direction
6. Product/research/ADR documents for older intent and deferred decisions

## Document status

| Document | Status | Purpose |
|---|---|---|
| `NEXT-STEPS-PLAN.md` | Historical delivery plan | Earlier handoff for Builders Helped, reactions, Search/Saved navigation, and live grouped search |
| `NEXT-STEPS-PLAN-1.1.4.md` | Parts 6–8 implemented | Delivery record for removing Journey/Collections, reducing L types, and introducing Current chapter |
| `PRODUCT-FLOW-QUESTIONS.md` | Historical discovery snapshot | Questions raised on 2026-07-21; 1.1.4 supersedes its Journey, Collection, profile-tab, L-type, and reputation observations |
| `CONTEXT.md` | Current accepted product language | Canonical definitions agreed during product discovery; contains no implementation details |
| `product.md` | Current product vision | Product language, principles, and shipped MVP scope; not a wire contract |
| `ARCHITECTURE.md` | Current | Implemented backend/frontend topology, layers, data, privacy, auth, and verification |
| `RUNBOOK.md` | Current | Local v1 startup, OAuth, smoke flow, verification, and maintenance commands |
| `claude.md` | Current | Internal ownership and engineering rules |
| `contract.md` | Current mirror | Convenience copy of the canonical public v1 narrative |
| `docs/api-contract-v1.md` | Current canonical narrative | Accepted and implemented v1 behavior, incl. email/password + OTP auth (§0.1, feature 1.1.3) |
| `docs/contract-01-status.md` | Complete status record | CONTRACT-01A and CONTRACT-01B implemented and verified |
| `docs/operations/maintenance-cleanup.md` | Current | Cleanup job behavior and production safety runbook |
| `docs/adr/0001-auth-session-topology.md` | Accepted, backend lifecycle implemented | Target BFF/`lo_sid` topology, trust split, and remaining browser acceptance criteria |
| `docs/research/feed-discovery-sidebars.md` | Historical research | Input to the sidebar contract; superseded by the accepted v1 contract where different |

The tracked `docs/` tree was retired after 1.1.0. Runtime schemas and generated OpenAPI remain the
contract authority; this directory keeps the longer internal narratives.

Feature 1.1.3 (email/password + 8-digit OTP sign-in, 2026-07-22, branch `feed-email-login`) is
folded into the contract above: see `docs/api-contract-v1.md` §0.1 and its `contract.md` mirror,
`ARCHITECTURE.md`'s Authentication section, and the tracked backend handoff notes at the repo root
(`docs/email-auth-backend.md`, `docs/research/email-otp-auth.md`). The frontend screens live in
`apps/web` and complete sign-in through the existing OAuth handoff route (handoff mode only).
