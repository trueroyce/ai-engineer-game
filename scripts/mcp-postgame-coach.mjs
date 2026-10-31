import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRunStore } from '../src/mcp/run-store.js';
import { startStdioServer } from '../src/mcp/stdio-server.js';
import { createToolService } from '../src/mcp/tools.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS_DIR = path.resolve(process.env.AIEG_MCP_RUNS_DIR || path.join(PROJECT_ROOT, 'runs'));

startStdioServer({ toolService: createToolService(createRunStore(RUNS_DIR)) });
