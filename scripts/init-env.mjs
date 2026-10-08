// Creates the local env file of the API from the template and fills the secrets with random values.
// Never overwrites an existing file.   npm run env:init
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GENERATORS = {
  SESSION_SECRET: () => randomBytes(48).toString('base64url'),
  MASTER_KEY: () => randomBytes(32).toString('base64'),
};

export function fillSecrets(template) {
  return template.replace(/^(SESSION_SECRET|MASTER_KEY)=$/gm, (_, name) => `${name}=${GENERATORS[name]()}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL('../', import.meta.url);
  const target = new URL('apps/api/.env', root);
  if (existsSync(target)) {
    console.log('The local env file of the API exists, left unchanged.');
  } else {
    writeFileSync(target, fillSecrets(readFileSync(new URL('.env.example', root), 'utf8')), { mode: 0o600 });
    console.log('Created the local env file of the API with fresh secrets.');
  }
}
