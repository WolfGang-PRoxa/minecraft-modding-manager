import type { RepoRef } from './types';

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;

/** Accepte « propriétaire/dépôt » ou une adresse github.com/propriétaire/dépôt (avec ou sans .git). */
export function parseRepo(input: string): RepoRef | null {
  let text = input.trim();
  const isUrl = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i.test(text);
  text = text.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '').replace(/[?#].*$/, '');
  const parts = text.split('/').filter(Boolean);
  // Une adresse peut pointer vers une page du dépôt (…/releases) : seuls les deux premiers segments comptent.
  if (parts.length < 2 || (!isUrl && parts.length > 2)) return null;
  const owner = parts[0];
  const name = parts[1].replace(/\.git$/i, '');
  if (!OWNER.test(owner) || !NAME.test(name) || name === '.' || name === '..') return null;
  return { owner, name };
}

export function isRepoRef(value: unknown): value is RepoRef {
  if (!value || typeof value !== 'object') return false;
  const { owner, name } = value as Record<string, unknown>;
  return typeof owner === 'string' && typeof name === 'string' && parseRepo(`${owner}/${name}`) !== null;
}

export const repoSlug = (repo: RepoRef): string => `${repo.owner}/${repo.name}`;
export const repoUrl = (repo: RepoRef): string => `https://github.com/${repo.owner}/${repo.name}`;
export const repoApiUrl = (repo: RepoRef): string => `https://api.github.com/repos/${repo.owner}/${repo.name}`;

export function sameRepo(a: RepoRef, b: RepoRef): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();
}
