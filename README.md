# markmerk-mods

A small [Claude Code](https://claude.com/claude-code) plugin marketplace. It holds two mods:
**runner-avatar** and **agent-workshop**.

## runner-avatar

A small Claude avatar lives in the band above your prompt and reacts to what Claude is doing.

![runner-avatar: the avatar runs while Claude works, shows the current tool, celebrates when the turn ends, and plays tennis when idle](assets/runner-avatar.gif)

### What it does

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

In the desktop app it is drawn as a vector image instead of block characters.

### Commands

| Command | Does |
| --- | --- |
| `/avatar` | hide or show the avatar |
| `/avatar hide` · `/avatar show` | the same, explicitly |
| `/avatar mute` · `/avatar unmute` | turn the end-of-turn chime off or on |
| `/avatar stay` · `/avatar roam` | keep it in one spot (it still runs on the spot, hops and reacts), or let it run back and forth again |
| `/avatar tennis` | start or stop a game of tennis (needs a terminal at least ~48 columns wide) |
| `/avatar jump` | make it hop |

Hide, mute and stay are remembered between sessions.

## agent-workshop

A pane with a small pixel-art workshop where you can watch Claude and its subagents work. Open it with
`/workshop`.

- **The room** is drawn in a three-quarter view, like an old RPG: a back wall with a door and
  windows, a wooden floor, furniture with height, and whatever stands nearer covering what is
  behind it. It is drawn with half-block pixels, so it works in any terminal. It has six stations:
  a desk with a monitor for `shell` (Bash), a bookshelf for `files` (Read, Grep, Glob), a writing
  desk with a lamp for `edit` (Edit, Write), a radio for `web` (WebFetch, WebSearch), a server rack
  for `mcp` (any MCP tool) and a round table with an orb for `agents` (Agent and the rest).
- **Claude** walks to the station of each tool it calls, faces it and types; the station
  comes alive (the screen scrolls, books slide out, the lamp lights, the rack blinks).
  **Subagents** come in through the door as smaller figures in their own colors, work at their
  stations and leave by the door when they finish. A bubble over each one shows what it is doing,
  `?` while it waits for your permission, `oops` when a call fails, and `done ✓ 12s` at the end of
  a turn.
- **Hooks**: the header names the last settings hook event that fired (`PreToolUse`,
  `SubagentStart`, `Stop`, …) and who raised it. Press `h` for a table of every hook event, how
  often it fired this session and when it fires; `f` goes back to the room. Hook events fire
  whether or not you have hooks configured, so you can see where a hook of yours would run.

**In 3D, every session at once, and in your hands**: `/workshop 3d` opens a window (Chrome's app
window when Chrome is installed, else your default browser) with real 3D, lighting and shadows,
and a room for every Claude Code session running this mod, in any project.

- **The building grows**: three rooms along one side of a corridor, then three facing them; then
  more corridors from a hall in the middle (east, west, north, south, a plus); then floors above
  and below. The floors are joined in the hall by a glass lift, whose car rides to the floor in
  view, and by stairs up and down: click the stairs, or a floor button at the top, to change
  floors, empty ones included (one beyond each way is always there). Each room has its project's name over
  it and a lamp over its door: green while the session works, amber while it waits for you. The
  wall between the camera and a room is cut away, so no room hides another.
- **Move around** like a map: drag to move, right-drag to turn, scroll to zoom, arrows or WASD to
  walk. Click a session's chip at the top, or a room, to fly there.
- **Use a session from the window**: clicking a room opens its panel, laid out like a chat. Type
  a prompt and press Enter, and it is sent to that session at once (it starts when the session is
  free; **Esc**, **×** or a click on the floor closes the panel). Type `/` for a menu of the session's slash commands (built-in, plugin and MCP), which run
  as if typed in its terminal; `@` for a menu of the project's files; paste or drop files to
  attach them (they are saved in the shared folder and their paths go with the prompt). The
  header shows the model (click it to switch with `/model`) and the permission mode; **Stop** ends
  the running turn. The **Chat** tab shows the conversation with the tools each answer used,
  **Edits** each edit's diff, **Activity** the agents, tool calls and hook events, and the todo
  list shows above them while there is one.
- **Answer permission requests, plans and questions**: when a session asks for permission, its
  panel shows what it wants to do (the command, or the edit's diff) with **Allow**, **Always
  allow** (the rule the terminal would offer), **Allow + accept edits** (for edits, switching the
  session to accept edits, the one way a plugin can change the permission mode) and **Deny**. A
  plan from plan mode can be approved there, and Claude's multiple-choice questions answered. The
  window gets 25 seconds to answer (two minutes for a plan or a question; a toast in the terminal
  says so); after that the terminal asks as usual.
- **Start a new session**: on the floor in view, the first free room on every side of every
  corridor is a dashed **+ new session**. Its panel has a **Choose folder…** button, which opens
  the system's folder dialog, a list of **recent projects** (the folders sessions ran in, from
  Claude Code's history) and a field for any folder; a Terminal window then opens running
  `claude` in the
  folder you chose, or `claude --continue` to pick up its last conversation (macOS); its room
  appears once it starts. **Choose another spot…** shows every free room on the floor, any
  corridor, either side, and the floor buttons reach a floor above and below: the session's room
  goes where you click. **⇄** in a session's panel moves its room the same way, and the session
  remembers its spot. The Terminal is opened with a small `.command` script rather than by
  scripting Terminal, so it works from sessions in Claude's desktop app too, where macOS may not
  let an app drive Finder or Terminal; there the folder dialog may not open, and the window says
  so and offers the recent projects.
- **Guests**: sessions running on this machine without the mod (started before it was set up)
  get rooms too, in a look of their own (deep-water walls, a teal rug, a velvet rope across the
  front, a 👁 guest sign), read from their processes and transcripts: their Claude goes to the
  station of the tool it is running, the screen shows its latest answer, and the panel its chat
  and tool calls. They are to watch only; restarting one with `claude --continue` (or trying
  `/reload-plugins` in it) makes it a room of its own.
- **Couriers between sessions**: sessions can message each other (Claude's SendMessage tool).
  When one does, a small Claude carries an envelope out of the sender's room, along the corridors
  and through the hall (by the lift between floors) into the receiver's, and each says so in a
  bubble. The receiver is not told which session wrote, so the window matches a delivery to a
  send by its words, else by its time; a message from outside the building comes up the lift.
- **⏻ ends a session**: it asks first, then Claude says goodbye at the door and the session exits
  as `/exit` does; the room folds away (as it does for a session closed in its terminal).
- **Tours**: the main tour shows each time the window opens until you tick **Don't show this
  again**; the **?** menu has it and shorter tours on the panel, slash commands and files,
  permissions, reading a room, building, starting and ending sessions, hooks and titles, and the
  terminal pane, with the parts they talk about lit up.
- **Sleep**: a session idle for 40 seconds has its Claude lie down on the rug, eyes shut, z's
  rising; it wakes at the first work. In the terminal pane it dozes too.
- **See what the model writes**: a screen on each room's back wall shows the answer as it
  streams, or what the model is thinking, and a thought cloud floats over an agent while it thinks.
  The panel's **Output** tab shows the answer as it streams, as Markdown, and the answers before
  it with the prompts they answered; **Edits** shows each edit's diff; **Activity** the agents,
  tool calls and hook events.
- **Finished answers pile up**: at the end of each turn the agent carries a sheet to the tray by
  the door, thicker for a longer answer. After an edit, its diff hangs over the editing desk for a
  while.
- **Context and cost**: a flask in each room fills as the context window does (amber from 60 %,
  red from 85 %, and it drains after a compaction), with the percent and what the session has cost.
- **Turn titles** (off by default): the **titles** switch at the top asks first, then has every
  session send each prompt to Haiku for a 3–6 word title, shown on the room's sign and its chip.
  That is one small extra request a turn, and it costs tokens.

`/workshop 3d off` closes it down.

How it works: the session that opened the window runs a small server, `web/server.py` (needs
`python3`), on `127.0.0.1` only, and beats a heartbeat into `~/.claude/agent-workshop/`. Every
session that sees the heartbeat writes its state there (`sessions/<id>.js`) a few times a second
and reads the commands the window leaves for it (`inbox/<id>/`). Commands need a random token that
only the page gets from the server, so no other web page or program can send them. Without
`python3` the window opens as a file and can only watch. With no window open, nothing is written.

The desktop app draws the pane's room as a picture; a pane too small for a room lists the agents
in words instead.

| Command | Does |
| --- | --- |
| `/workshop` | open the pane |
| `/workshop hooks` · `/workshop floor` | open it on the hooks table or the room |
| `/workshop close` | close it |
| `/workshop 3d` · `/workshop 3d off` | open every session in 3D in a window of its own, to watch and use them, or close it down |
| `/workshop clear` | reset the hook counts |
| `/workshop auto` | open it with every session (on terminals 144 columns or wider), or stop that |

## Install

```sh
claude plugin marketplace add MarkMerk/markmerk-mods
claude plugin install runner-avatar@markmerk-mods
claude plugin install agent-workshop@markmerk-mods
```

Then start a new Claude Code session. To update later:

```sh
claude plugin marketplace update markmerk-mods
```

To remove it: `claude plugin uninstall runner-avatar@markmerk-mods`.

## Privacy and security

**runner-avatar** makes no network calls, reads and writes no files, runs no processes and calls
no models. It uses the tool calls Claude makes (to label its bubble on your own screen, cut to 28
characters; keep that in mind when screen sharing), the session's context usage, and Claude
Code's local plugin store for three on/off settings (`isHidden`, `isMuted`, `isPinned`).

**agent-workshop**'s terminal pane writes nothing and sends nothing. The 3D window is where it
does more:

- **When.** Sessions share their state only while a window is in use: from the moment its page
  starts talking to the window's server until about 10 seconds after it stops (the server beats a
  heartbeat while the page asks it for anything). Without `python3` the window opens as a file to
  watch only, and the session that opened it keeps sharing on until `/workshop 3d off` or until it
  ends.
- **What, and where.** Into `~/.claude/agent-workshop/`, every session with the mod writes: its
  project folder; its agents and the tool calls they make (commands, file names, search patterns,
  URLs); up to 60 messages of its conversation, its last 12 answers with their prompts, the answer
  as it streams and what the model thinks; its edits' diffs; its todo list; its slash commands and
  what they printed, and the project's file list; messages to and from other sessions; context
  use and cost; and the whole input of a permission request waiting on the window (up to 20,000
  characters: for a Write, the file's content). The session running the window also reads the end
  of the transcripts of sessions running **without** the mod (guests, which cannot opt out),
  shell output included, and writes the same for them; and lists up to 30 folders sessions ran
  in, from `~/.claude/projects/`. Files you attach are kept in `uploads/`.
- **How long.** A session removes its own files, inbox and uploads when it ends. While a window is
  in use, the session running it clears every minute what was left behind: the files of sessions
  that stopped updating 10 minutes ago (a crash), answers nobody waited for, used launchers and
  keys, inboxes of sessions gone; the server clears uploads older than 7 days. Closing the window
  with `/workshop 3d off` removes the guests' files. With no window ever opened again, leftovers
  stay until one is.
- **Who can read it.** The folder is set to `0700` (only you) when the window opens and again
  every couple of seconds while sessions share; files inside may be readable by others, so it is
  the folder's mode that keeps other accounts out. The window's server listens on `127.0.0.1`
  only. Its token is never printed, put on a command line or written into a page: the browser
  opens a launcher file in the private folder, which hands the page a one-time key that the page
  trades for the token once. Without the token the server shows nothing but the page itself; it
  also refuses other host names, requests from other web sites, and being framed. Programs running
  as you can read your private folder, and so the sessions' state, as they can read anything
  else of yours.
- **Who can command it.** The window can send a session a prompt (it arrives as your own words),
  run its slash commands, stop it, start and end sessions, and answer its permission requests,
  plans and questions: "always allow" lists the rules it would add, "accept edits" is offered for
  edits and plans. It allows only what it shows whole: a request too long to show, hiding
  characters that reorder text, or running outside the sandbox can only be denied from the window,
  and allowed in the terminal. Commands travel as files in the private folder, so a program
  running as you could write them, as it could edit your Claude Code settings. Claude itself is
  refused any tool call that reads or writes that folder or reaches the window's server; this
  check is best effort (it reads paths and text), so for a fence the engine enforces, add deny
  rules to your settings, for example
  `"permissions": { "deny": ["Read(~/.claude/agent-workshop/**)", "Edit(~/.claude/agent-workshop/**)"] }`.
- **What leaves the machine.** The window loads three.js, its OrbitControls, marked and DOMPurify
  from cdnjs and jsDelivr, each pinned by hash; the server allows those four files and nothing
  else from outside. With **titles** switched on (a setting all sessions share), the first 2,000
  characters of each prompt go to Haiku for a title, which costs tokens. Nothing else is sent
  anywhere.
- **Commands it runs.** `python3` (the server), `open` or `xdg-open` (the browser, the launcher, a
  Terminal), `sh` (waiting for an answer, listing transcripts), `osascript` (the folder dialog),
  `pgrep`, `lsof`, `ls`, `tail`, `head`, `grep`, `stat` (finding guests and recent projects),
  `git ls-files` with the repository's fsmonitor and hooks off, or `find` outside a repository
  (the file list), `kill -0` (is the window's server alive), `mkdir`, `chmod`, `rm`.

## Layout

```
.claude-plugin/marketplace.json     the catalog Claude Code reads
assets/runner-avatar.gif            the demo above
plugins/runner-avatar/
├── .claude-plugin/plugin.json      name, version, description
├── README.md                       short readme for the plugin itself
├── hooks/hooks.json                points at register.js
├── hooks/register.js               moods, tennis, /avatar, chime
├── hooks/sprite.js                 draws the avatar and catches clicks
├── sounds/done.aiff                the end-of-turn chime
└── tests/runner-avatar.test.ts     run with: claude plugin test plugins/runner-avatar
plugins/agent-workshop/
├── .claude-plugin/plugin.json      name, version, description
├── README.md                       short readme for the plugin itself
├── hooks/hooks.json                points at register.js
├── hooks/register.js               agents, hook counts, /workshop, the pane
├── hooks/scene.js                  the pixel art: room, stations, agents
├── web/workshop.html               the 3D window (three.js)
├── web/server.py                   its server: the page, the state, the commands, behind a token
├── tests/agent-workshop.test.ts    run with: claude plugin test plugins/agent-workshop
└── tests/test_server.py            the server's own: python3 -m unittest discover -s tests
```

## License

MIT, see [LICENSE](LICENSE).
