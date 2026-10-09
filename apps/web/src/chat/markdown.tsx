import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" className="underline" />,
  h1: ({ node: _node, ...props }) => <h3 {...props} className="mt-4 mb-2 text-lg font-medium" />,
  h2: ({ node: _node, ...props }) => <h3 {...props} className="mt-4 mb-2 text-base font-medium" />,
  h3: ({ node: _node, ...props }) => <h4 {...props} className="mt-3 mb-1 font-medium" />,
  p: ({ node: _node, ...props }) => <p {...props} className="my-2" />,
  ul: ({ node: _node, ...props }) => <ul {...props} className="my-2 list-disc pl-6" />,
  ol: ({ node: _node, ...props }) => <ol {...props} className="my-2 list-decimal pl-6" />,
  pre: ({ node: _node, ...props }) => (
    <pre {...props} className="scroll-thin my-2 overflow-auto rounded-field bg-deep p-3 font-mono text-xs" />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code {...props} className={`${className ?? ''} font-mono text-[0.9em]`} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="scroll-thin my-2 overflow-x-auto">
      <table {...props} className="border-collapse text-sm" />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th {...props} className="border border-line px-2 py-1 text-left font-medium" />,
  td: ({ node: _node, ...props }) => <td {...props} className="border border-line px-2 py-1" />,
};

/**
 * Renders model output. Raw HTML in the text stays text (react-markdown does not parse it), and unsafe link
 * protocols such as javascript: are dropped by its default URL handling.
 */
export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}
