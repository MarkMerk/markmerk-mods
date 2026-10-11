# agent-workshop

Watch Claude and its subagents work, and use all your sessions from one window.

![agent-workshop: every Claude Code session as a room in a 3D building](https://raw.githubusercontent.com/MarkMerk/markmerk-mods/main/assets/agent-workshop.webp)

- **`/workshop`** opens a pixel-art pane in the terminal: Claude and its subagents walk between
  tool stations (a desk with a monitor for Bash, a bookshelf for reading and searching, a writing
  desk for edits, a radio for the web, a server rack for MCP tools, a round table for subagents),
  with a bubble saying what each is doing. The header names the last hook event that fired;
  press `h` for a table of every hook event with its count and when it fires.
- **`/workshop 3d`** opens a 3D window with a room for every Claude Code session running this
  mod, in any project, in a building that grows from one corridor to several floors. Click a room
  to prompt that session, run its slash commands, stop it, answer its permission requests, plans
  and questions, or end it; start new sessions in a folder you pick. Each room shows the answer as
  it streams, the model's thinking, finished answers, edits and the context window.
- **English and German**: `/workshop lang de` or the **EN/DE** switch in the window.

```sh
claude plugin marketplace add MarkMerk/markmerk-mods
claude plugin install agent-workshop@markmerk-mods
```

Commands: `/workshop`, `/workshop hooks|floor|close|clear|auto|3d|3d off|lang de|lang en|help`.

Full docs: <https://github.com/MarkMerk/markmerk-mods#agent-workshop>

The terminal pane sends nothing anywhere. The 3D window needs `python3` to send commands; it writes
the sessions' state into `~/.claude/agent-workshop/` (closed to other users), is served on
127.0.0.1 behind a random token, and loads three.js, marked and DOMPurify from a CDN; titles, when
switched on, use Haiku. Full details: <https://github.com/MarkMerk/markmerk-mods#privacy-and-security>
