/** Architecture rules from docs/PLAN.md ("Architekturregeln"). */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    {
      name: 'api-and-web-are-separate',
      comment: 'apps/api and apps/web import nothing from each other; the web app gets its types from OpenAPI.',
      severity: 'error',
      from: { path: '^apps/api/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'web-does-not-import-api',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/api/' },
    },
    {
      name: 'only-the-gemini-adapter-imports-genai',
      severity: 'error',
      from: { pathNot: '^apps/api/src/model/gemini/' },
      to: { path: '@google/genai' },
    },
    {
      name: 'agent-loop-knows-neither-http-nor-typeorm',
      comment: 'The agent loop works against interfaces only.',
      severity: 'error',
      from: { path: '^apps/api/src/agent/' },
      to: {
        path: [
          'node_modules/(typeorm|@nestjs/typeorm|express|@nestjs/platform-express)/',
          '^apps/api/src/(database|conversations)/',
        ],
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: ['\\.test\\.ts$', 'main\\.ts$', 'data-source\\.ts$', 'eslint\\.config', 'vitest\\.config'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.js'],
    },
    moduleSystems: ['es6', 'cjs'],
  },
};
