# Event-Driven URL Shortener

A serverless URL shortener that costs $0 at rest, survives duplicate delivery,
and counts clicks without ever blocking the redirect.

Built to demonstrate four things a junior/mid cloud role asks about: idempotent
writes, event-driven decoupling, at-least-once delivery, and infrastructure as
code with a disciplined destroy.

## See it work

The stack is deployed on demand and destroyed after each session — the logs are
the proof, not a live URL. That's deliberate: a portfolio project that bills
$40/month to sit idle is a portfolio project nobody wants to hire for.

- [Deploy log](docs/deploy.log) — the full resource plan
- [Demo transcript](docs/demo.md) — real curl output: 201 then 200 on replay,
  302 redirect, counter increments asynchronously
- [Destroy log](docs/destroy.log) — 26 resources, back to zero

## Architecture

```
client ──POST /links──▶ create ──idempotent write──▶ DynamoDB
                                                      ▲
client ──GET /:code──▶ redirect ──302───────┐         │ ADD clicks
                              │              │         │
                              └──event──▶ SQS ──▶ worker ┘
                                            │
                                            └──fail 3×──▶ DLQ
```

**Services:** API Gateway (HTTP API), Lambda (Node 20, three functions),
DynamoDB (on-demand), SQS + DLQ, S3 (deployment artifacts), IAM (one role per
function), Budgets. All managed by Terraform.

## The three decisions that mattered

**1. The lock is on the idempotency row, not the link row.**
A client sends a UUID with every create. The conditional write
(`attribute_not_exists(pk)`) runs on `IDEMP#<key>`, so two concurrent calls with
the same key race on the same row regardless of the short code they carry.
Exactly one wins; the loser re-reads the winner's row and returns it. No
distributed lock service — DynamoDB is the lock.

**2. Redirect never waits on the counter.**
`GET /:code` returns 302 immediately and fires the click event to SQS inside a
try/catch. If the queue is down, the redirect still works. The counter is
eventually consistent; the redirect is not negotiable.

**3. At-least-once is assumed, not wished away.**
SQS redelivers. The counter uses `ADD clicks :one`, atomic and safe to repeat.
For exact-once counting you'd key on `messageId` in a separate table; for a view
counter that complexity isn't earned.

## What broke and how I found it

Three real bugs, found by deploying, not by reading.

**The lock was on the wrong row.** The first version put the conditional write
on `LINK#<code>`. Two concurrent creates with the same idempotency key but
different codes produced two links — the lock was on different rows, so both
writes passed. `test/idempotency.test.ts` failed with `expected 1, received 0`
replays. Fix: move the conditional write to `IDEMP#<key>`, making the
idempotency row the lock and the link row a side effect of winning it. This is
the exact failure mode production idempotency systems ship with.

**`Cannot use import statement outside a module`.** First deploy returned 500.
Logs named the cause: the compiled handlers use ES module syntax, but the Lambda
zip had no `package.json` declaring `"type": "module"`, so Node defaulted to
CommonJS. Fix: the build writes `dist/package.json` with `{"type":"module"}` so
it rides along in the artifact.

**`Cannot find package 'nanoid'`.** Second deploy, same shape: the Lambda
runtime bundles the AWS SDK but not third-party packages, and the zip contained
only compiled output — no `node_modules`. Fix: esbuild bundles each handler into
a single file, with `--external:@aws-sdk/*` so the SDK stays in the runtime and
the zip stays ~30KB.

## Deploy

Prerequisites: Node 20+, Terraform 1.6+, AWS credentials with permission to
create the resources above, a billing alert already in place.

```bash
# 1. Build — this must run before every apply; archive_file zips dist/
npm install
npm run build

# 2. Configure
cd infra
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars: set budget_email

# 3. Deploy
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# 4. Capture outputs
terraform output api_url

# 5. Tear down when finished — this is not optional
terraform destroy
```

Budget alert: `infra/budget.tf` creates a monthly budget with an 80% actual-spend
notification. AWS emails a confirmation link after apply — **click it**, or the
notification is silent.

## Cost

$0/month at rest. Lambda free tier is permanent; DynamoDB is on-demand; SQS has
a permanent free tier; API Gateway is free for 12 months. The only resource that
bills while idle is the budget alert, which is free for the first two per
account.

The `terraform destroy` log confirms a full teardown: 26 resources, zero
remaining.

## What I'd do differently at scale

- **Build and apply in one pipeline.** Currently `npm run build` is a manual
  step before `terraform apply`, and a stale `dist/` is a real footgun. In
  production this is a GitHub Actions workflow with OIDC, so the zip is never
  stale and there are no long-lived credentials.
- **CloudFront in front of the redirect path** to cache hot links and absorb
  traffic before it reaches Lambda.
- **Exact-once counter** via `messageId` key, if analytics-grade accuracy ever
  mattered.
- **Click analytics in Athena over S3** rather than a DynamoDB counter, if the
  volume grew past what a single item can absorb.
- **Split the flat Terraform into modules** (`network`, `lambda`, `data`) once
  a second environment exists — flat is right for one stack, wrong for three.
