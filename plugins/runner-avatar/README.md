# runner-avatar

A small Claude avatar lives in the band above your prompt and reacts to what Claude is doing: it
runs while Claude works, shows the current tool, flinches when a tool fails, celebrates when the
turn ends, chimes after long turns, and plays tennis when things are quiet.

> **New in 1.0.0:** works in **Visual Studio Code**. In VS Code and the desktop app it is drawn as
> a vector image; in the terminal, with block characters.

![runner-avatar: the avatar runs while Claude works, shows the current tool, celebrates when the turn ends, and plays tennis when idle](https://raw.githubusercontent.com/MarkMerk/markmerk-mods/main/assets/runner-avatar.gif)

- [Install](#install)
- [What it does](#what-it-does)
- [Commands](#commands)
- [Privacy](#privacy)
- [Files](#files)

## Install

```sh
claude plugin marketplace add MarkMerk/markmerk-mods
claude plugin install runner-avatar@markmerk-mods
```

Then start a new Claude Code session. To update:

```sh
claude plugin marketplace update markmerk-mods
claude plugin update runner-avatar@markmerk-mods
```

| Where | How it looks |
| --- | --- |
| Terminal | block characters, in a band of its own above the prompt |
| Desktop app | a vector image |
| VS Code | a vector image |

## What it does

| When | The avatar |
| --- | --- |
| Nothing is happening | strolls slowly back and forth, plays a short game of tennis after about 20 seconds, then falls asleep (`zZz`) |
| You send a prompt | stops and looks up (`!`) |
| Claude is working | runs, and its bubble shows the current tool: the start of a Bash command, the file being read or edited, `searching`, `browsing`, … plus how full the context window is |
| A tool call fails or is blocked | flinches (`oops` / `blocked`) |
| A subagent is working | a small copy of it runs alongside (up to three) |
| The turn ends | does a little dance (`done ✓ 12s`), or shows `stopped` / `error` |
| The turn took 15 s or longer | plays a short chime, so you can look away while Claude works |
| Context is 85 % full or more | turns red |
| You click it | hops |

## Commands

| Command | Does |
| --- | --- |
| `/avatar` | hide or show the avatar |
| `/avatar hide` · `/avatar show` | the same, explicitly |
| `/avatar mute` · `/avatar unmute` | turn the end-of-turn chime off or on |
| `/avatar stay` · `/avatar roam` | keep it in one spot (it still runs on the spot, hops and reacts), or let it run back and forth again |
| `/avatar tennis` | start or stop a game of tennis (needs a terminal at least ~48 columns wide) |
| `/avatar jump` | make it hop |

Hide, mute and stay are remembered between sessions.

## Privacy

runner-avatar makes no network calls, reads and writes no files, runs no processes and calls no
models. It uses the tool calls Claude makes (to label its bubble on your own screen, cut to 28
characters; keep that in mind when screen sharing), the session's context usage, and Claude Code's
local plugin store for three on/off settings (`isHidden`, `isMuted`, `isPinned`).

## Files

```
.claude-plugin/plugin.json      name, version, description
hooks/hooks.json                points at register.js
hooks/register.js               moods, tennis, /avatar, chime
hooks/sprite.js                 draws the avatar and catches clicks
sounds/done.aiff                the end-of-turn chime
tests/runner-avatar.test.ts
```

Part of [markmerk-mods](https://github.com/MarkMerk/markmerk-mods). MIT license.
