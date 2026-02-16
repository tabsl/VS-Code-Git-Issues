import type { VsCodeApi, MessageToExtension } from '../types';

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode: VsCodeApi = acquireVsCodeApi();

export function postMessage(message: MessageToExtension): void {
  vscode.postMessage(message);
}
