# agent-workshop

A pane with a small pixel-art workshop: Claude and its subagents walk between tool stations (a desk with a
monitor for Bash, a bookshelf for reading and searching, a writing desk for edits, a radio for the
web, a server rack for MCP tools, a round table for subagents), face them and type, with a
bubble saying what each is doing. The header names the last hook event that fired; press `h` for a
table of every hook event with its count and when it fires.

The room is drawn in a three-quarter view with half-block pixels, so it works in any terminal.

```sh
claude plugin marketplace add MarkMerk/markmerk-mods
claude plugin install agent-workshop@markmerk-mods
```

`/workshop 3d` opens a window with real 3D: a building with a room for every Claude Code session
running this mod, in any project, growing from one corridor to a plus of corridors to several
floors. Move around it like a map; click a room to send that session a prompt, stop it, answer its
permission requests, or start a new session in a folder you pick. Each room shows the answer as
it streams on a screen, the model's thinking as a cloud, finished answers as a pile of sheets,
edits as diffs, and the context window as a flask; turn titles from Haiku are an opt-in switch.

Commands: `/workshop` (open), `/workshop hooks|floor|close|clear|auto|3d|3d off`.

Full docs: <https://github.com/MarkMerk/markmerk-mods#agent-workshop>

The terminal pane sends nothing anywhere. The 3D window writes the sessions' state into
`~/.claude/agent-workshop/` (closed to other users), is served on 127.0.0.1 behind a random token,
and loads three.js, marked and DOMPurify from a CDN; titles, when switched on, use Haiku. Full
details: <https://github.com/MarkMerk/markmerk-mods#privacy-and-security>
