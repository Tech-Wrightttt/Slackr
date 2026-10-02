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
    <div className={`prose dark:prose-invert max-w-none break-words text-on-surface ${className}`}>
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
            <div className="my-3 overflow-x-auto rounded-xl border border-outline-variant/30">
              <table className="min-w-full divide-y divide-outline-variant/30 text-left text-sm" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="bg-surface-container px-3 py-2 font-headline font-semibold text-on-surface text-xs" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-2 text-on-surface-variant border-t border-outline-variant/20 text-xs" {...props} />
          ),
          code: ({ node, className, children, ...props }: any) => {
            const isInline = !className?.includes('language-');
            return isInline ? (
              <code className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono-code text-xs text-primary font-medium" {...props}>
                {children}
              </code>
            ) : (
              <pre className="overflow-x-auto rounded-xl border border-outline-variant/30 bg-surface-container p-4 font-mono-code text-xs text-on-surface">
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
