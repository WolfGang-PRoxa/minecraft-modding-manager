import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface NotesProps {
  markdown: string;
  className?: string;
  /** Ouvre un lien dans le navigateur (par défaut via l'API de l'application des joueurs). */
  openLink?: (url: string) => void;
}

/** Notes de version en Markdown ; les liens s'ouvrent dans le navigateur. */
export function Notes({ markdown, className = '', openLink = (url) => void window.api.openExternal(url) }: NotesProps) {
  if (!markdown.trim()) {
    return <p className={`text-sm text-ink-400 italic ${className}`}>Pas de notes pour cette version.</p>;
  }
  return (
    <div className={`prose-notes ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) openLink(href);
              }}
            >
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
