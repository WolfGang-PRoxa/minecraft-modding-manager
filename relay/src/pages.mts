import { esc, paragraphs } from './text.mts'

// Pages ouvertes par les boutons des mails. Un lien ne fait jamais rien à lui seul (les messageries les visitent
// pour les vérifier) : chaque action demande un clic sur un bouton de la page.

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; padding: 24px 16px; background: #0a0d12; color: #e6ebf2;
         font: 16px/1.55 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 28px; background: #121821; border: 1px solid #232c3a; border-radius: 20px; }
  .brand { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #7ed957; }
  h1 { margin: 8px 0 6px; font-size: 22px; line-height: 1.3; }
  p { margin: 10px 0; color: #b4bfcd; }
  .quote { margin: 16px 0; padding: 14px 16px; background: #0c1118; border: 1px solid #232c3a; border-radius: 12px;
           font-size: 14.5px; color: #dbe2ec; word-break: break-word; }
  .files { font: 13px/1.7 Consolas, 'Courier New', monospace; color: #9aa7b8; word-break: break-all; }
  label { display: block; margin: 18px 0 8px; font-size: 12px; font-weight: 700; letter-spacing: .08em;
          text-transform: uppercase; color: #8d9aab; }
  textarea { width: 100%; min-height: 150px; padding: 12px 14px; background: #0c1118; color: #e6ebf2; resize: vertical;
             border: 1px solid #2c3748; border-radius: 12px; font: inherit; font-size: 15px; }
  textarea:focus { outline: 2px solid #7ed957; outline-offset: 1px; }
  button { margin-top: 18px; padding: 13px 22px; border: 0; border-radius: 12px; background: #7ed957; color: #0a0d12;
           font: inherit; font-weight: 700; cursor: pointer; }
  button:disabled { opacity: .55; cursor: default; }
  a { color: #a6f08a; font-weight: 600; }
  .note { font-size: 13.5px; color: #8d9aab; }
  .ok { color: #a6f08a; } .warn { color: #ffcf66; } .error { color: #ff8f8f; }
`

function page(title: string, content: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Modpack Manager</title>
<style>${STYLE}</style>
</head>
<body><main><div class="brand">Modpack Manager</div>${content}</main></body>
</html>`
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  })
}

export interface ActionForm {
  title: string
  /** HTML déjà échappé, affiché sous le titre. */
  intro: string
  token: string
  submit: string
  /** Champ de texte libre, avec son libellé ; `required` impose de le remplir. */
  field?: { label: string; placeholder: string; required: boolean }
  /** Case transmise telle quelle (« relancer quand même »). */
  force?: boolean
}

/** Page de confirmation : le bouton envoie le formulaire, et se désactive pour éviter un double envoi. */
export function formPage(form: ActionForm): Response {
  const field = form.field
    ? `<label for="text">${esc(form.field.label)}</label>
<textarea id="text" name="text" maxlength="6000" placeholder="${esc(form.field.placeholder)}"${form.field.required ? ' required' : ''}></textarea>`
    : ''
  return page(
    form.title,
    `<h1>${esc(form.title)}</h1>${form.intro}
<form method="post" action="/action" onsubmit="this.querySelector('button').disabled = true">
<input type="hidden" name="t" value="${esc(form.token)}">${form.force ? '<input type="hidden" name="force" value="1">' : ''}
${field}
<button type="submit">${esc(form.submit)}</button>
</form>`
  )
}

export function resultPage(title: string, html: string, tone: 'ok' | 'warn' = 'ok'): Response {
  return page(title, `<h1 class="${tone}">${esc(title)}</h1>${html}`)
}

export function errorPage(message: string, status = 400): Response {
  return page('Action impossible', `<h1 class="error">Action impossible</h1><p>${esc(message)}</p>`, status)
}

export const quoteBlock = (text: string) => `<div class="quote">${paragraphs(text)}</div>`

export const linkTo = (url: string, label: string) => `<a href="${esc(url)}">${esc(label)}</a>`
