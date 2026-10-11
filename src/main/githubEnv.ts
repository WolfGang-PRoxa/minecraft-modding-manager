import { repoApiUrl } from '../shared/repo'
import type { RepoRef } from '../shared/types'

// En test, MPD_GITHUB_API (http://localhost:<port>/repos/o/r) remplace l'API de n'importe quel dépôt.
let override: string | null = null

export function setGitHubApiOverride(url: string | null | undefined): void {
  override = url ? url.replace(/\/+$/, '') : null
}

export function repoApiBase(repo: RepoRef): string {
  return override ?? repoApiUrl(repo)
}

export function userApiUrl(): string {
  return override ? override.replace(/\/repos\/[^/]+\/[^/]+$/, '/user') : 'https://api.github.com/user'
}

export const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'ModpackManager'
}
