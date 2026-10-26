import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('MCP stdio server negotiates, lists tools and serves read-only retrieval', async () => {
  const child = spawn(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'scripts/mcp-server.ts'],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const pending = new Map<number, (message: any) => void>();
  createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line);
    pending.get(message.id)?.(message);
  });
  let id = 0;
  const request = (method: string, params?: object) =>
    new Promise<any>((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 15000);
      pending.set(current, message => {
        clearTimeout(timer);
        resolve(message);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: current, method, params }) + '\n');
    });

  try {
    const init = await request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    });
    assert.equal(init.result.protocolVersion, '2025-03-26');
    assert.ok(init.result.capabilities.tools);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const list = await request('tools/list');
    assert.deepEqual(
      list.result.tools.map((t: any) => t.name).sort(),
      ['list_materials', 'read_source', 'search_materials'],
    );
    assert.ok(list.result.tools.every((t: any) => t.inputSchema.type === 'object' && t.annotations.readOnlyHint));

    const search = await request('tools/call', { name: 'search_materials', arguments: { query: 'no-cache 和 no-store 有什么区别' } });
    assert.equal(search.result.isError, false);
    const hits = JSON.parse(search.result.content[0].text);
    assert.equal(hits[0].section, 'no-cache 与 no-store');
    assert.equal(hits[0].citation, 1);

    const context = await request('tools/call', { name: 'read_source', arguments: { chunk_id: hits[0].chunk_id } });
    assert.match(JSON.parse(context.result.content[0].text).context, /no-store/);
    const blocked = await request('tools/call', { name: 'read_source', arguments: { chunk_id: 'sample-react:1:0' } });
    assert.equal(blocked.result.isError, true);
    const unknown = await request('tools/call', { name: 'delete_files', arguments: {} });
    assert.equal(unknown.result.isError, true);

    const missing = await request('resources/list');
    assert.equal(missing.error.code, -32601);
  } finally {
    child.kill();
  }
});
