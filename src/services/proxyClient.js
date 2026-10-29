// Thin client over Tauri's Rust-side HTTP proxy.
//
// Why this exists: some OpenAI-compatible APIs (notably Ollama Cloud) don't
// send CORS headers, so the browser blocks fetch() calls to them. The Tauri
// Rust side uses reqwest and is not subject to CORS, so we tunnel through it.
//
// Two flavors:
//   - proxyFetch(): simple request/response, returns parsed body + status.
//   - proxyStream(): returns an async iterable of decoded SSE events,
//     matching the OpenAI SDK's `for await (chunk of stream)` shape so the
//     chat handler doesn't need a separate code path.

let _invoke = null;
let _listen = null;

async function ensureImports() {
  if (!_invoke) {
    const core = await import('@tauri-apps/api/core');
    _invoke = core.invoke;
  }
  if (!_listen) {
    const event = await import('@tauri-apps/api/event');
    _listen = event.listen;
  }
}

export async function proxyFetch({ url, method = 'GET', headers = {}, body = null }) {
  await ensureImports();
  const res = await _invoke('proxy_http', {
    url,
    method,
    headers,
    body,
  });
  // Surface non-2xx as a clear Error so callers can show it in the UI.
  if (res.status < 200 || res.status >= 300) {
    const snippet = String(res.body || '').slice(0, 500);
    const err = new Error(`HTTP ${res.status}: ${snippet || res.status}`);
    err.status = res.status;
    err.body = res.body;
    throw err;
  }
  return res;
}

export async function proxyJson({ url, method = 'GET', headers = {}, body = null }) {
  const res = await proxyFetch({ url, method, headers, body });
  try {
    return JSON.parse(res.body);
  } catch (e) {
    throw new Error(`Failed to parse JSON response from ${url}: ${e.message}`);
  }
}

// Streaming variant: emits Server-Sent-Events decoded into the same shape the
// OpenAI SDK uses. We treat each Tauri event chunk as raw SSE text, accumulate
// a buffer, and yield parsed events as they complete.
export async function proxyStreamChat({ url, method = 'POST', headers = {}, body = null }) {
  await ensureImports();
  const requestId = crypto.randomUUID();
  const eventName = `proxy_chunk:${requestId}`;

  // SSE parser state.
  let buffer = '';
  let pending = [];
  let resolveNext = null;
  let closed = false;
  let error = null;

  const unlisten = await _listen(eventName, (e) => {
    const payload = e.payload || {};
    if (payload.kind === 'done') {
      closed = true;
      // Flush any trailing buffered event.
      flushBuffer(true);
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined, done: true });
      }
      return;
    }
    if (payload.kind === 'error') {
      closed = true;
      error = new Error(payload.error || 'Proxy stream error');
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined, done: true });
      }
      return;
    }
    if (payload.kind === 'content' && payload.text) {
      buffer += payload.text;
      flushBuffer(false);
    }
  });

  function flushBuffer(final) {
    // SSE events are separated by blank lines (\n\n).
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = parseSseEvent(rawEvent);
      if (event) pending.push(event);
    }
    if (final && buffer.trim()) {
      const event = parseSseEvent(buffer);
      if (event) pending.push(event);
      buffer = '';
    }
    while (pending.length && resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: pending.shift(), done: false });
    }
  }

  function parseSseEvent(raw) {
    // Strip comment lines and split into fields.
    const dataLines = [];
    for (const line of raw.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) return null;
    const data = dataLines.join('\n');
    if (data === '[DONE]') return { data: '[DONE]', done: true };
    try {
      return { data: JSON.parse(data), done: false };
    } catch {
      return null;
    }
  }

  // Start the Rust stream.
  try {
    await _invoke('proxy_http_stream', {
      requestId,
      url,
      method,
      headers,
      body,
    });
  } catch (e) {
    closed = true;
    error = e;
    unlisten();
    throw e;
  }

  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (pending.length) {
            return { value: pending.shift(), done: false };
          }
          if (closed) {
            if (error) throw error;
            unlisten();
            return { value: undefined, done: true };
          }
          return new Promise(resolve => { resolveNext = resolve; });
        },
      };
    },
    async cancel() {
      closed = true;
      unlisten();
    },
  };
}
