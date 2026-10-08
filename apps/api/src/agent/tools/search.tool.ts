import { spawn } from 'node:child_process';
import { z } from 'zod';
import { ToolError, type AgentTool } from '../types.js';
import { statOrUndefined } from './file-access.js';
import type { Workspace } from './workspace.js';

export interface SearchLimits {
  searchMaxMatches: number;
  searchLineMaxChars: number;
  searchTimeoutMs: number;
  /** Path of the ripgrep binary. */
  rgPath: string;
}

const schema = z.strictObject({
  pattern: z.string().min(1).describe('Regular expression to search for'),
  path: z.string().optional().describe('File or folder to search in. Default: the whole project.'),
  glob: z.string().optional().describe('Only search files whose name matches, for example "*.ts"'),
});

/** Never searched, whatever the glob says. Results are filtered again afterwards in case a pattern slips through. */
const EXCLUDED_GLOBS = [
  '.git',
  '.env',
  'id_rsa*',
  'id_ed25519*',
  'id_ecdsa*',
  'id_dsa*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
];

interface Match {
  file: string;
  line: number;
  text: string;
}

interface RipgrepResult {
  matches: Match[];
  more: boolean;
  timedOut: boolean;
  stderr: string;
}

interface RipgrepMatchMessage {
  type: string;
  data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
}

function parseMatch(line: string): Match | undefined {
  let message: RipgrepMatchMessage;
  try {
    message = JSON.parse(line) as RipgrepMatchMessage;
  } catch {
    return undefined;
  }
  const { path, line_number: lineNumber, lines } = message.data ?? {};
  if (message.type !== 'match' || !path?.text || !lineNumber || lines?.text === undefined) return undefined;
  return { file: path.text.replace(/^\.\//, ''), line: lineNumber, text: lines.text.replace(/\r?\n$/, '') };
}

function ripgrepArgs(args: z.infer<typeof schema>, searchPath: string): string[] {
  return [
    '--json',
    '--no-config',
    '--hidden',
    '--sort=path',
    '--max-filesize=1M',
    ...(args.glob ? ['--glob', args.glob] : []),
    ...EXCLUDED_GLOBS.flatMap((glob) => ['--glob', `!**/${glob}`]),
    '-e',
    args.pattern,
    '--',
    searchPath,
  ];
}

function runRipgrep(
  command: string,
  args: string[],
  options: { cwd: string; limits: SearchLimits; signal: AbortSignal; keep: (file: string) => boolean },
): Promise<RipgrepResult> {
  return new Promise((resolve, reject) => {
    const result: RipgrepResult = { matches: [], more: false, timedOut: false, stderr: '' };
    const child = spawn(command, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: {} });
    const stop = () => child.kill('SIGTERM');
    const timer = setTimeout(() => {
      result.timedOut = true;
      stop();
    }, options.limits.searchTimeoutMs);
    options.signal.addEventListener('abort', stop, { once: true });

    const accept = (line: string) => {
      const match = result.more ? undefined : parseMatch(line);
      if (!match || !options.keep(match.file)) return;
      if (result.matches.length >= options.limits.searchMaxMatches) {
        result.more = true;
        stop();
      } else {
        result.matches.push(match);
      }
    };
    let buffered = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      const lines = (buffered + chunk).split('\n');
      buffered = lines.pop() ?? '';
      lines.forEach(accept);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      result.stderr = (result.stderr + chunk).slice(0, 1000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', () => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', stop);
      if (options.signal.aborted) return reject(new DOMException('The operation was aborted', 'AbortError'));
      accept(buffered);
      resolve(result);
    });
  });
}

function format(result: RipgrepResult, limits: SearchLimits): string {
  if (result.matches.length === 0) return 'No matches found.';
  const lines = result.matches.map(({ file, line, text }) => {
    const shown = text.length > limits.searchLineMaxChars ? `${text.slice(0, limits.searchLineMaxChars)}…` : text;
    return `${file}:${line}: ${shown}`;
  });
  if (result.more) lines.push(`[Stopped at ${limits.searchMaxMatches} matches. Narrow the search with path or glob.]`);
  if (result.timedOut) lines.push('[The search timed out; these are the matches found so far.]');
  return lines.join('\n');
}

export function createSearchTool(workspace: Workspace, limits: SearchLimits): AgentTool<typeof schema> {
  return {
    name: 'search',
    description:
      'Searches file contents with a regular expression (ripgrep syntax). Returns path:line: text. ' +
      'Secrets and git internals are never searched.',
    kind: 'read',
    schema,
    preview: async (args) => `Search for ${args.pattern}`,
    async execute(args, context) {
      const root = await workspace.resolve('.');
      const target = await workspace.resolve(args.path ?? '.');
      if (!(await statOrUndefined(target))) throw new ToolError(`Path not found: ${args.path}`);
      const result = await runRipgrep(limits.rgPath, ripgrepArgs(args, workspace.display(target) || '.'), {
        cwd: root,
        limits,
        signal: context.signal,
        keep: (file) => !workspace.isProtected(file),
      });
      if (/regex parse error|error parsing/i.test(result.stderr) && result.matches.length === 0) {
        throw new ToolError(`The pattern is not a valid regular expression: ${result.stderr.trim().slice(0, 300)}`);
      }
      return format(result, limits);
    },
  };
}
