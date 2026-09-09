const assert = require('node:assert/strict');
const vscode = require('vscode');

async function run() {
  const extension = vscode.extensions.getExtension('botrider.bot-rider');
  assert.ok(extension, 'Packaged extension is discoverable');
  await extension.activate();
  assert.equal(extension.isActive, true, 'Extension activates');

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'botrider.bots.create',
    'botrider.chat.expand',
    'botrider.changeset.approve',
    'botrider.onboarding.reopen',
  ]) {
    assert.ok(commands.includes(command), `${command} is registered`);
  }
  await vscode.commands.executeCommand('botrider.onboarding.reopen');
}

module.exports = { run };
