# Event-Driven URL Shortener

A serverless URL shortener that costs $0 at rest, survives duplicate delivery,
and counts clicks without ever blocking the redirect.

## Architecture
client ──POST /links──▶ create ──idempotent write──▶ DynamoDB
▲
client ──GET /:code──▶ redirect ──302───────┐ │ ADD clicks
│ │ │
└──event──▶ SQS ──▶ worker ┘
│
└──fail──▶ DLQ

## The three decisions that mattered

**1. The lock is on the idempotency row, not the link row.**
Client sends a UUID with every create. The conditional write
(`attribute_not_exists(pk)`) runs on `IDEMP#<key>`, so two concurrent calls with
the same key race on the same row regardless of the short code they carry.
Exactly one wins. The loser re-reads the winner's row and returns it.

**2. Redirect never waits on the counter.**
`GET /:code` returns 302 immediately and fires the click event to SQS in a
try/catch. If the queue is down, the redirect still works. The counter is
eventually consistent; the redirect is not negotiable.

**3. At-least-once is assumed, not wished away.**
SQS redelivers. The counter uses `ADD clicks :one`, which is atomic and safe to
repeat. If exact counts mattered, the handler would key on `messageId` in a
separate table. For a view counter, that complexity isn't earned.

## The bug the concurrent test caught

The first version put the conditional write on `LINK#<code>`. Two concurrent
creates with the same idempotency key but different codes produced **two
links** — the lock was on different rows, so both writes passed.

`test/idempotency.test.ts` failed with `expected 1, received 0` replays. The
fix moved the conditional write to `IDEMP#<key>`, making the idempotency row
the lock and the link row a side effect of winning it.

This is the exact failure mode idempotency systems ship with. The test is the
reason it isn't in this repo.

## Deploy

(filled in next commit — Terraform)

## Cost

$0/month at rest. Lambda free tier is permanent; DynamoDB is on-demand;
SQS has a permanent free tier; API Gateway is free for 12 months.

## What I'd do differently at scale

- CloudFront in front of the redirect path to cache hot links
- Exact-once counter via `messageId` key
- Click analytics in Athena over S3 instead of a DynamoDB counter
- DAX if read latency on redirect becomes the bottleneck
