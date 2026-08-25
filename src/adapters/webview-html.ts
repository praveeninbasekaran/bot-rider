import * as vscode from 'vscode';

export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export function csp(webview: vscode.Webview, nonce: string): string {
  return [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
  ].join('; ');
}

export function webviewHtml(args: {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  scriptFile: string;
  styleFile: string;
  bodyClass?: string;
  extra?: string;
}): string {
  const nonce = getNonce();
  const scriptUri = args.webview.asWebviewUri(
    vscode.Uri.joinPath(args.extensionUri, 'media', args.scriptFile),
  );
  const styleUri = args.webview.asWebviewUri(
    vscode.Uri.joinPath(args.extensionUri, 'media', args.styleFile),
  );
  const policy = csp(args.webview, nonce);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${policy}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Bot Rider</title>
</head>
<body class="${args.bodyClass ?? ''}">
  ${args.extra ?? ''}
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
