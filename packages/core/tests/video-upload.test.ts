import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BskyClient, normalizeJobStatus, classifyHttpError, classifyError, makeUniqueVideoName } from '../src/at/client.js';
import { VideoServiceError } from '../src/at/types.js';

const TEST_DID = 'did:plc:abc123';
const TEST_HANDLE = 'test.example.com';
const TEST_PDS = 'https://example.com';

describe('Video upload helper functions', () => {
  describe('normalizeJobStatus', () => {
    it('accepts nested { jobStatus: ... } shape', () => {
      const payload = {
        jobStatus: { jobId: 'job-1', did: TEST_DID, state: 'JOB_STATE_CREATED' },
      };
      const result = normalizeJobStatus(payload);
      expect(result).toBeDefined();
      expect(result?.jobId).toBe('job-1');
      expect(result?.state).toBe('JOB_STATE_CREATED');
    });

    it('accepts flat job-status shape', () => {
      const payload = { jobId: 'job-2', did: TEST_DID, state: 'JOB_STATE_ENCODING', progress: 42 };
      const result = normalizeJobStatus(payload);
      expect(result).toBeDefined();
      expect(result?.jobId).toBe('job-2');
      expect(result?.progress).toBe(42);
    });

    it('returns undefined for payload without jobId', () => {
      expect(normalizeJobStatus({ message: 'Video processed successfully' })).toBeUndefined();
      expect(normalizeJobStatus({ state: 'JOB_STATE_COMPLETED' })).toBeUndefined();
      expect(normalizeJobStatus(null)).toBeUndefined();
      expect(normalizeJobStatus('not an object')).toBeUndefined();
    });

    it('preserves blob on already_exists response', () => {
      const payload = {
        did: TEST_DID,
        error: 'already_exists',
        jobId: 'job-3',
        state: 'JOB_STATE_COMPLETED',
        blob: { $type: 'blob', ref: { $link: 'cid-1' }, mimeType: 'video/mp4', size: 100 },
      };
      const result = normalizeJobStatus(payload);
      expect(result?.blob?.ref.$link).toBe('cid-1');
    });
  });

  describe('classifyHttpError', () => {
    it('maps 5xx to service_unavailable recoverable', () => {
      const err = classifyHttpError(503, 'Slow Down');
      expect(err.code).toBe('service_unavailable');
      expect(err.recoverable).toBe(true);
      expect(err.status).toBe(503);
    });

    it('maps 400 to invalid_video non-recoverable', () => {
      const err = classifyHttpError(400, 'Bad video');
      expect(err.code).toBe('invalid_video');
      expect(err.recoverable).toBe(false);
    });

    it('maps 401/403 to auth non-recoverable', () => {
      expect(classifyHttpError(401).code).toBe('auth');
      expect(classifyHttpError(403).code).toBe('auth');
      expect(classifyHttpError(401).recoverable).toBe(false);
    });

    it('maps 413 to payload_too_large non-recoverable', () => {
      const err = classifyHttpError(413);
      expect(err.code).toBe('payload_too_large');
      expect(err.recoverable).toBe(false);
    });

    it('maps 429 to rate_limited non-recoverable', () => {
      const err = classifyHttpError(429);
      expect(err.code).toBe('rate_limited');
      expect(err.recoverable).toBe(false);
    });

    it('maps 408 to timeout recoverable', () => {
      const err = classifyHttpError(408);
      expect(err.code).toBe('timeout');
      expect(err.recoverable).toBe(true);
    });

    it('maps 409 to invalid_video non-recoverable', () => {
      const err = classifyHttpError(409);
      expect(err.code).toBe('invalid_video');
      expect(err.recoverable).toBe(false);
    });

    it('maps unknown status to non-recoverable by default', () => {
      const err = classifyHttpError(404);
      expect(err.recoverable).toBe(false);
    });
  });

  describe('classifyError', () => {
    it('passes through VideoServiceError', () => {
      const original = new VideoServiceError('network', 'original', true);
      expect(classifyError(original)).toBe(original);
    });

    it('maps AbortError to cancelled non-recoverable', () => {
      const err = classifyError(new DOMException('Aborted', 'AbortError'));
      expect(err.code).toBe('cancelled');
      expect(err.recoverable).toBe(false);
    });

    it('maps TypeError to network recoverable', () => {
      const err = classifyError(new TypeError('fetch failed'));
      expect(err.code).toBe('network');
      expect(err.recoverable).toBe(true);
    });

    it('maps timeout message to timeout recoverable', () => {
      const err = classifyError(new Error('Request timeout'));
      expect(err.code).toBe('timeout');
      expect(err.recoverable).toBe(true);
    });

    it('maps unknown error to non-recoverable', () => {
      const err = classifyError(new Error('something weird'));
      expect(err.recoverable).toBe(false);
    });
  });

  describe('makeUniqueVideoName', () => {
    it('includes safe file name and extension', () => {
      const name = makeUniqueVideoName('my video @home.mp4');
      expect(name).toMatch(/^\d+-[a-z0-9]+-my_video__home\.mp4$/i);
    });

    it('falls back to video.mp4 for empty or unsafe names', () => {
      expect(makeUniqueVideoName('')).toMatch(/-video\.mp4$/);
      expect(makeUniqueVideoName('   ')).toMatch(/-video\.mp4$/);
      expect(makeUniqueVideoName('@@@')).toMatch(/-video\.mp4$/);
    });

    it('generates different names on successive calls', () => {
      const a = makeUniqueVideoName('x.mp4');
      const b = makeUniqueVideoName('x.mp4');
      expect(a).not.toBe(b);
    });
  });
});

