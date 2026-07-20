'use strict';

/** Test-only loopback fault proxy for exercising BFF dependency failures through public seams. */
const http = require('node:http');

const port = Number(process.env.E2E_INTERNAL_PROXY_PORT ?? 4011);
const upstream = process.env.E2E_INTERNAL_PROXY_UPSTREAM ?? 'http://localhost:4010';
let failSessionResolve = false;

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  if (request.method === 'GET' && url.pathname === '/__e2e/health') {
    json(response, 200, { ok: true });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/__e2e/session-resolve-fault') {
    failSessionResolve = url.searchParams.get('enabled') === '1';
    json(response, 200, { enabled: failSessionResolve });
    return;
  }
  if (failSessionResolve && url.pathname === '/v1/auth/sessions/resolve') {
    json(response, 503, { error: { code: 'E2E_FAULT', message: 'Injected resolve outage.' } });
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const headers = { ...request.headers };
    delete headers.host;
    delete headers['content-length'];
    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const forwarded = await fetch(`${upstream}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
    });
    const responseHeaders = Object.fromEntries(forwarded.headers.entries());
    delete responseHeaders['content-encoding'];
    delete responseHeaders['content-length'];
    response.writeHead(forwarded.status, responseHeaders);
    response.end(Buffer.from(await forwarded.arrayBuffer()));
  } catch {
    json(response, 502, { error: { code: 'E2E_PROXY_FAILURE', message: 'Proxy failure.' } });
  }
});

server.listen(port, '127.0.0.1');
