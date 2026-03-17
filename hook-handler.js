// hook-handler.js
// Called by Claude Code hooks. Appends event to a queue file and exits immediately.
// Claude Code is never blocked waiting for the game.

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const QUEUE = path.join(os.tmpdir(), 'claudevibe-queue.jsonl');

const eventType = process.argv[2] || 'event';
let body = '';

process.stdin.on('data', chunk => (body += chunk));
process.stdin.on('end', () => {
  let tool = '';
  try {
    const data = JSON.parse(body);
    tool = data.tool_name || '';
  } catch (_) {}

  try {
    fs.appendFileSync(QUEUE, JSON.stringify({ type: eventType, tool }) + '\n');
  } catch (_) {}

  process.exit(0);
});
