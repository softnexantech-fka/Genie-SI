import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFinanceDocForStorage } from '../src/modules/finance/financePersistenceUtils.js';

test('sanitizeFinanceDocForStorage preserves full server URLs and removes base64 payloads', () => {
  const input = {
    id: 'DOC-1',
    name: 'plan.xlsx',
    url: 'https://example.com/api/files/abc123?view=1',
    serverUrl: 'https://example.com/api/files/abc123?view=1',
    path: '/api/files/abc123?view=1',
    dataUrl: 'data:application/pdf;base64,AAAA',
    blob: new Blob(['x']),
  };

  const result = sanitizeFinanceDocForStorage(input);

  assert.equal(result.url, input.url);
  assert.equal(result.serverUrl, input.serverUrl);
  assert.equal(result.path, input.url);
  assert.equal(result.dataUrl, null);
  assert.equal(result.blob, undefined);
});
