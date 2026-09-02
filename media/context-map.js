(function () {
  const vscode = acquireVsCodeApi();
  vscode.postMessage({ type: 'ui/ready' });
})();
