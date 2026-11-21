import type { LucideIcon } from 'lucide-react';
import { File, FileImage, FileText } from 'lucide-react';
import type { ZipFileEntry } from '../../../shared/studio';

/** Dossier d'un zip, construit à partir de la liste de ses fichiers. */
export interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  files: ZipFileEntry[];
  size: number;
  count: number;
}

export const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true });

export function buildTree(files: ZipFileEntry[]): FolderNode {
  type Draft = Omit<FolderNode, 'folders'> & { folders: Map<string, Draft> };
  const draft = (name: string, path: string): Draft => ({
    name,
    path,
    folders: new Map(),
    files: [],
    size: 0,
    count: 0,
  });
  const root = draft('', '');
  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    node.size += file.size;
    node.count++;
    for (const part of parts.slice(0, -1)) {
      let child = node.folders.get(part);
      if (!child) node.folders.set(part, (child = draft(part, node.path ? `${node.path}/${part}` : part)));
      child.size += file.size;
      child.count++;
      node = child;
    }
    node.files.push(file);
  }
  const finish = (node: Draft): FolderNode => ({
    ...node,
    folders: [...node.folders.values()].sort((a, b) => byName(a.name, b.name)).map(finish),
    files: node.files.sort((a, b) => byName(a.path, b.path)),
  });
  return finish(root);
}

export function findFolder(root: FolderNode, path: string): FolderNode | null {
  let node: FolderNode | undefined = root;
  for (const part of path ? path.split('/') : []) node = node?.folders.find((f) => f.name === part);
  return node ?? null;
}

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export function fileIcon(path: string): LucideIcon {
  if (/\.(png|jpe?g|gif|webp)$/i.test(path)) return FileImage;
  if (/\.(jar|zip|class|dat|nbt|mca|ogg|bin)$/i.test(path)) return File;
  return FileText;
}
