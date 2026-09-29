# GitHub Quick Switch

Got a work GitHub and a personal GitHub? Switch between them with one click. No more digging through Windows Credential Manager every time you push.

## How it works

Your active GitHub account shows in the bottom-left status bar. Click it to get a dropdown:

- **Pick an account**: Git push/pull now uses that account.
- **Add GitHub account…**: log in to another account (you only do this once per account).
- **Edit commit name/email…**: set the name and email your commits show for each account.
- **Remove account…**: log an account out of this computer.

When you switch, the extension also updates your commit name and email to match that account.

## Setup

1. Install the extension.
2. Click **Pick GitHub account** in the bottom-left corner.
3. Choose **Add GitHub account…** and log in. Repeat for each account.
4. Pick the account you want to use. That's it.

You can also open the dropdown from the Command Palette: **GitHub: Switch Account**.

## Requirements

- [Git](https://git-scm.com/) with **Git Credential Manager** (included with Git for Windows). If the extension says it can't find it, update Git.
- Works over HTTPS remotes (`https://github.com/...`). SSH remotes use SSH keys instead and aren't affected.

## What it changes

Switching runs these global Git settings for you:

```
git config --global credential.https://github.com.username <account>
git config --global user.name  <your name>
git config --global user.email <your email>
```

## Privacy

- The only thing this extension saves is the commit name/email you enter for each account, stored locally in VS Code.
- **Remove account…** deletes that account's login and its saved name/email, and clears the Git settings if it was the active account.
- Passwords and tokens are handled by Git Credential Manager in your OS's secure storage. This extension never reads or stores them.
- No network requests, no tracking, no analytics. Nothing leaves your computer.

## Notes

- If a repo has its own `credential.username` set locally, that repo will keep using it.
- Not affiliated with or endorsed by GitHub.

## License

MIT
