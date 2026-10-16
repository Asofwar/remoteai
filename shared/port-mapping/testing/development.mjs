import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const MODULE_COUNT = 160;

/** Exercise actual Vite transforms, CSS negotiation and HMR through the same TCP fixture as other previews. */
export async function developmentServer() {
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('./development/', import.meta.url)), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'mapping-development-modules',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!['/login', '/home'].includes(request.url?.split('?')[0])) { next(); return; }
          response.setHeader('Content-Type', 'text/html');
          response.end(readFileSync(new URL('./development/router.html', import.meta.url)));
        });
      },
      resolveId(id) { if (id === '/modules.js' || /^\/modules\/\d+\.js$/.test(id)) return id; },
      load(id) {
        if (/^\/modules\/\d+\.js$/.test(id)) return `export const value = ${id.match(/\d+/)[0]};`;
        if (id !== '/modules.js') return;
        const modules = Array.from({ length: MODULE_COUNT }, (_, index) => index);
        return modules.map(index => `import {value as v${index}} from '/modules/${index}.js';`).join('\n')
          + `\nexport const total = ${modules.map(index => `v${index}`).join('+')};`;
      },
    }],
  });
  await server.listen();
  return server.httpServer.address().port;
}
