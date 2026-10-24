import { RelayError, type RelayConfig } from './config.mts'

export interface Issue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  created_at: string
  updated_at: string
  html_url: string
  /** Présent quand « l'issue » est en fait une pull request. */
  pull_request?: unknown
  user: { login: string } | null
  labels: Array<{ name: string } | string>
}

export interface IssueComment {
  body: string | null
  user: { login: string } | null
}

export interface ChangedFile {
  filename: string
  status: string
  additions: number
  deletions: number
  /** Ancien chemin d'un fichier renommé. */
  previous_filename?: string
}

export interface Commit {
  sha: string
  message: string
  tree: { sha: string }
  author: { name: string; email: string }
}

export interface TreeEntry {
  path: string
  mode: string
  type: string
  /** null supprime le fichier. */
  sha: string | null
}

/** Ce qu'une branche apporte par rapport à une autre, depuis leur ancêtre commun. */
export interface Comparison {
  mergeBase: string
  files: ChangedFile[]
  /** Faux quand GitHub a tronqué la liste des fichiers : on ne peut alors rien conclure. */
  complete: boolean
}

/**
 * Branches poussées par une session de correction : « correction/issue-12 », quel que soit le préfixe, sauf celles de
 * la routine d'évaluation (`evaluation/issue-12` ou `claude/evaluation-issue-12`, voir risk.mts).
 */
const FIX_BRANCH = /^[\w.-]+\/issue-(\d+)(?:[-/].*)?$/

export function issueOfBranch(branch: string): number | null {
  if (/^(evaluation\/|claude\/evaluation-)/.test(branch)) return null
  const match = FIX_BRANCH.exec(branch)
  return match ? Number(match[1]) : null
}

/** Étiquettes posées sur l'issue pour suivre où en est sa correction. */
export const LABEL_RUNNING = 'correction-en-cours'
export const LABEL_PROPOSED = 'correction-proposee'