describe('BskyClient.uploadVideo fallback behavior', () => {
  let client: BskyClient;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    client = new BskyClient({ pdsUrl: TEST_PDS });
    client.session = { accessJwt: 'test-token', refreshJwt: 'test-refresh', handle: TEST_HANDLE, did: TEST_DID };
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchWithResponses(responses: Array<() => Promise<Response>>) {
    let index = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const next = responses[index] ?? responses[responses.length - 1];
      if (index < responses.length - 1) index++;
      return next();
    });
  }

  function describeServerResponse() {
    return Promise.resolve(new Response(JSON.stringify({ did: 'did:web:example.com' }), { status: 200 }));
  }

  it('does not fallback when allowFallback is false and error is recoverable', async () => {
    (client as any)['_getVideoServiceAuthWithRetry'] = vi.fn().mockResolvedValue('token');
    mockFetchWithResponses([
      describeServerResponse,
      () => Promise.resolve(new Response('Server Error', { status: 503 })),
    ]);

    await expect(client.uploadVideo(new Uint8Array(10), 'test.mp4', { allowFallback: false }))
      .rejects.toThrow(VideoServiceError);
  });

  it('fallbacks when allowFallback is true and error is recoverable', async () => {
    (client as any)['_getVideoServiceAuthWithRetry'] = vi.fn().mockResolvedValue('token');
    mockFetchWithResponses([
      describeServerResponse,
      () => Promise.resolve(new Response('Server Error', { status: 503 })),
    ]);
    const uploadBlobSpy = vi.spyOn(client, 'uploadBlob').mockResolvedValue({
      blob: { $type: 'blob', ref: { $link: 'raw-cid' }, mimeType: 'video/mp4', size: 10 },
    });

    const result = await client.uploadVideo(new Uint8Array(10), 'test.mp4', { allowFallback: true });
    expect(result.processed).toBe(false);
    expect(result.fallbackReason).toBeTruthy();
    expect(uploadBlobSpy).toHaveBeenCalledTimes(1);
  });

  it('does not fallback for 413 even with allowFallback true', async () => {
    (client as any)['_getVideoServiceAuthWithRetry'] = vi.fn().mockResolvedValue('token');
    mockFetchWithResponses([
      describeServerResponse,
      () => Promise.resolve(new Response('Payload Too Large', { status: 413 })),
    ]);
    const uploadBlobSpy = vi.spyOn(client, 'uploadBlob').mockResolvedValue({
      blob: { $type: 'blob', ref: { $link: 'raw-cid' }, mimeType: 'video/mp4', size: 10 },
    });

    await expect(client.uploadVideo(new Uint8Array(10), 'test.mp4', { allowFallback: true }))
      .rejects.toThrow(VideoServiceError);
    expect(uploadBlobSpy).not.toHaveBeenCalled();
  });

  it('returns processed blob on 409 already_exists with blob', async () => {
    (client as any)['_getVideoServiceAuthWithRetry'] = vi.fn().mockResolvedValue('token');
    const body = {
      did: TEST_DID,
      error: 'already_exists',
      jobId: 'job-409',
      state: 'JOB_STATE_COMPLETED',
      blob: { $type: 'blob', ref: { $link: 'cid-409' }, mimeType: 'video/mp4', size: 10 },
    };
    mockFetchWithResponses([
      describeServerResponse,
      () => Promise.resolve(new Response(JSON.stringify(body), { status: 409, headers: { 'Content-Type': 'application/json' } })),
    ]);

    const result = await client.uploadVideo(new Uint8Array(10), 'test.mp4', { allowFallback: false });
    expect(result.processed).toBe(true);
    expect(result.blobRef.$link).toBe('cid-409');
  });

  it('polls until blob is available', async () => {
    (client as any)['_getVideoServiceAuthWithRetry'] = vi.fn().mockResolvedValue('token');
    let pollCount = 0;
    mockFetchWithResponses([
      describeServerResponse,
      () => Promise.resolve(new Response(JSON.stringify({ jobId: 'job-poll', did: TEST_DID, state: 'JOB_STATE_CREATED' }), { status: 200 })),
      () => {
        pollCount++;
        if (pollCount < 3) {
          return Promise.resolve(new Response(JSON.stringify({ jobId: 'job-poll', did: TEST_DID, state: 'JOB_STATE_ENCODING', progress: pollCount * 30 }), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          jobId: 'job-poll',
          did: TEST_DID,
          state: 'JOB_STATE_COMPLETED',
          blob: { $type: 'blob', ref: { $link: 'cid-poll' }, mimeType: 'video/mp4', size: 10 },
        }), { status: 200 }));
      },
    ]);

    const result = await client.uploadVideo(new Uint8Array(10), 'test.mp4', { allowFallback: false, pollIntervalMs: 10 });
    expect(result.processed).toBe(true);
    expect(result.blobRef.$link).toBe('cid-poll');
    expect(pollCount).toBe(3);
  });

  it('throws non-recoverable error when polling completes without blob', async () => {
    (client as any)['_getVideoServiceAuthWithRetry'] = vi.fn().mockResolvedValue('token');
    mockFetchWithResponses([
      describeServerResponse,
      () => Promise.resolve(new Response(JSON.stringify({ jobId: 'job-noblob', did: TEST_DID, state: 'JOB_STATE_CREATED' }), { status: 200 })),
      () => Promise.resolve(new Response(JSON.stringify({ jobId: 'job-noblob', did: TEST_DID, state: 'JOB_STATE_COMPLETED' }), { status: 200 })),
    ]);

    await expect(client.uploadVideo(new Uint8Array(10), 'test.mp4', { allowFallback: false, pollIntervalMs: 10 }))
      .rejects.toThrow(VideoServiceError);
  });
});
