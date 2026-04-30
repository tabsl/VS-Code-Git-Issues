import { vi } from 'vitest';

export const Uri = {
  parse: (url: string) => ({ toString: () => url, fsPath: url }),
  joinPath: (...parts: unknown[]) => ({ toString: () => parts.join('/'), fsPath: parts.join('/') }),
};

export const ThemeIcon = class {
  constructor(public id: string, public color?: unknown) {}
};

export const ThemeColor = class {
  constructor(public id: string) {}
};

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export class TreeItem {
  label?: string;
  description?: string;
  tooltip?: string;
  iconPath?: unknown;
  contextValue?: string;
  command?: unknown;
  collapsibleState?: number;

  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class EventEmitter {
  private listeners: Array<(...args: any[]) => void> = [];
  event = (listener: (...args: any[]) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data?: unknown) {
    this.listeners.forEach(l => l(data));
  }
}

export class Disposable {
  constructor(private callOnDispose: () => void) {}
  dispose() { this.callOnDispose(); }
}

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };

type ScopedStore = Record<string, unknown>;
const globalStore: ScopedStore = {};
const workspaceStore: ScopedStore = {};
const workspaceFolderStore: ScopedStore = {};

function effectiveValue<T>(fullKey: string, defaultValue: T): T {
  if (Object.prototype.hasOwnProperty.call(workspaceFolderStore, fullKey)) {
    return workspaceFolderStore[fullKey] as T;
  }
  if (Object.prototype.hasOwnProperty.call(workspaceStore, fullKey)) {
    return workspaceStore[fullKey] as T;
  }
  if (Object.prototype.hasOwnProperty.call(globalStore, fullKey)) {
    return globalStore[fullKey] as T;
  }
  return defaultValue;
}

function pickStore(target: number | undefined): ScopedStore {
  if (target === 2) { return workspaceStore; }      // ConfigurationTarget.Workspace
  if (target === 3) { return workspaceFolderStore; } // ConfigurationTarget.WorkspaceFolder
  return globalStore;
}

export const workspace = {
  getConfiguration: vi.fn((section?: string) => ({
    get: vi.fn(<T>(key: string, defaultValue: T): T => {
      const fullKey = section ? `${section}.${key}` : key;
      const value = effectiveValue(fullKey, undefined as unknown as T);
      return value === undefined ? defaultValue : value;
    }),
    update: vi.fn(async (key: string, value: unknown, target?: number) => {
      const fullKey = section ? `${section}.${key}` : key;
      const store = pickStore(target);
      if (value === undefined) {
        delete store[fullKey];
      } else {
        store[fullKey] = value;
      }
    }),
    inspect: vi.fn(<T>(key: string) => {
      const fullKey = section ? `${section}.${key}` : key;
      return {
        key: fullKey,
        globalValue: globalStore[fullKey] as T | undefined,
        workspaceValue: workspaceStore[fullKey] as T | undefined,
        workspaceFolderValue: workspaceFolderStore[fullKey] as T | undefined,
      };
    }),
  })),
  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
  onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
};

export const __resetConfigStores = () => {
  for (const k of Object.keys(globalStore)) { delete globalStore[k]; }
  for (const k of Object.keys(workspaceStore)) { delete workspaceStore[k]; }
  for (const k of Object.keys(workspaceFolderStore)) { delete workspaceFolderStore[k]; }
};

export const window = {
  createOutputChannel: vi.fn(() => ({
    appendLine: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  })),
  createTreeView: vi.fn(() => ({ dispose: vi.fn() })),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showInputBox: vi.fn(),
  showQuickPick: vi.fn(),
  createWebviewPanel: vi.fn(),
  activeTextEditor: undefined,
};

export const commands = {
  registerCommand: vi.fn((id: string, callback: (...args: any[]) => any) => {
    return { dispose: vi.fn() };
  }),
};

export const env = {
  openExternal: vi.fn(),
};

export const ViewColumn = { One: 1, Two: 2, Three: 3 };
