import * as vscode from 'vscode';
import { RepositoryResolver, type DetectedRepository } from '../git/RepositoryResolver';
import { RepositorySelection } from '../git/RepositorySelection';

export async function selectRepositories(
  state: vscode.Memento,
  getActiveRepository: () => DetectedRepository | null,
  reinitializeProvider: () => Promise<void>
): Promise<void> {
  const detected = await RepositoryResolver.detectAll();
  if (detected.length === 0) {
    vscode.window.showInformationMessage(
      'Git Issues: No git repositories with an "origin" remote found in workspace'
    );
    return;
  }

  const stored = RepositorySelection.readStored(state);
  const effective = RepositorySelection.effective(stored, detected);
  const preselected = new Set(
    effective.length > 0
      ? effective.map(d => d.rootPath)
      : [getActiveRepository()?.rootPath]
  );

  const items = detected.map(d => ({
    label: `${d.remote.owner}/${d.remote.repo}`,
    description: d.displayName,
    detail: d.rootPath,
    picked: preselected.has(d.rootPath),
    folderPath: d.rootPath,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select repositories to show (none = follow the active editor)',
    canPickMany: true,
  });
  if (!picked) { return; }

  await RepositorySelection.writeStored(
    state,
    RepositorySelection.merge(picked.map(p => p.folderPath), stored, detected)
  );
  await reinitializeProvider();
}
