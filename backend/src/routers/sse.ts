// lib/sse-broker.ts
import * as express from 'express';

type ClientSet = Set<express.Response>;
const subscribers = new Map<string, ClientSet>();

export function sseKey(datasetId: string, accKey: string) {
  return `${datasetId}::${accKey}`;
}

export function subscribeSSE(res: express.Response, key: string) {
  let set = subscribers.get(key);
  if (!set) { set = new Set(); subscribers.set(key, set); }
  set.add(res);
}

export function unsubscribeSSE(res: express.Response, key: string) {
  const set = subscribers.get(key);
  if (!set) return;
  set.delete(res);
  if (!set.size) subscribers.delete(key);
}

export function publishSSE(key: string, event: string, payload: any) {
  const set = subscribers.get(key);
  if (!set) return;
  const data = JSON.stringify(payload);
  set.forEach((res) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
});
}
