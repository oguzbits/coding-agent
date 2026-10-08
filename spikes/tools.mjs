// Throwaway spike code. The six tool contracts from docs/PLAN.md with simple implementations on a temp project.
// run_command only accepts the test commands: the model must not run arbitrary code on this machine, and the child
// process gets no environment (in particular not GEMINI_API_KEY).
import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const MAX_READ_LINES = 300;
const MAX_READ_BYTES = 20_000;
const MAX_ENTRIES = 200;
const MAX_MATCHES = 50;
const MAX_LINE_CHARS = 200;
const MAX_OUTPUT_CHARS = 6_000;
const MAX_FILE_BYTES = 200_000;
const MAX_COMMAND_SECONDS = 30;
const ALLOWED_COMMAND = /^(npm test|npm run test|node --test)$/;

class ToolError extends Error {}

function inside(root, input) {
  const absolute = resolve(root, input);
  const rel = relative(root, absolute);
  if (rel.startsWith('..')) {
    throw new ToolError(`Path "${input}" is outside the project. Use a path relative to the project root.`);
  }
  if (rel.split(/[\\/]/).some((segment) => segment === '.git' || segment.startsWith('.env'))) {
    throw new ToolError(`Path "${input}" is blocked.`);
  }
  return { absolute, rel: rel || '.' };
}

const hidden = (name) => name === '.git' || name.startsWith('.env');

function* walkFiles(root, dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (hidden(entry.name) || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(root, full);
    else yield { full, rel: relative(root, full) };
  }
}

function globToRegex(glob) {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`(^|/)${source}$`);
}

function clip(text) {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const half = MAX_OUTPUT_CHARS / 2;
  return `${text.slice(0, half)}\n[... ${text.length - MAX_OUTPUT_CHARS} characters omitted ...]\n${text.slice(-half)}`;
}

