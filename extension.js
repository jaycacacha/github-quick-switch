const vscode = require('vscode');
const { execFile } = require('child_process');
const os = require('os');

const CRED_KEY = 'credential.https://github.com.username';
let statusItem;
let ctx;

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: os.homedir(), windowsHide: true, timeout: 180000 }, (err, stdout, stderr) => {
      if (err) { err.stderr = stderr; return reject(err); }
      resolve(stdout.toString().trim());
    });
  });
}

async function listAccounts() {
  try {
    const out = await git(['credential-manager', 'github', 'list']);
    return out.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.includes(' ') && !l.includes(':'));
  } catch (e) {
    return null; // GCM missing or too old
  }
}

async function getActive() {
  try { return await git(['config', '--global', '--get', CRED_KEY]); } catch { return ''; }
}

async function getGlobal(key) {
  try { return await git(['config', '--global', '--get', key]); } catch { return ''; }
}
async function unsetGlobal(key) {
  try { await git(['config', '--global', '--unset', key]); } catch { /* already unset */ }
}

function identities() { return ctx.globalState.get('identities', {}); }
async function saveIdentity(user, id) {
  const all = identities(); all[user] = id; await ctx.globalState.update('identities', all);
}

async function askIdentity(user) {
  const current = identities()[user] || {};
  const name = await vscode.window.showInputBox({
    title: `Commit name for "${user}"`, prompt: 'Name shown on your commits (Esc to skip)',
    value: current.name || user, ignoreFocusOut: true
  });
  if (name === undefined) return current;
  const email = await vscode.window.showInputBox({
    title: `Commit email for "${user}"`, prompt: 'Email shown on your commits (Esc to skip)',
    value: current.email || '', ignoreFocusOut: true
  });
  if (email === undefined) return current;
  const id = { name, email };
  await saveIdentity(user, id);
  return id;
}

async function switchTo(user) {
  await git(['config', '--global', CRED_KEY, user]);
  let id = identities()[user];
  if (!id) id = await askIdentity(user);
  if (id && id.name) await git(['config', '--global', 'user.name', id.name]);
  if (id && id.email) await git(['config', '--global', 'user.email', id.email]);
  await refresh();
  vscode.window.setStatusBarMessage(`$(check) Now using GitHub account: ${user}`, 4000);
}

async function addAccount() {
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Log in to GitHub in the window/browser that just opened…', cancellable: false },
      () => git(['credential-manager', 'github', 'login'])
    );
    vscode.window.showInformationMessage('GitHub account added. Pick it from the dropdown.');
  } catch (e) {
    const pick = await vscode.window.showErrorMessage(
      'Could not add the account automatically. Try it in a terminal instead?', 'Open Terminal');
    if (pick) {
      const t = vscode.window.createTerminal('GitHub Login');
      t.show(); t.sendText('git credential-manager github login');
    }
  }
  await refresh();
}

async function removeAccount(accounts) {
  const user = await vscode.window.showQuickPick(accounts, { title: 'Remove which account?' });
  if (!user) return;
  const ok = await vscode.window.showWarningMessage(`Remove "${user}" from this computer?`, { modal: true }, 'Remove');
  if (ok !== 'Remove') return;
  try {
    await git(['credential-manager', 'github', 'logout', user]);
  } catch (e) {
    vscode.window.showErrorMessage('Remove failed: ' + (e.stderr || e.message));
    return refresh();
  }

  // Delete everything this extension saved for that account.
  const all = identities();
  const saved = all[user];
  delete all[user];
  await ctx.globalState.update('identities', all);

  // If it was the active account, clear the settings we applied for it.
  if (user === (await getActive())) {
    await unsetGlobal(CRED_KEY);
    if (saved) {
      if (saved.name && saved.name === (await getGlobal('user.name'))) await unsetGlobal('user.name');
      if (saved.email && saved.email === (await getGlobal('user.email'))) await unsetGlobal('user.email');
    }
  }
  vscode.window.showInformationMessage(`Removed "${user}" and its saved name/email.`);
  await refresh();
}

async function pick() {
  const accounts = await listAccounts();
  if (accounts === null) {
    vscode.window.showErrorMessage(
      'Git Credential Manager was not found or is too old. Update Git for Windows from git-scm.com, then try again.');
    return;
  }
  const active = await getActive();
  const items = accounts.map(u => ({
    label: `${u === active ? '$(check)' : '$(account)'} ${u}`,
    description: u === active ? 'active' : (identities()[u]?.email || ''),
    user: u
  }));
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: '$(add) Add GitHub account…', action: 'add' });
  if (accounts.length) {
    items.push({ label: '$(edit) Edit commit name/email…', action: 'edit' });
    items.push({ label: '$(trash) Remove account…', action: 'remove' });
  }

  const choice = await vscode.window.showQuickPick(items, {
    title: 'Switch GitHub account', placeHolder: accounts.length ? 'Pick the account to push with' : 'No accounts yet — add one'
  });
  if (!choice) return;
  try {
    if (choice.user) return await switchTo(choice.user);
    if (choice.action === 'add') return await addAccount();
    if (choice.action === 'remove') return await removeAccount(accounts);
    if (choice.action === 'edit') return await editIdentity(accounts);
  } catch (e) {
    vscode.window.showErrorMessage('Something went wrong: ' + (e.stderr || e.message));
  }
}

async function editIdentity(accounts) {
  accounts = accounts || (await listAccounts()) || [];
  const user = await vscode.window.showQuickPick(accounts, { title: 'Edit commit name/email for which account?' });
  if (!user) return;
  await askIdentity(user);
  if (user === (await getActive())) await switchTo(user);
}

async function refresh() {
  const active = await getActive();
  statusItem.text = `$(github) ${active || 'Pick GitHub account'}`;
  statusItem.tooltip = active ? `Git pushes as "${active}". Click to switch.` : 'Click to choose a GitHub account';
  statusItem.show();
}

function activate(context) {
  ctx = context;
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.command = 'ghSwitcher.pick';
  context.subscriptions.push(
    statusItem,
    vscode.commands.registerCommand('ghSwitcher.pick', pick),
    vscode.commands.registerCommand('ghSwitcher.add', addAccount),
    vscode.commands.registerCommand('ghSwitcher.editIdentity', () => editIdentity()),
    vscode.window.onDidChangeWindowState(s => { if (s.focused) refresh(); })
  );
  refresh();
}

function deactivate() {}

module.exports = { activate, deactivate };
