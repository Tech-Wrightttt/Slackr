import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ZoomableImage } from './ZoomableImage';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  return (
    <div className={`prose prose-invert prose-slate max-w-none break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ node, children, ...props }) => {
            const hasImage = node?.children?.some((c: any) => c.tagName === 'img');
            if (hasImage) {
              return <div className="my-4">{children}</div>;
            }
            return <p {...props}>{children}</p>;
          },
          img: ({ node, ...props }) => (
            <ZoomableImage
              src={props.src as string}
              alt={props.alt || 'Question Diagram'}
              title={props.title}
            />
          ),
          table: ({ node, ...props }) => (
            <div className="my-3 overflow-x-auto rounded-md border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-left text-sm" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="bg-slate-800/80 px-3 py-2 font-semibold text-slate-200" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-2 text-slate-300 border-t border-slate-800/50" {...props} />
          ),
          code: ({ node, className, children, ...props }: any) => {
            const isInline = !className?.includes('language-');
            return isInline ? (
              <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-sky-300" {...props}>
                {children}
              </code>
            ) : (
              <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/90 p-4 font-mono text-xs text-slate-200">
                <code {...props}>{children}</code>
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