async function api<T>(config: RelayConfig, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${config.githubApi}/repos/${config.repo}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'modding-manager-relay',
        Authorization: `Bearer ${config.githubToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw new RelayError('GitHub ne répond pas. Réessaie dans un instant.', 502)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!res.ok) {
    let detail = ''
    try {
      detail = (JSON.parse(text) as { message?: string }).message ?? ''
    } catch {
      // réponse non JSON
    }
    if (res.status === 401) throw new RelayError('GitHub refuse le jeton du relais (GITHUB_TOKEN) : il a expiré ou a été révoqué.', 502)
    throw new RelayError(`GitHub a répondu ${res.status}${detail ? ` : ${detail}` : ''} (${method} ${path}).`, res.status)
  }
  return (text ? JSON.parse(text) : undefined) as T
}

/** Chemin d'une référence : les « / » d'un nom de branche séparent des segments, ils ne sont pas encodés. */
const refPath = (branch: string) => branch.split('/').map(encodeURIComponent).join('/')

export const defaultBranch = async (config: RelayConfig) => (await api<{ default_branch: string }>(config, 'GET', '')).default_branch

export const getIssue = (config: RelayConfig, number: number) => api<Issue>(config, 'GET', `/issues/${number}`)

/** Derniers commentaires de l'issue (GitHub les donne du plus ancien au plus récent). */
export const listComments = (config: RelayConfig, number: number) =>
  api<IssueComment[]>(config, 'GET', `/issues/${number}/comments?per_page=100`)

export const closeIssue = (config: RelayConfig, number: number) =>
  api<Issue>(config, 'PATCH', `/issues/${number}`, { state: 'closed', state_reason: 'completed' })

/** Remplace l'étiquette de suivi de l'issue (null : aucune). Une étiquette inconnue est créée par GitHub. */
export async function setFixLabel(config: RelayConfig, issue: Issue, label: string | null): Promise<void> {
  const current = issue.labels.map((l) => (typeof l === 'string' ? l : l.name))
  for (const name of [LABEL_RUNNING, LABEL_PROPOSED]) {
    if (name !== label && current.includes(name)) {
      await api<void>(config, 'DELETE', `/issues/${issue.number}/labels/${encodeURIComponent(name)}`).catch(() => {})
    }
  }
  if (label && !current.includes(label)) await api<unknown>(config, 'POST', `/issues/${issue.number}/labels`, { labels: [label] })
}

/** Ajoute ou retire une étiquette de l'issue. */
export async function toggleLabel(config: RelayConfig, issue: Issue, label: string, on: boolean): Promise<void> {
  const present = hasLabel(issue, label)
  if (on && !present) await api<unknown>(config, 'POST', `/issues/${issue.number}/labels`, { labels: [label] })
  if (!on && present) await api<void>(config, 'DELETE', `/issues/${issue.number}/labels/${encodeURIComponent(label)}`)
}

/**
 * Retire une étiquette de l'issue et dit si elle y était. GitHub ne la retire qu'une fois : de deux appels
 * simultanés, un seul obtient vrai. Le relais s'en sert pour ne traiter qu'une fois un événement reçu en double.
 */
export async function takeLabel(config: RelayConfig, issue: number, label: string): Promise<boolean> {
  try {
    await api<unknown>(config, 'DELETE', `/issues/${issue}/labels/${encodeURIComponent(label)}`)
    return true
  } catch (err) {
    if (err instanceof RelayError && err.status === 404) return false
    throw err
  }
}

/** Issues (sans les pull requests) modifiées depuis `since`, ouvertes ou fermées. */
export async function listRecentIssues(config: RelayConfig, since: string): Promise<Issue[]> {
  const issues = await api<Issue[]>(config, 'GET', `/issues?state=all&since=${encodeURIComponent(since)}&per_page=100`)
  return issues.filter((issue) => !issue.pull_request)
}

/** Issues ouvertes qui portent une étiquette. */
export async function listLabeledIssues(config: RelayConfig, label: string): Promise<Issue[]> {
  const issues = await api<Issue[]>(config, 'GET', `/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`)
  return issues.filter((issue) => !issue.pull_request)
}

export const hasLabel = (issue: Issue, label: string) => issue.labels.some((l) => (typeof l === 'string' ? l : l.name) === label)

/** Branche de correction d'une issue, s'il y en a une : c'est elle qui dit qu'une proposition attend une réponse. */
export async function findFixBranch(config: RelayConfig, issue: number): Promise<string | null> {
  const branches = await api<Array<{ name: string }>>(config, 'GET', '/branches?per_page=100')
  return branches.find((branch) => issueOfBranch(branch.name) === issue)?.name ?? null
}

/** Commit en tête d'une branche, ou null si elle n'existe pas (ou plus). */
export async function branchHead(config: RelayConfig, branch: string): Promise<string | null> {
  try {
    return (await api<{ object: { sha: string } }>(config, 'GET', `/git/ref/heads/${refPath(branch)}`)).object.sha
  } catch (err) {
    if (err instanceof RelayError && err.status === 404) return null
    throw err
  }
}

export const getCommit = (config: RelayConfig, sha: string) => api<Commit>(config, 'GET', `/git/commits/${sha}`)

// Au-delà, GitHub pagine la liste des fichiers d'une comparaison.
const COMPARE_FILES_MAX = 300

/** `base` et `head` sont des commits, ou des noms de branche sans « / ». */
export async function compare(config: RelayConfig, base: string, head: string): Promise<Comparison> {
  const data = await api<{ merge_base_commit: { sha: string }; files?: ChangedFile[] }>(config, 'GET', `/compare/${base}...${head}`)
  const files = data.files ?? []
  return { mergeBase: data.merge_base_commit.sha, files, complete: files.length < COMPARE_FILES_MAX }
}

/** Tous les fichiers d'un arbre ; `complete` est faux si GitHub a tronqué la liste. */
export async function getTree(config: RelayConfig, sha: string): Promise<{ entries: TreeEntry[]; complete: boolean }> {
  const data = await api<{ tree: TreeEntry[]; truncated: boolean }>(config, 'GET', `/git/trees/${sha}?recursive=1`)
  return { entries: data.tree, complete: !data.truncated }
}

export const createTree = async (config: RelayConfig, baseTree: string, entries: TreeEntry[]) =>
  (await api<{ sha: string }>(config, 'POST', '/git/trees', { base_tree: baseTree, tree: entries })).sha

export async function createCommit(
  config: RelayConfig,
  commit: { message: string; tree: string; parent: string; author: { name: string; email: string } }
): Promise<string> {
  // Auteur et committer sont donnés explicitement : sans eux, GitHub signerait le commit de l'adresse du compte.
  const who = { ...commit.author, date: new Date().toISOString() }
  const body = { message: commit.message, tree: commit.tree, parents: [commit.parent], author: who, committer: who }
  return (await api<{ sha: string }>(config, 'POST', '/git/commits', body)).sha
}

/** Avance une branche vers un commit qui la prolonge ; GitHub refuse si elle a bougé entre-temps. */
export const advanceBranch = (config: RelayConfig, branch: string, sha: string) =>
  api<unknown>(config, 'PATCH', `/git/refs/heads/${refPath(branch)}`, { sha, force: false })

export const deleteBranch = (config: RelayConfig, branch: string) => api<void>(config, 'DELETE', `/git/refs/heads/${refPath(branch)}`)

export const compareUrl = (config: RelayConfig, base: string, branch: string) => `https://github.com/${config.repo}/compare/${base}...${branch}`
