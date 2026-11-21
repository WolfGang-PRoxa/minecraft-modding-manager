import { RelayError, type RelayConfig } from './config.mts';
import {
  advanceBranch,
  branchHead,
  compare,
  createCommit,
  createTree,
  getCommit,
  getTree,
  type ChangedFile,
  type TreeEntry,
} from './github.mts';

// La fusion d'une proposition est faite ici, commit par commit, et non par GitHub : une fusion faite par GitHub
// (pull request, bouton « Merge ») est signée de l'adresse du compte, qui peut être son adresse personnelle.
// Le commit posé sur la branche principale porte l'identité du commit qui le précède : celle du dépôt.

const CONFLICT =
  'La branche principale a changé depuis cette proposition, et touche aux mêmes fichiers. Utilise « Invalider » et demande de reprendre la correction sur la version actuelle.';

const paths = (files: ChangedFile[]) =>
  files.flatMap((file) => (file.previous_filename ? [file.filename, file.previous_filename] : [file.filename]));

/** Ce que la proposition change, sous forme d'entrées à poser sur l'arbre de la branche principale. */
function proposalEntries(files: ChangedFile[], headTree: TreeEntry[]): TreeEntry[] {
  const byPath = new Map(headTree.map((entry) => [entry.path, entry]));
  const remove = (path: string): TreeEntry => ({ path, mode: '100644', type: 'blob', sha: null });
  return files.flatMap((file) => {
    if (file.status === 'removed') return [remove(file.filename)];
    const entry = byPath.get(file.filename);
    if (!entry) throw new RelayError(`Fichier introuvable dans la proposition : ${file.filename}.`, 409);
    const { path, mode, type, sha } = entry;
    return file.status === 'renamed' && file.previous_filename
      ? [remove(file.previous_filename), { path, mode, type, sha }]
      : [{ path, mode, type, sha }];
  });
}

/**
 * Pose la proposition (`headSha`) sur la branche `base` en un seul commit, et renvoie ce commit.
 * Si la branche principale a avancé depuis, les fichiers de la proposition sont reportés sur sa version actuelle,
 * à condition qu'elle n'ait touché à aucun d'eux ; sinon la fusion est refusée.
 */
export async function mergeProposal(
  config: RelayConfig,
  proposal: { base: string; headSha: string; message: string },
): Promise<string> {
  const baseSha = await branchHead(config, proposal.base);
  if (!baseSha) throw new RelayError(`Branche ${proposal.base} introuvable.`, 404);
  const [baseCommit, headCommit, changes] = await Promise.all([
    getCommit(config, baseSha),
    getCommit(config, proposal.headSha),
    compare(config, baseSha, proposal.headSha),
  ]);
  if (changes.files.length === 0)
    throw new RelayError('Cette proposition ne modifie aucun fichier : il n’y a rien à fusionner.', 409);

  let tree = headCommit.tree.sha;
  if (changes.mergeBase !== baseSha) {
    const since = await compare(config, changes.mergeBase, baseSha);
    if (!changes.complete || !since.complete) throw new RelayError(CONFLICT, 409);
    const touched = new Set(paths(since.files));
    if (paths(changes.files).some((path) => touched.has(path))) throw new RelayError(CONFLICT, 409);
    const headTree = await getTree(config, headCommit.tree.sha);
    if (!headTree.complete) throw new RelayError(CONFLICT, 409);
    tree = await createTree(config, baseCommit.tree.sha, proposalEntries(changes.files, headTree.entries));
  }

  const commit = await createCommit(config, {
    message: proposal.message,
    tree,
    parent: baseSha,
    author: baseCommit.author,
  });
  try {
    await advanceBranch(config, proposal.base, commit);
  } catch (err) {
    if (err instanceof RelayError && err.status === 422) {
      throw new RelayError('La branche principale vient de changer : réessaie dans un instant.', 409);
    }
    throw err;
  }
  return commit;
}
