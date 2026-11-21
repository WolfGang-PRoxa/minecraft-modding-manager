// Mise en forme des textes venus de l'extérieur (issue, message de commit) avant de les afficher.

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Le contenu d'une issue vient de n'importe qui : rien n'est inséré dans une page ou un mail sans être échappé. */
export const esc = (text: string) => text.replace(/[&<>"']/g, (char) => ENTITIES[char]);

/**
 * Texte échappé, avec le peu de Markdown qui aide à lire une issue : gras, ligne en italique, filet de séparation.
 * Les balises ajoutées sont fixes : rien de ce qu'a écrit l'auteur n'est interprété comme du HTML.
 */
export function paragraphs(text: string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^_(.+)_$/gm, '<em>$1</em>')
    .replace(/^-{3,}$/gm, '<hr style="border:0;border-top:1px solid rgba(128,128,128,.35);margin:4px 0;">')
    .replace(/\r?\n/g, '<br>');
}

/** Sans les caractères de contrôle (sauf tabulation et saut de ligne), qui n'ont rien à faire dans un texte. */
export const plain = (text: string) => text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');

/**
 * Recolle les lignes coupées à la main au milieu d'une phrase (corps d'un message de commit) : un téléphone les
 * afficherait en escalier. Une ligne qui finit une phrase, une ligne vide ou une liste gardent leur retour.
 */
export const unwrap = (text: string) => text.replace(/([^.!?:…\s])[ \t]*\n(?=[^\n])(?![-*•] |\d+[.)] )/g, '$1 ');

export function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

/** Lignes d'attribution automatique qu'un outil aurait ajoutées : elles n'ont pas leur place dans l'historique. */
const ATTRIBUTION = /^\s*(co-authored-by:.*|.*\bgenerated with\b.*|🤖.*)$/i;

/** Sépare un message de commit en titre et résumé, sans les lignes d'attribution. */
export function splitCommitMessage(message: string): { title: string; summary: string } {
  const lines = message
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !ATTRIBUTION.test(line));
  const title = (lines.shift() ?? '').trim();
  return { title, summary: lines.join('\n').trim() };
}
