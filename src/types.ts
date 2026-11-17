export interface LinkItem {
  pk: string;              // `LINK#${code}` — the partition key
  sk: string;              // `META` — the sort key
  code: string;
  url: string;
  createdAt: string;
  clicks: number;
  idempotencyKey: string;
}

export interface CreateLinkRequest {
  url: string;
  idempotencyKey: string;
}

export interface CreateLinkResponse {
  code: string;
  shortUrl: string;
  idempotentReplay: boolean;
}
