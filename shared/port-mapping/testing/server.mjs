import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const RPC_PORT = 1496;
const SERVICE_PORT = 1497;
const resources = new Map();
const sockets = new Map();
const requests = [];
const encoder = body => Buffer.from(body).toString('base64');
const page = `<!doctype html><html><head><title>Port mapping test</title><link rel="stylesheet" href="/style.css"></head>
<body><h1>Port mapping works</h1><img alt="Mapped image" src="/image.svg"><p id="module">Loading module</p>
<button id="fetch">Fetch data</button><p id="result"></p><p id="socket">Connecting socket</p>
<a href="/next">Next page</a><form action="/submit" method="post"><input name="message" value="mapping">
<button type="submit">Submit form</button></form><script type="module" src="/main.js"></script></body></html>`;
const files = {
  '/': ['text/html', page],
  '/style.css': ['text/css', 'body{font:16px system-ui;background:#eef6f2;color:#12382a;padding:24px}img{width:48px}'],
  '/image.svg': ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><circle cx="24" cy="24" r="22" fill="#0b8065"/></svg>'],
  '/main.js': ['text/javascript', `import { label } from './label.js';
document.querySelector('#module').textContent=label;
document.querySelector('#fetch').onclick=async()=>{document.querySelector('#result').textContent=await(await fetch('/api')).text()};
const socket=new WebSocket('ws://127.0.0.1:${SERVICE_PORT}/socket','mapping-test');
socket.onopen=()=>socket.send('hello');
socket.onmessage=event=>document.querySelector('#socket').textContent=event.data;
try { parent.localStorage.getItem('mapping-secret'); document.body.dataset.isolation='failed'; }
catch { document.body.dataset.isolation='passed'; }
`],
  '/label.js': ['text/javascript', 'export const label="Module loaded";'],
  '/api': ['text/plain', 'Mapped API response'],
  '/next': ['text/html', '<h1>Second mapped page</h1><a href="/">Home</a>'],
};
const service = http.createServer(async (request, response) => {
  requests.push({ url: request.url, method: request.method });
  if (request.url === '/submit') {
    let body = ''; for await (const chunk of request) body += chunk;
    response.setHeader('Content-Type', 'text/html'); response.end(`<h1>Received ${body}</h1>`); return;
  }
  const file = files[request.url] ?? ['text/plain', 'Not found'];
  response.writeHead(files[request.url] ? 200 : 404, { 'Content-Type': file[0] });
  // Split chunked responses to exercise the incremental reader instead of just returning JSON fixtures.
  response.write(file[1].slice(0, 12)); response.end(file[1].slice(12));
});
const ws = new WebSocket.Server({ server: service, handleProtocols: protocols => [...protocols][0] });
ws.on('connection', socket => socket.on('message', data => socket.send('Socket echo: ' + data.toString())));
service.listen(SERVICE_PORT, '127.0.0.1');

async function rpc(input) {
  if (input.operation === 'open') {
    if (input.url !== `http://127.0.0.1:${SERVICE_PORT}`) throw new Error('Unknown fixture port');
    const id = randomUUID(); resources.set(id, input.url); return id;
  }
  if (input.operation === 'close') {
    resources.delete(input.id);
    for (const [id, entry] of sockets) if (entry.resource === input.id) { entry.socket.destroy(); sockets.delete(id); }
    return;
  }
  const request = input.request;
  if (!resources.has(input.id)) throw new Error('Resource closed');
  if (request.type === 'connect') {
    if (request.url !== resources.get(input.id)) throw new Error('Scope mismatch');
    const socket = net.connect(SERVICE_PORT, '127.0.0.1');
    const id = randomUUID();
    const entry = { resource: input.id, socket, data: [], ended: false, wake: undefined };
    socket.on('data', bytes => { entry.data.push(bytes); entry.wake?.(); });
    socket.on('close', () => { entry.ended = true; entry.wake?.(); });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    sockets.set(id, entry); return { type: 'socket', id };
  }
  const entry = sockets.get(request.id);
  if (!entry || entry.resource !== input.id) {
    if (request.type === 'close') return { type: 'done' };
    throw new Error('Socket closed');
  }
  if (request.type === 'write') {
    await new Promise((resolve, reject) => entry.socket.write(Buffer.from(request.data, 'base64'),
      error => error ? reject(error) : resolve()));
    return { type: 'done' };
  }
  if (request.type === 'close') { entry.socket.destroy(); sockets.delete(request.id); return { type: 'done' }; }
  if (!entry.data.length && !entry.ended) await new Promise(resolve => {
    const timer = setTimeout(() => { entry.wake = undefined; resolve(); }, 5000);
    entry.wake = () => { clearTimeout(timer); entry.wake = undefined; resolve(); };
  });
  const data = Buffer.concat(entry.data.splice(0));
  return { type: 'data', data: encoder(data), eof: entry.ended };
}
http.createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (request.method === 'OPTIONS') { response.end(); return; }
  response.setHeader('Content-Type', 'application/json');
  if (request.url === '/state') {
    response.end(JSON.stringify({ resources: resources.size, sockets: sockets.size, requests })); return;
  }
  try {
    let body = ''; for await (const chunk of request) body += chunk;
    response.end(JSON.stringify({ value: await rpc(JSON.parse(body)) }));
  } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error.message })); }
}).listen(RPC_PORT, '127.0.0.1', () => console.log(`Port mapping fixture: ${RPC_PORT}, service: ${SERVICE_PORT}`));
