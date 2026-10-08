// Rules for the PreToolUse hook on Bash commands. Pure function, no I/O, so it can be tested without a shell.
// The check is a heuristic on the command text: it catches the usual spellings, it is not a sandbox.
import path from 'node:path';

const SECRET_FILE =
  /(?:^|[\s/='"])(?:\.env(?:\.[\w.-]+)?|[\w.-]+\.(?:pem|key|p12|pfx)|id_(?:rsa|ed25519|ecdsa|dsa)[\w.-]*)(?=$|[\s'";|&)])/g;

const splitSegments = (command) =>
  command
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);
const tokenize = (segment) =>
  segment.match(/"[^"]*"|'[^']*'|\S+/g)?.map((token) => token.replace(/^["']|["']$/g, '')) ?? [];
const shortFlags = (tokens) =>
  tokens
    .filter((token) => /^-[a-zA-Z]+$/.test(token))
    .map((token) => token.slice(1))
    .join('');

function touchesSecretFile(command) {
  return [...command.matchAll(SECRET_FILE)].some((match) => !/^[\s/='"]?\.env\.example$/.test(match[0]));
}

function checkGit(tokens) {
  const subcommand = tokens.find((token, index) => index > 0 && !token.startsWith('-'));
  if (tokens.includes('--no-verify')) return 'git --no-verify is blocked: fix the cause of the failing hook instead';
  if (subcommand === 'commit' && shortFlags(tokens).includes('n')) {
    return 'git commit -n skips the hooks (same as --no-verify) and is blocked';
  }
  if (subcommand === 'push') {
    const forceFlag = tokens.some((token) => /^--force(-with-lease|-if-includes)?(=.*)?$/.test(token));
    if (forceFlag || shortFlags(tokens).includes('f') || tokens.some((token) => /^\+\S/.test(token))) {
      return 'force push is blocked: ask the user first';
    }
  }
  return null;
}

function resolveTarget(target, { cwd, home }) {
  if (target.includes('$') || target.includes('`')) return null;
  const expanded = target === '~' || target.startsWith('~/') ? path.join(home, target.slice(1)) : target;
  return path.resolve(cwd, expanded);
}

function checkRemove(tokens, context, state) {
  const flags = tokens.filter((token) => token.startsWith('-'));
  const recursive = flags.some((flag) => flag === '--recursive' || (/^-[a-zA-Z]+$/.test(flag) && /[rR]/.test(flag)));
  if (!recursive) return null;
  for (const target of tokens.slice(1).filter((token) => !token.startsWith('-'))) {
    const resolved = resolveTarget(target, { cwd: state.cwd, home: context.home });
    const inside = resolved && resolved.startsWith(`${context.projectDir}${path.sep}`);
    if (!inside) return `recursive delete of "${target}" is blocked: only paths inside the project are allowed`;
  }
  return null;
}

// `cat > file <<'EOF' ... EOF` only writes text. Its body is source code or prose, not a command, so it is not scanned.
// Heredocs fed to interpreters (python, node, sh) stay in: their body is executed.
const CAT_HEREDOC = /^[ \t]*cat\b(?=[^\n]*[^<]>)[^\n]*<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm;

const stripFileWritingHeredocs = (command) => command.replace(CAT_HEREDOC, (block) => block.split('\n')[0]);

export function checkCommand(command, context) {
  command = stripFileWritingHeredocs(command);
  if (touchesSecretFile(command)) {
    return { allowed: false, reason: 'access to .env files and key files is blocked (.env.example is fine)' };
  }
  const state = { cwd: context.cwd };
  for (const segment of splitSegments(command)) {
    const tokens = tokenize(segment);
    const [program] = tokens;
    let reason = null;
    if (program === 'cd' && tokens[1]) {
      state.cwd = resolveTarget(tokens[1], { cwd: state.cwd, home: context.home }) ?? state.cwd;
    } else if (program === 'git') {
      reason = checkGit(tokens);
    } else if (program === 'rm') {
      reason = checkRemove(tokens, context, state);
    }
    if (reason) return { allowed: false, reason };
  }
  return { allowed: true };
}
