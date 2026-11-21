import { useMemo, type ComponentProps, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleAlert, ExternalLink, Info, Lightbulb, MessageSquareWarning, OctagonAlert } from 'lucide-react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Blockquote, Root, RootContent } from 'mdast';
import { frenchSpacing, type Heading } from '../../../shared/docs';
import { resolveLink, type DocLink } from './content';

const CALLOUTS = {
  note: { label: 'Remarque', icon: Info, tone: 'bg-sky-400/[0.07] ring-sky-400/25', accent: 'text-sky-300' },
  tip: { label: 'Astuce', icon: Lightbulb, tone: 'bg-grass-400/[0.07] ring-grass-400/25', accent: 'text-grass-300' },
  important: {
    label: 'Important',
    icon: MessageSquareWarning,
    tone: 'bg-violet-400/[0.08] ring-violet-400/25',
    accent: 'text-violet-300',
  },
  warning: {
    label: 'Attention',
    icon: CircleAlert,
    tone: 'bg-amber-glow/[0.08] ring-amber-glow/30',
    accent: 'text-amber-glow',
  },
  caution: { label: 'Prudence', icon: OctagonAlert, tone: 'bg-red-500/[0.08] ring-red-400/30', accent: 'text-red-300' },
} satisfies Record<string, { label: string; icon: LucideIcon; tone: string; accent: string }>;

type CalloutKind = keyof typeof CALLOUTS;

/**
 * Encadrés à la manière de GitHub : une citation qui commence par « [!NOTE] », « [!TIP] », « [!IMPORTANT] »,
 * « [!WARNING] » ou « [!CAUTION] » devient un `<aside class="callout callout-note">`, sans la mention.
 */
function remarkCallouts() {
  const mark = (quote: Blockquote) => {
    const paragraph = quote.children[0];
    const text = paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;
    if (paragraph?.type !== 'paragraph' || text?.type !== 'text') return;
    const match = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n|$)/i.exec(text.value);
    if (!match) return;
    text.value = text.value.slice(match[0].length);
    if (!text.value) paragraph.children.shift();
    if (paragraph.children.length === 0) quote.children.shift();
    Object.assign((quote.data ??= {}), {
      hName: 'aside',
      hProperties: { className: ['callout', `callout-${match[1].toLowerCase()}`] },
    });
  };
  const visit = (node: Root | RootContent) => {
    if (node.type === 'blockquote') mark(node);
    if ('children' in node) for (const child of node.children) visit(child);
  };
  return (tree: Root) => visit(tree);
}

/** Espaces insécables avant « : ; ! ? » et dans les guillemets, dans le texte seulement (ni code, ni adresses). */
function remarkFrenchSpacing() {
  const visit = (node: Root | RootContent) => {
    if (node.type === 'text') node.value = frenchSpacing(node.value);
    else if ('children' in node) for (const child of node.children) visit(child);
  };
  return (tree: Root) => visit(tree);
}

const REMARK_PLUGINS = [remarkGfm, remarkCallouts, remarkFrenchSpacing];

function Callout({ kind, children }: { kind: CalloutKind; children: ReactNode }) {
  const { label, icon: Icon, tone, accent } = CALLOUTS[kind];
  return (
    <aside className={`callout my-5 rounded-2xl px-5 py-4 ring-1 ring-inset ${tone}`}>
      <p className={`mb-1.5! flex items-center gap-2 text-sm font-semibold ${accent}`}>
        <Icon size={16} strokeWidth={2.25} /> {label}
      </p>
      {children}
    </aside>
  );
}

interface DocMarkdownProps {
  markdown: string;
  /** Fichier d'où vient le texte (chemin depuis la racine du dépôt), pour résoudre ses liens relatifs. */
  path: string;
  /** Titres de la page, avec leurs ancres (calculées comme sur GitHub). */
  headings?: Heading[];
  onLink: (link: DocLink) => void;
  className?: string;
}

const NO_HEADINGS: Heading[] = [];

/** Page de documentation en Markdown : titres ancrés, liens entre pages, encadrés, tableaux et blocs de code. */
export function DocMarkdown({ markdown, path, headings = NO_HEADINGS, onLink, className = '' }: DocMarkdownProps) {
  // Composants stables tant que la page ne change pas : sinon React recréerait chaque titre à chaque rendu.
  const components = useMemo<Components>(() => {
    const idAt = (line: number | undefined) => headings.find((heading) => heading.line === line)?.id;
    const heading =
      (Tag: 'h2' | 'h3' | 'h4') =>
      ({ node, children }: ComponentProps<'h2'> & ExtraProps) => {
        const id = idAt(node?.position?.start.line);
        return (
          <Tag id={id} className="group">
            {children}
            {id && (
              <a
                href={`#${id}`}
                aria-label="Lien vers cette section"
                onClick={(e) => {
                  e.preventDefault();
                  onLink(resolveLink(path, `#${id}`));
                }}
                className="ml-2 text-ink-500 no-underline! opacity-0 transition group-hover:opacity-100 hover:text-grass-300"
              >
                #
              </a>
            )}
          </Tag>
        );
      };

    return {
      h2: heading('h2'),
      h3: heading('h3'),
      h4: heading('h4'),
      a: ({ href, children }) => {
        const link = href ? resolveLink(path, href) : ({ kind: 'none' } as const);
        return (
          <a
            href={href}
            title={link.kind === 'external' ? link.url : undefined}
            onClick={(e) => {
              e.preventDefault();
              onLink(link);
            }}
          >
            {children}
            {link.kind === 'external' && (
              <ExternalLink size={12} className="ml-0.5 inline-block -translate-y-px opacity-60" />
            )}
          </a>
        );
      },
      aside: ({ className: name, children }) => {
        const kind = /callout-(\w+)/.exec(name ?? '')?.[1];
        return kind && kind in CALLOUTS ? (
          <Callout kind={kind as CalloutKind}>{children}</Callout>
        ) : (
          <aside>{children}</aside>
        );
      },
      table: ({ children }) => (
        <div className="table-wrap">
          <table>{children}</table>
        </div>
      ),
      img: ({ alt }) => (alt ? <span className="text-ink-400 italic">[{alt}]</span> : null),
    };
  }, [headings, path, onLink]);

  return (
    <div className={`prose-docs ${className}`}>
      <Markdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
