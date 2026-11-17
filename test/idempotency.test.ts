import { describe, it, expect, beforeAll } from "vitest";
import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createIdempotent } from "../src/lib/idempotency.js";

const endpoint = process.env.DDB_ENDPOINT ?? "http://localhost:8000";
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    endpoint,
    region: "us-east-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  })
);

beforeAll(async () => {
  try {
    await ddb.send(
      new CreateTableCommand({
        TableName: "links",
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      })
    );
  } catch {
    // already exists from a previous run
  }
});

describe("createIdempotent", () => {
  it("returns the same link for the same key", async () => {
    const key = crypto.randomUUID();
    const first = await createIdempotent(ddb, "abc1234", "https://a.com", key);
    const second = await createIdempotent(ddb, "xyz9999", "https://b.com", key);

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.item.code).toBe("abc1234");
    expect(second.item.url).toBe("https://a.com");
  });

  it("survives a concurrent double-write", async () => {
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      createIdempotent(ddb, "race001", "https://a.com", key),
      createIdempotent(ddb, "race002", "https://b.com", key),
    ]);
    const replays = [a.replay, b.replay].filter(Boolean).length;
    expect(replays).toBe(1);
    expect(a.item.code).toBe(b.item.code);
  });
});