export const TOOLS = {
  read_file: {
    description:
      'Read a text file. Returns numbered lines. Long files are cut; the note at the end says how to continue with offset.',
    schema: z.object({
      path: z.string().describe('File path relative to the project root.'),
      offset: z.number().int().min(1).optional().describe('First line to read, starting at 1.'),
      limit: z.number().int().min(1).optional().describe('Maximum number of lines to read.'),
    }),
    run({ path, offset = 1, limit }, ctx) {
      const { absolute, rel } = inside(ctx.root, path);
      if (!existsSync(absolute) || statSync(absolute).isDirectory()) {
        throw new ToolError(`"${rel}" is not a file. Use list_files to see what exists.`);
      }
      const text = readFileSync(absolute, 'utf8');
      if (text.includes('\u0000')) throw new ToolError(`"${rel}" is a binary file.`);
      ctx.readFiles.add(rel);
      const lines = text.split('\n');
      const start = offset - 1;
      const wanted = Math.min(limit ?? MAX_READ_LINES, MAX_READ_LINES);
      let out = '';
      let shown = 0;
      for (const line of lines.slice(start, start + wanted)) {
        const row = `${start + shown + 1}\t${line}\n`;
        if (out.length + row.length > MAX_READ_BYTES) break;
        out += row;
        shown += 1;
      }
      const end = start + shown;
      const note = end < lines.length ? `[Showing lines ${offset}-${end} of ${lines.length}. Continue with offset=${end + 1}.]` : '';
      return `${out}${note}`.trimEnd() || '(empty file)';
    },
  },

  list_files: {
    description: 'List files and folders. Folders end with a slash. node_modules is listed by name only.',
    schema: z.object({
      path: z.string().optional().describe('Folder relative to the project root. Default: the root.'),
      depth: z.number().int().min(1).optional().describe('How many levels to descend. Default 2.'),
    }),
    run({ path = '.', depth = 2 }, ctx) {
      const { absolute } = inside(ctx.root, path);
      if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
        throw new ToolError(`"${path}" is not a folder.`);
      }
      const out = [];
      let truncated = false;
      const walk = (dir, level) => {
        for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          if (out.length >= MAX_ENTRIES) {
            truncated = true;
            return;
          }
          if (hidden(entry.name)) continue;
          const full = join(dir, entry.name);
          const shown = relative(ctx.root, full);
          if (entry.isDirectory()) {
            if (entry.name === 'node_modules') {
              out.push(`${shown}/ (contents not listed)`);
              continue;
            }
            out.push(`${shown}/`);
            if (level < depth) walk(full, level + 1);
          } else {
            out.push(shown);
          }
        }
      };
      walk(absolute, 1);
      return `${out.join('\n') || '(empty folder)'}${truncated ? `\n[Cut after ${MAX_ENTRIES} entries. Narrow the path.]` : ''}`;
    },
  },

  search: {
    description: 'Search file contents with a regular expression. Returns path:line: text.',
    schema: z.object({
      pattern: z.string().describe('Regular expression (JavaScript syntax).'),
      path: z.string().optional().describe('Folder or file relative to the project root. Default: the root.'),
      glob: z.string().optional().describe('Only files matching this glob, for example "*.mjs" or "src/**".'),
    }),
    run({ pattern, path = '.', glob }, ctx) {
      let regex;
      try {
        regex = new RegExp(pattern);
      } catch {
        throw new ToolError(`"${pattern}" is not a valid regular expression.`);
      }
      const { absolute } = inside(ctx.root, path);
      if (!existsSync(absolute)) throw new ToolError(`"${path}" does not exist.`);
      const globRegex = glob ? globToRegex(glob) : undefined;
      const files = statSync(absolute).isDirectory()
        ? walkFiles(ctx.root, absolute)
        : [{ full: absolute, rel: relative(ctx.root, absolute) }];
      const matches = [];
      let truncated = false;
      outer: for (const file of files) {
        if (globRegex && !globRegex.test(file.rel)) continue;
        if (statSync(file.full).size > MAX_FILE_BYTES) continue;
        const text = readFileSync(file.full, 'utf8');
        if (text.includes('\u0000')) continue;
        for (const [index, line] of text.split('\n').entries()) {
          if (!regex.test(line)) continue;
          if (matches.length >= MAX_MATCHES) {
            truncated = true;
            break outer;
          }
          matches.push(`${file.rel}:${index + 1}: ${line.trim().slice(0, MAX_LINE_CHARS)}`);
        }
      }
      if (matches.length === 0) return 'No matches.';
      return `${matches.join('\n')}${truncated ? `\n[Cut after ${MAX_MATCHES} matches. Narrow the pattern or path.]` : ''}`;
    },
  },

  edit_file: {
    description:
      'Replace an exact piece of text in a file you have already read in this session. old_string must occur exactly once unless replace_all is true.',
    schema: z.object({
      path: z.string().describe('File path relative to the project root.'),
      old_string: z.string().min(1).describe('Exact text to replace, including whitespace.'),
      new_string: z.string().describe('Replacement text.'),
      replace_all: z.boolean().optional().describe('Replace every occurrence. Default false.'),
    }),
    run({ path, old_string, new_string, replace_all = false }, ctx) {
      const { absolute, rel } = inside(ctx.root, path);
      if (!existsSync(absolute)) throw new ToolError(`"${rel}" does not exist. Use write_file to create it.`);
      if (!ctx.readFiles.has(rel)) throw new ToolError(`Read "${rel}" with read_file before you edit it.`);
      const text = readFileSync(absolute, 'utf8');
      const count = text.split(old_string).length - 1;
      if (count === 0) throw new ToolError(`old_string was not found in "${rel}". Read the file again and copy the text exactly.`);
      if (count > 1 && !replace_all) {
        throw new ToolError(`old_string occurs ${count} times in "${rel}". Add surrounding lines to make it unique, or set replace_all.`);
      }
      const updated = replace_all ? text.split(old_string).join(new_string) : text.replace(old_string, () => new_string);
      writeFileSync(absolute, updated);
      const firstLine = text.slice(0, text.indexOf(old_string)).split('\n').length;
      const context = updated
        .split('\n')
        .slice(Math.max(0, firstLine - 3), firstLine + 2 + new_string.split('\n').length)
        .join('\n');
      return `Replaced ${replace_all ? count : 1} occurrence(s) in ${rel}. Around the change:\n${context}`;
    },
  },

  write_file: {
    description:
      'Create a file, or replace a file you have already read in this session. Creates missing folders.',
    schema: z.object({
      path: z.string().describe('File path relative to the project root.'),
      content: z.string().describe('Full file content.'),
    }),
    run({ path, content }, ctx) {
      const { absolute, rel } = inside(ctx.root, path);
      if (content.length > MAX_FILE_BYTES) throw new ToolError(`Content is larger than ${MAX_FILE_BYTES} characters.`);
      if (existsSync(absolute) && !ctx.readFiles.has(rel)) {
        throw new ToolError(`"${rel}" already exists. Read it with read_file first, or use edit_file.`);
      }
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
      ctx.readFiles.add(rel);
      return `Wrote ${content.length} characters to ${rel}.`;
    },
  },

  run_command: {
    description:
      'Run a shell command in the project root. In this environment only the test commands "npm test" and "node --test" are allowed.',
    schema: z.object({
      command: z.string().describe('The command line.'),
      timeout_seconds: z.number().int().min(1).optional().describe('Timeout in seconds. Default and maximum 30.'),
    }),
    run({ command, timeout_seconds }, ctx) {
      if (!ALLOWED_COMMAND.test(command.trim())) {
        throw new ToolError('This command is not allowed here. Allowed: "npm test", "node --test".');
      }
      const result = spawnSync('sh', ['-c', command], {
        cwd: ctx.root,
        timeout: Math.min(timeout_seconds ?? MAX_COMMAND_SECONDS, MAX_COMMAND_SECONDS) * 1000,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: ctx.root },
        maxBuffer: 5_000_000,
      });
      const code = result.status ?? (result.signal ? `signal ${result.signal}` : 'unknown');
      return `Exit code: ${code}\n${clip(`${result.stdout ?? ''}${result.stderr ?? ''}`)}`;
    },
  },
};

/** Tool declarations for the API. `variant` controls how the Zod output is adapted before sending. */
export function declarations(variant = 'clean') {
  return Object.entries(TOOLS).map(([name, tool]) => {
    const schema = z.toJSONSchema(tool.schema);
    if (variant !== 'as-is') delete schema.$schema;
    if (variant === 'minimal') delete schema.additionalProperties;
    return { name, description: tool.description, parametersJsonSchema: schema };
  });
}

/** Validates the arguments like the server will, then runs the tool. Errors go back to the model as text. */
export function executeTool(name, rawArgs, ctx) {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, output: `Unknown tool "${name}".` };
  const parsed = tool.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    return { ok: false, output: `Invalid arguments: ${issues.join('; ')}` };
  }
  try {
    return { ok: true, output: tool.run(parsed.data, ctx) };
  } catch (error) {
    if (error instanceof ToolError) return { ok: false, output: error.message };
    return { ok: false, output: `Tool crashed: ${error.message}` };
  }
}
