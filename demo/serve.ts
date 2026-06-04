/** Simple static file server for demo. Usage: bun demo/serve.ts */
const server = Bun.serve({
  port: 3457,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    // Serve test data for easy loading
    if (path.startsWith('/test-data/')) {
      const file = Bun.file(`.${path}`);
      if (await file.exists()) return new Response(file);
    }
    const file = Bun.file(`./demo${path}`);
    if (await file.exists()) return new Response(file);
    return new Response('Not found', { status: 404 });
  },
});
console.log(`Demo server: http://localhost:${server.port}`);
