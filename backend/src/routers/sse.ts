// lib/sse-broker.ts
import * as express from 'express';

type ClientSet = Set<express.Response>;

const g = global as any;
if (!g.__SSE_SUBSCRIBERS__) g.__SSE_SUBSCRIBERS__ = new Map<string, ClientSet>();
const subscribers: Map<string, ClientSet> = g.__SSE_SUBSCRIBERS__;

export function sseKey(datasetId: string, accKey: string) {
  return `${datasetId}::${accKey}`;
}

export function subscribeSSE(res: express.Response, key: string) {
  let set = subscribers.get(key);
  if (!set) { set = new Set(); subscribers.set(key, set); }
  set.add(res);
  console.log('[SSE] subscribe', key, 'count=', set.size);
}

export function unsubscribeSSE(res: express.Response, key: string) {
  const set = subscribers.get(key);
  if (!set) return;
  set.delete(res);
  if (!set.size) subscribers.delete(key);
  console.log('[SSE] unsubscribe', key, 'remaining=', set.size);
}

export function publishSSE(key: string, event: string, payload: any) {
  const set = subscribers.get(key);
  console.log('[SSE] publish', event, 'key=', key, 'subs=', set?.size ?? 0);
  if (!set || !set.size) return;
  const data = JSON.stringify(payload);
  set.forEach((res) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${data}\n\n`);
  });
}
