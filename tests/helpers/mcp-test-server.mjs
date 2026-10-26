import path from 'node:path';

import { createRunStore } from '../../src/mcp/run-store.js';
import { startStdioServer } from '../../src/mcp/stdio-server.js';
import { createToolService } from '../../src/mcp/tools.js';

const runsDir = process.argv[2] === '--faulting-io'
  ? null
  : path.resolve(process.argv[2]);
const store = runsDir
  ? createRunStore(runsDir)
  : {
      async list() { throw new Error('EACCES: permission denied, scandir C:\\Users\\PrivateName\\secret-runs'); },
      async get() { throw new Error('EACCES: permission denied, open C:\\Users\\PrivateName\\secret-runs\\private.json'); },
    };
startStdioServer({ toolService: createToolService(store) });
