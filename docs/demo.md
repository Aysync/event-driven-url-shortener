# Live demo transcript

Captured 2026-11-17 against the deployed stack
(`https://t4pwz74fp1.execute-api.us-east-1.amazonaws.com`).
Stack destroyed after capture — see `destroy.log`.

## 1. Create a link — 201, replay:false

```bash
curl -s -X POST "$API_URL/links" \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","idempotencyKey":"demo-key-2"}'
```

```json
{"code":"kQz9t-7","shortUrl":"https://t4pwz74fp1.execute-api.us-east-1.amazonaws.com/kQz9t-7","idempotentReplay":false}
```

## 2. Same key, same request — 200, replay:true

```bash
curl -s -X POST "$API_URL/links" \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","idempotencyKey":"demo-key-2"}'
```

```json
{"code":"kQz9t-7","shortUrl":"https://t4pwz74fp1.execute-api.us-east-1.amazonaws.com/kQz9t-7","idempotentReplay":true}
```

Same code. One write. The second request is a replay.

## 3. Follow the short link — 302

```bash
curl -i "$API_URL/kQz9t-7"
```

```
HTTP/2 302
location: https://example.com
```

## 4. Counter increments asynchronously

```bash
aws dynamodb get-item --region us-east-1 \
  --table-name edus-links \
  --key '{"pk":{"S":"LINK#kQz9t-7"},"sk":{"S":"META"}}'
```

```
"clicks": { "N": "1" }
```

The redirect returned 302 before the counter moved. The counter is
eventually consistent; the redirect is not negotiable.
