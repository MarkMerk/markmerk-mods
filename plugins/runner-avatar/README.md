# runner-avatar

A small Claude avatar that lives above your prompt and reacts to what Claude is doing: it runs while
Claude works, shows the current tool, flinches when a tool fails, celebrates when the turn ends,
chimes after long turns, and plays tennis when things are quiet.

```sh
claude plugin marketplace add MarkMerk/markmerk-mods
claude plugin install runner-avatar@markmerk-mods
```

Commands: `/avatar` (hide/show), `/avatar mute|unmute`, `/avatar tennis`, `/avatar jump`.

It makes no network calls and reads or writes no files. Full docs, demo and privacy notes:
<https://github.com/MarkMerk/markmerk-mods#runner-avatar>
