# ADR-012: Off-Chain Event Storage Strategy

## Status

Proposed

## Context

StellarKraal's event-driven architecture relies on an event listener that captures Soroban contract events (loan lifecycle transitions, collateral registrations, liquidations, etc.) emitted on-chain. These events are the source of truth for downstream features such as activity feeds, analytics, notifications, and reconciliation of on-chain state with the backend database.

Once captured, events must be persisted off-chain. The storage choice has long-term implications:

- **Query performance** — consumers need to filter and paginate events by loan, account, and event type.
- **Data retention** — events accumulate indefinitely and must be retained for audit and reconciliation.
- **Durability & replay** — the listener must be able to resume from a known cursor after downtime without losing or duplicating events.
- **Operational simplicity** — the backend already runs against a relational database (SQLite locally, PostgreSQL in production).

We need a documented decision for how captured events are stored off-chain.

## Decision

Persist captured contract events in a dedicated **`contract_events` table in the existing relational database** (SQLite locally, PostgreSQL in production), rather than introducing a separate message queue or event store.

Each row records the event's identifying and queryable fields (contract ID, ledger sequence, transaction hash, event type, payload, and ingestion timestamp), with a unique constraint on the on-chain event identity to guarantee idempotent ingestion. The listener tracks its last processed ledger so it can resume after downtime.

## Consequences

### Positive

- **No new infrastructure** — reuses the database already provisioned for the backend, keeping local and production setups consistent.
- **Transactional ingestion** — events can be written in the same transaction as related state updates, preserving consistency.
- **Rich querying** — SQL indexes support filtering by loan, account, event type, and time range for feeds and analytics.
- **Idempotency** — a unique constraint on event identity makes replay safe.
- **Auditability** — events are retained alongside the data they describe.

### Negative

- **Table growth** — the events table grows unbounded; a retention/archival policy is required.
- **Write contention** — high event throughput shares the database with application traffic; indexing and batching must be tuned.
- **Limited fan-out** — consumers poll or query the table rather than receiving pushed messages.

### Neutral

- If throughput or fan-out requirements grow beyond what the relational store can serve, a message queue can be layered on top later without changing the source-of-truth table.

## Alternatives Considered

### PostgreSQL events table (chosen)

Store events in a dedicated table in the existing relational database. Simple, transactional, and queryable with familiar tooling. Chosen for its low operational overhead and consistency with the current stack.

### Dedicated message queue (e.g., Kafka, RabbitMQ, SQS)

Publish captured events to a message broker for downstream consumers. Offers high throughput and push-based fan-out, but adds significant operational complexity (broker provisioning, monitoring, delivery guarantees) that is not justified by current volume. Rejected for now; may be revisited if fan-out requirements grow.

### Dedicated event store / append-only log

A purpose-built event store provides strong ordering and replay semantics but introduces another system to operate and learn. Rejected as premature for the current scale.

## References

- [ADR template](template.md)
- Event listener implementation in the backend
