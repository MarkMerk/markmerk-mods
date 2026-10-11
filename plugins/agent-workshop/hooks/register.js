import { MAIN, SUB, aisleY, doorSpot, drawing, layout, paint, rasterCells, spotAt, stationOf } from './scene.js'
import { GERMAN, HELP } from './words.js'

const PANE = 'agent-workshop'
const TITLE = 'Workshop'
const MAIN_COLOR = '#D97757'
const SUB_COLORS = ['#6A9BCC', '#7FB069', '#B48EAD', '#E3B341', '#4FB3BF']
// Milliseconds between ticks
const TICK_MS = 140
// Ticks a short bubble stays: an alert, a failed call, the end of a turn
const ALERT_TICKS = 8
const OOPS_TICKS = 14
const DONE_TICKS = 40
// Ticks between the main agent's strolls while nothing is happening
const STROLL_TICKS = 45
// Ticks of idling before the main agent falls asleep (about 40 seconds)
const SLEEP_TICKS = 285
const SNORES = ['z', 'z Z', 'z Z z']
// How far apart agents working at one station stand, in pixels
const SPACING = MAIN.w + 1
const NAME_MAX = 12
// Milliseconds between writes of the 3D window's state
const STATE_MS = 250
const BUBBLE_MAX = 18
const EVENT_WIDTH = 19

// When each settings hook fires, in the order a turn meets them
const HOOKS = [
  ['SessionStart', 'the session starts, resumes or is cleared'],
  ['UserPromptSubmit', 'you sent a prompt, before Claude reads it'],
  ['PreToolUse', 'before a tool runs: can allow, block or rewrite it'],
  ['PermissionRequest', 'a permission dialog is about to show'],
  ['PermissionDenied', 'a tool call was refused'],
  ['PostToolUse', 'after a tool call succeeded'],
  ['PostToolUseFailure', 'after a tool call failed'],
  ['PostToolBatch', 'after a batch of parallel tool calls'],
  ['SubagentStart', 'a subagent was spawned'],
  ['SubagentStop', 'a subagent finished its work'],
  ['Notification', 'Claude wants your attention'],
  ['PreCompact', 'before the context is compacted'],
  ['PostCompact', 'after the context was compacted'],
  ['Stop', 'Claude finished answering'],
  ['StopFailure', 'a turn ended on an API error'],
  ['SessionEnd', 'the session ends'],
]

// The agents in the room, by id: 'main' for Claude's own loop, the agent id for a subagent
let agents = new Map()
// How many tool calls each station is working on now
let busy = {}
// How often each hook event fired, and the last one, for the header
let counts = {}
let lastHook = null
// What the pane shows: the room, or the table of hooks
let view = 'floor'
let ticks = 0
// The room as the last draw laid it out, or null when it had no room for one
let room = null
let subagentsSeen = 0
let isAutoOpen = false
// A small generator of its own, so a test strolls the same way each time
let seed = 11

// The language the workshop speaks, here and in the window: 'en' or 'de', kept in the shared
// settings so every session and the window agree
let lang = 'en'
function tr(text, vars = {}) {
  const said = lang === 'de' ? (GERMAN[text] ?? text) : text
  return said.replace(/\{(\w+)\}/g, (all, name) => (name in vars ? String(vars[name]) : all))
}
function readLang(settings) {
  lang = settings?.lang === 'de' ? 'de' : 'en'
}

function roll(below) {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return Math.floor(seed / 65536) % below
}

function clip(text, max) {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim()
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

function basename(path) {
  return String(path ?? '').split('/').pop()
}

function newAgent(id, type) {
  const isMain = id === 'main'
  if (!isMain) subagentsSeen += 1
  const agent = {
    id,
    isMain,
    size: isMain ? MAIN : SUB,
    // A subagent's short name: its type and a number
    name: isMain ? 'main' : clip(String(type ?? 'agent').replace(/-purpose$/, ''), NAME_MAX - 3) + '#' + subagentsSeen,
    color: isMain ? MAIN_COLOR : SUB_COLORS[(subagentsSeen - 1) % SUB_COLORS.length],
    // Placed once the room is known: the main agent in the middle, a subagent at the door
    x: null,
    y: null,
    facing: 'down',
    isWalking: false,
    step: 0,
    stroll: null,
    station: null,
    calls: 0,
    isWaiting: false,
    isLeaving: false,
    bubble: '',
    bubbleColor: undefined,
    bubbleTicks: 0,
  }
  agents.set(id, agent)
  return agent
}

function agentFor(id, type) {
  const key = id ?? 'main'
  return agents.get(key) ?? newAgent(key, type)
}

function say(agent, text, forTicks = 0, background = undefined) {
  agent.bubble = clip(text, BUBBLE_MAX)
  agent.bubbleTicks = forTicks
  agent.bubbleColor = background
}

// The bubble's words for a tool call
function labelFor(e) {
  const tool = String(e.tool)
  if (tool === 'Bash') return '$ ' + (e.command ?? '')
  if (tool === 'Read' || tool === 'Edit' || tool === 'Write') return basename(e.file_path)
  if (tool === 'Grep' || tool === 'Glob') return String(e.pattern ?? tr('searching'))
  if (tool === 'WebFetch') return String(e.url ?? tr('fetching')).replace(/^https?:\/\//, '')
  if (tool === 'WebSearch') return String(e.query ?? tr('searching'))
  if (tool === 'Agent' || tool === 'Task') return String(e.description ?? tr('delegating'))
  if (tool.startsWith('mcp__')) return tool.split('__').pop()
  return tool
}

// Where an agent is heading, and which way it faces once there
function goalOf(agent) {
  if (agent.isLeaving) return { ...doorSpot(room, agent.size), facing: 'up' }
  if (agent.station !== null) {
    const spot = spotAt(room, agent.station, agent.size)
    // Several agents at one station stand side by side, the first in the middle
    const sharing = [...agents.values()].filter((other) => other.station === agent.station && !other.isLeaving)
    const place = sharing.indexOf(agent)
    const shift = place === 0 ? 0 : Math.ceil(place / 2) * SPACING * (place % 2 === 1 ? 1 : -1)
    return { ...spot, x: spot.x + shift }
  }
  return agent.stroll ?? { x: agent.x, y: agent.y, facing: 'down' }
}

// One step toward the goal: out to the aisle, along it, then in to the spot, so nobody walks
// through a station
function walk(agent) {
  const goal = goalOf(agent)
  const gx = Math.max(1, Math.min(room.width - agent.size.w - 1, Math.round(goal.x)))
  const gy = Math.max(0, Math.min(room.height - agent.size.h, Math.round(goal.y)))
  const aisle = aisleY(room, agent.size)
  const dx = gx - agent.x
  let heading = null
  if (dx !== 0 && agent.y !== aisle) {
    agent.y += Math.sign(aisle - agent.y)
    heading = aisle > agent.y ? 'down' : 'up'
  } else if (dx !== 0) {
    agent.x += Math.sign(dx) * Math.min(Math.abs(dx), Math.abs(dx) > 16 ? 2 : 1)
    heading = dx > 0 ? 'right' : 'left'
  } else if (gy !== agent.y) {
    agent.y += Math.sign(gy - agent.y)
    heading = gy > agent.y ? 'down' : 'up'
  }
  agent.isWalking = heading !== null
  if (agent.isWalking) agent.step += 1
  agent.facing = heading ?? goal.facing
  return agent.isWalking
}

// One tick of the clock: bubbles fade, and everyone walks a step
function tick() {
  ticks += 1
  for (const agent of [...agents.values()]) {
    if (agent.bubbleTicks > 0) {
      agent.bubbleTicks -= 1
      if (agent.bubbleTicks === 0) say(agent, '')
    }
    // A main agent idle long enough falls asleep where it stands, and wakes at the first work
    if (agent.isMain) {
      const isIdle = !isWorking && agent.calls === 0 && agent.station === null && !agent.isWaiting && agent.bubbleTicks === 0
      agent.idleTicks = isIdle ? (agent.idleTicks ?? 0) + 1 : 0
      const wasAsleep = agent.isAsleep === true
      agent.isAsleep = agent.idleTicks > SLEEP_TICKS
      if (agent.isAsleep) agent.bubble = SNORES[Math.floor(ticks / 8) % SNORES.length]
      else if (wasAsleep && SNORES.includes(agent.bubble)) agent.bubble = ''
    }
    // With no room drawn there is no door to walk to: a leaving subagent is just gone
    if (room === null) {
      if (agent.isLeaving) agents.delete(agent.id)
      continue
    }
    if (agent.x === null) {
      const start = agent.isMain ? { x: room.width / 2 - MAIN.w / 2, y: aisleY(room, MAIN) } : doorSpot(room, agent.size)
      agent.x = Math.round(start.x)
      agent.y = start.y
    }
    // With nothing to do, the main agent strolls about the middle of the room now and then
    if (agent.isMain && agent.station === null && !agent.isWaiting && !agent.isAsleep && ticks % STROLL_TICKS === 0) {
      agent.stroll = { x: 4 + roll(Math.max(1, room.width - MAIN.w - 8)), y: aisleY(room, MAIN) - 2 + roll(5), facing: 'down' }
    }
    const isMoving = walk(agent)
    if (!isMoving && agent.isLeaving) agents.delete(agent.id)
  }
}

// A hook event: counted, and named in the header
function record(event, e) {
  counts[event] = (counts[event] ?? 0) + 1
  const agentId = e.agent_id ?? e.agentId
  const who = agentId === undefined ? agents.get('main') : agents.get(agentId)
  lastHook = { event, who: who?.name ?? 'agent', color: who?.color ?? MAIN_COLOR }
}

// The color of each kind of hook event
function eventColor(event) {
  if (event.includes('Failure') || event.includes('Denied')) return '#E5484D'
  if (event.startsWith('Permission') || event === 'Notification') return '#F0883E'
  if (event.includes('ToolU') || event === 'PostToolBatch') return '#E3B341'
  if (event.startsWith('Subagent') || event.startsWith('Task') || event === 'TeammateIdle') return '#B48EAD'
  if (event === 'UserPromptSubmit' || event === 'Stop') return '#3FB950'
  return '#6A9BCC'
}

function pad(text, size) {
  const line = clip(text, size)
  return line + ' '.repeat(Math.max(0, size - line.length))
}

// The 3D window shows every session that runs this mod, a room each along one corridor. Each
// session publishes its state into one shared folder, but only while a window is open: the
// session that opened it writes a heartbeat there, and the others check for it now and then
const SHARED = '/.claude/agent-workshop'
// How often a session looks for the heartbeat, how old one may be, and how old a session's
// state may be before the window takes its room away
const WATCH_MS = 2000
const FRESH_MS = 8000
const GONE_MS = 15000

// How long a permission request waits for an answer from the window before the terminal asks,
// and how many recent tool calls and hook events the window's panel lists
const PERMISSION_WAIT_S = 25
const LONG_WAIT_S = 120
const HISTORY_MAX = 14

// This session as the window knows it: its id, its project and folder, when it started, and the
// shared folder
let self = { id: null, project: '', cwd: '', startedAt: 0, base: null }
// Whether a turn is running, and the main loop's turn, so the window can stop it
let isWorking = false
let turnId = null
// The latest tool calls and hook events, newest last, for the window's panel
let recentCalls = []
let recentHooks = []
// A permission request waiting for an answer from the window
let permission = null
// What the model is writing in this turn, and what it is thinking, as it streams; how much of each
// the window gets
let liveText = ''
let liveThinking = ''
const LIVE_MAX = 3000
// The prompt this turn answers, the answers so far, and the latest edits with their diffs
let turnPrompt = ''
let answers = []
let edits = []
const ANSWERS_MAX = 12
const EDITS_MAX = 10
// Bumped when answers or edits change, so the window loads them again
let moreVersion = 0
let moreWritten = -1
// How full the context window is, and what the session has cost
let context = null
let costUsd = null
// What the session is doing, in a few words a small model wrote; only while the window turns
// titles on, since each costs a request
let title = null
let titlesOn = false
// The model, the todo list as the model last wrote it, the conversation as the window shows it,
// and what the slash commands the window ran answered
let model = null
// The permission mode, as the last hook event said
let permissionMode = null
// True once the window asked this session to end: its Claude says goodbye, then it exits
let isEnding = false
const ENDING_MS = 3500
// Where in the window's building this session's room stands, when the person chose: from the
// window's new-session spot (passed in AGENT_WORKSHOP_SLOT), or a move; kept in the store by
// session, so it survives a reload
let slot = null
const SLOT_MAX = 24 * 9
// What the window should tell the person, from the session that runs it: a dialog that would not
// open, a Terminal that did not start
let windowNotices = []
// Messages to and from other sessions, newest last: for the window to send a courier between rooms
let mailOut = []
let mailIn = []
const MAIL_MAX = 10
let todos = []
let chat = []
let commandLog = []
const CHAT_MAX = 60
// The prompts the window sent that have not started a turn yet, to know them again at turn.start
let windowPrompts = []
// What the window sent lately, to mark those prompts in its chat: sent as the person's own words,
// they carry no frame to tell them by
let sentFromWindow = []
// When the slash commands and the project's files were last published for the window
let listedAt = 0
const LIST_MS = 60000
// The window's server, while this session runs it: its port, its token and the loop reading it
let server = null
// Whether the window can send commands: true while its server runs, as the heartbeat says
let canControl = false
// The window server's port, as its heartbeat says: the guard refuses tools aimed at it
let viewerPort = null
// Whether a window is open somewhere, whether this session opened it, and what was last written
let isPublishing = false
let isWindowOwner = false
let lastWritten = ''
let lastWrittenAt = 0
let sinceWatch = 0

// What the window draws for this session: who is where, doing what, and the last hook event.
// Subagents on their way out are left out, so the window walks them to the door itself
function snapshot() {
  return {
    id: self.id,
    project: self.project,
    cwd: self.cwd,
    startedAt: self.startedAt,
    isWorking,
    canControl,
    permission,
    recentCalls,
    recentHooks,
    live: { text: liveText.slice(-LIVE_MAX), thinking: liveThinking.slice(-300) },
    context,
    costUsd,
    answersMeta: answers.map((answer) => ({ at: answer.at, chars: answer.answer.length })),
    lastEdit: edits.length === 0 ? null : { file: edits.at(-1).file, lines: edits.at(-1).diff.split('\n').slice(0, 12), at: edits.at(-1).at },
    title,
    titlesOn,
    moreVersion,
    model,
    permissionMode,
    isEnding,
    slot,
    windowNotices: isWindowOwner ? windowNotices : [],
    mailOut,
    mailIn,
    todos,
    busy: Object.fromEntries(Object.entries(busy).map(([id, n]) => [id, n > 0])),
    agents: [...agents.values()]
      .filter((agent) => !agent.isLeaving)
      .map(({ id, name, color, isMain, station, calls, isWaiting, isThinking, isAsleep, bubble, bubbleColor }) => ({
        id,
        isThinking: isThinking === true,
        // The window draws sleep its own way, so it gets the fact, not the pane's snore bubble
        isAsleep: isAsleep === true,
        name,
        color,
        isMain,
        station,
        calls,
        isWaiting,
        bubble: isAsleep === true && SNORES.includes(bubble) ? '' : bubble,
        bubbleColor: bubbleColor ?? null,
      })),
    lastHook,
  }
}

function sessionFile() {
  return self.base + '/sessions/' + self.id + '.js'
}

// Lists the sessions whose state is fresh, for the window to load
async function writeIndex($, now) {
  const entries = await $.fs.list(self.base + '/sessions').catch(() => [])
  const ids = entries
    .filter((entry) => /^[A-Za-z0-9_-]+\.js$/.test(entry.name) && now - entry.mtimeMs < GONE_MS)
    .map((entry) => entry.name.slice(0, -3))
  if (!ids.includes(self.id)) ids.push(self.id)
  await $.fs.write(self.base + '/index.js', 'window.workshopIndex(' + JSON.stringify(ids) + ')\n')
}

// One beat of publishing: every WATCH_MS look for the heartbeat (and beat it, in the session
// that opened the window); while there is one, write this session's state when it changes,
// and at least every WATCH_MS so the window knows it is still here
async function publish($, isNow = false) {
  if (self.base === null) return
  const now = Date.now()
  sinceWatch += STATE_MS
  if (isNow || sinceWatch >= WATCH_MS) {
    sinceWatch = 0
    self.id = await $.session.id()
    // The heartbeat is the server's, beaten while a page uses it; a window opened as a file (no
    // python3) has its session beat it, to watch only
    if (isWindowOwner && server === null) await $.fs.write(self.base + '/viewer', JSON.stringify({ at: now, canControl: false }))
    const beat = await $.fs
      .read(self.base + '/viewer')
      .then((text) => JSON.parse(text))
      .catch(() => ({ at: 0, canControl: false }))
    // A beat from the future is no beat: a forged one could otherwise keep sharing on for good
    const age = now - Number(beat.at)
    isPublishing = age >= -2000 && age < FRESH_MS
    canControl = isPublishing && beat.canControl === true
    viewerPort = Number.isInteger(beat.port) ? beat.port : null
    // What the sessions say is the person's alone: the folder is kept closed to other users
    if (isPublishing) await $.process.run(['chmod', '700', self.base, self.base + '/sessions']).catch(() => {})
    // The mark of a session that runs the mod, which the guest finder never writes: so a session
    // is never taken for a guest, whatever its state file says at the moment
    if (isPublishing) await $.fs.write(self.base + '/sessions/' + self.id + '.mod', String(now))
    if (isPublishing) {
      const settings = await $.fs
        .read(self.base + '/settings.json')
        .then((text) => JSON.parse(text))
        .catch(() => ({}))
      titlesOn = settings.titles === true
      readLang(settings)
      if (!titlesOn) title = null
      model = await $.session.model().catch(() => model)
      if (now - listedAt > LIST_MS) {
        listedAt = now
        await publishLists($)
        if (isWindowOwner) await publishProjects($).catch(() => {})
      }
      const usage = await $.session.usage().catch(() => null)
      if (usage !== null) {
        context = { percent: usage.context.percent ?? null, tokens: usage.context.tokens ?? null, window: usage.context.window }
        costUsd = usage.cost?.usd ?? null
      }
    }
  }
  if (!isPublishing) return
  if (canControl) await readInbox($)
  if (isWindowOwner && now - sweptAt > SWEEP_MS) {
    sweptAt = now
    await sweep($, now).catch(() => {})
  }
  if (isWindowOwner && now - guestsAt > GUEST_MS) {
    guestsAt = now
    await publishGuests($, now).catch(() => {})
  }
  const body = JSON.stringify(snapshot())
  if (!isNow && body === lastWritten && now - lastWrittenAt < WATCH_MS) return
  lastWritten = body
  lastWrittenAt = now
  await $.fs.write(sessionFile(), 'window.workshopSession(' + JSON.stringify({ ...snapshot(), at: now }) + ')\n')
  if (moreWritten !== moreVersion) {
    moreWritten = moreVersion
    chat = await readChat($)
    const more = { id: self.id, version: moreVersion, answers, edits, chat, commandLog }
    await $.fs.write(self.base + '/sessions/' + self.id + '.more.js', 'window.workshopMore(' + JSON.stringify(more) + ')\n')
  }
  if (isNow || sinceWatch === 0) await writeIndex($, now)
}

// A prompt the window sent reaches the model wrapped in words saying a plugin sent it; the
// window shows what was typed
const FRAME_START = / plugin sent a message: /
const FRAME_END = 'This is how Claude Code surfaces a prompt a plugin submits'
function cleanPrompt(text) {
  // Found by position, not by a pattern that backtracks: long text stays quick
  const raw = String(text ?? '').slice(0, 20000)
  const head = FRAME_START.exec(raw.slice(0, 200))
  const tail = raw.lastIndexOf(FRAME_END)
  if (!raw.startsWith('The ') || head === null || tail < 0) return { text: raw, isFromWindow: false }
  return { text: raw.slice(head.index + head[0].length, tail).trim(), isFromWindow: true }
}

// The conversation as the window shows it. The engine keeps its own notes among the person's
// messages (a background task's notification, a slash command's record and output, reminders);
// each is turned into a short line of its own kind, or left out, and the person's own words kept
const NOTE_TAGS = ['system-reminder', 'local-command-caveat', 'command-message']
function tagged(text, tag) {
  const found = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(text)
  return found === null ? null : found[1].trim()
}
function tidyUserMessage(raw) {
  const rows = []
  let text = String(raw ?? '').slice(0, 20000)
  for (const tag of NOTE_TAGS) text = text.replace(new RegExp('<' + tag + '>[\\s\\S]*?</' + tag + '>', 'g'), '')
  // A background task's notification: what finished, and how
  text = text.replace(/<task-notification>[\s\S]*?<\/task-notification>/g, (block) => {
    const summary = tagged(block, 'summary') ?? 'A background task changed'
    const status = tagged(block, 'status')
    // Only an unusual end is worth saying beside the summary: failed, killed, stopped
    rows.push({ kind: 'notice', text: summary + (status && status !== 'completed' && !summary.toLowerCase().includes(status) ? ' (' + status + ')' : '') })
    return ''
  })
  // A slash command the person ran in the terminal, and what it printed
  const name = tagged(text, 'command-name')
  if (name !== null) {
    const args = tagged(text, 'command-args') ?? ''
    rows.push({ kind: 'command', text: name + (args ? ' ' + args : '') })
    text = text.replace(/<command-(name|args)>[\s\S]*?<\/command-\1>/g, '')
  }
  text = text.replace(/<local-command-(stdout|stderr)>([\s\S]*?)<\/local-command-\1>/g, (_, stream, output) => {
    if (output.trim()) rows.push({ kind: 'output', text: output.trim().slice(0, 2000) })
    return ''
  })
  const cleaned = cleanPrompt(text.trim())
  const words = cleaned.text.trim()
  if (words) rows.push({ kind: 'prompt', text: words, isFromWindow: cleaned.isFromWindow || sentFromWindow.includes(words) })
  return rows
}

async function readChat($) {
  const messages = await $.session.messages().catch(() => [])
  return messages.slice(-CHAT_MAX).flatMap((message) => {
    if (message.role === 'user') {
      return tidyUserMessage(message.text).map((row) => ({ role: 'user', kind: row.kind, text: row.text.slice(0, 8000), isFromWindow: row.isFromWindow === true, tools: [] }))
    }
    return [
      {
        role: 'assistant',
        kind: 'answer',
        text: message.text.slice(0, 8000),
        isFromWindow: false,
        tools: (message.toolUses ?? []).slice(0, 12).map((use) => ({ tool: use.tool, label: clip(labelFor({ tool: use.tool, ...use.input }), 60) })),
      },
    ]
  })
}

// The window's menu leaves out the MCP servers' prompts and what plugins add under their own name
// (`/engineering:debug`, `/data:analyze`); a plugin's command without one, like /workshop, stays.
// Typed in full, a left-out one still runs
function isListed(command) {
  if (command.source === 'mcp' || / \(MCP\)$/.test(command.name)) return false
  return !(command.source === 'plugin' && command.name.includes(':'))
}

// The slash commands this session can run, and the project's files, for the window's typeahead
async function publishLists($) {
  const commands = (await $.command.list().catch(() => [])).filter(isListed)
  // Early in a session the list can still be empty; then try again soon rather than in a minute
  if (commands.length === 0) listedAt = Date.now() - LIST_MS + 5000
  const listed = commands.map((one) => ({ name: one.name, description: clip(one.description, 120), source: one.source, plugin: one.plugin ?? null }))
  await $.fs.write(self.base + '/sessions/' + self.id + '.cmds.js', 'window.workshopCommands(' + JSON.stringify({ id: self.id, commands: listed }) + ')\n')
  let files = []
  // A repository's own settings could have git run a program of its choosing (core.fsmonitor)
  const git = await $.process.run(['git', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', 'ls-files'], { cwd: self.cwd }).catch(() => null)
  if (git !== null && git.exitCode === 0) files = git.stdout.split('\n').filter(Boolean)
  else {
    const found = await $.process
      .run(['find', '.', '-maxdepth', '4', '-type', 'f', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'], { cwd: self.cwd })
      .catch(() => null)
    if (found !== null) files = found.stdout.split('\n').filter(Boolean).map((path) => path.replace(/^\.\//, ''))
  }
  await $.fs.write(self.base + '/sessions/' + self.id + '.files.js', 'window.workshopFiles(' + JSON.stringify({ id: self.id, files: files.slice(0, 5000) }) + ')\n')
}

// The commands the window left for this session, oldest first: each read, removed, then done
let isReadingInbox = false
const obeyed = new Set()
async function readInbox($) {
  // One reading at a time, and each command once, though beats overlap
  if (isReadingInbox) return
  isReadingInbox = true
  try {
    await readBoxes($)
  } finally {
    isReadingInbox = false
  }
}

async function readBoxes($) {
  // `_window` holds the commands for the window as a whole, which its owner does
  const boxes = [self.id, ...(isWindowOwner ? ['_window'] : [])]
  for (const box of boxes) {
    const folder = self.base + '/inbox/' + box
    const entries = await $.fs.list(folder).catch(() => [])
    const names = entries.map((entry) => entry.name).filter((name) => /^\d+\.json$/.test(name)).sort()
    for (const name of names) {
      const path = folder + '/' + name
      if (obeyed.has(path)) continue
      obeyed.add(path)
      const text = await $.fs.read(path).catch(() => null)
      await $.process.run(['rm', '-f', path]).catch(() => {})
      if (text === null) continue
      try {
        await obey($, JSON.parse(text), box === '_window')
      } catch {
        // A command that cannot be read or done is dropped
      }
    }
  }
}

// Does one command from the window: a prompt, a stop, or a new session
let lastLaunchAt = 0
async function obey($, command, fromWindow = false) {
  if (command.type === 'prompt' && typeof command.text === 'string' && command.text.trim() !== '') {
    $.ui.toast(tr('Prompt from the workshop window'))
    windowPrompts = [...windowPrompts, command.text.slice(0, 20000)].slice(-5)
    sentFromWindow = [...sentFromWindow, command.text.slice(0, 20000).trim()].slice(-50)
    // Typed by the person in the window: their own words, which the model reads bare, not framed
    // as a message from this plugin
    void $.prompt.submit({ text: command.text.slice(0, 20000), asUser: true }).catch(() => {})
  } else if (command.type === 'command' && typeof command.command === 'string') {
    // A slash command, run as if typed here; what it answers goes to the window's log
    const name = command.command.replace(/^\//, '')
    const args = typeof command.args === 'string' ? command.args : ''
    $.ui.toast(tr('{command} from the workshop window', { command: '/' + name }))
    void $.command
      .run({ command: name, args })
      .then((ran) => logCommand($, name, args, ran?.text ?? ''))
      .catch((error) => logCommand($, name, args, 'failed: ' + (error?.message ?? 'unknown command')))
  } else if (command.type === 'stop' && turnId !== null) {
    await $.turn.abort({ turnId })
  } else if (command.type === 'new-session' && typeof command.dir === 'string' && fromWindow && Date.now() - lastLaunchAt > 5000) {
    lastLaunchAt = Date.now()
    await startSession($, command.dir.replace(/\/+$/, '') || '/', command.isContinue === true, isSlot(command.slot) ? command.slot : null)
  } else if (command.type === 'end' && !isEnding) {
    // Goodbye first, so the window can show it, then /exit as if typed here
    isEnding = true
    say(agentFor(), tr('bye!'), 0)
    $.ui.toast(tr('The workshop window is ending this session'))
    if (turnId !== null) await $.turn.abort({ turnId }).catch(() => {})
    await publish($, true)
    $.clock.after(ENDING_MS, () => {
      void $.command.run({ command: 'exit' }).catch(() => {
        isEnding = false
        say(agentFor(), '')
        $.ui.toast(tr('The workshop window could not end this session; type /exit here to end it'))
      })
    })
  } else if (command.type === 'set-titles' && typeof command.on === 'boolean') {
    await saveSetting($, { titles: command.on })
  } else if (command.type === 'set-lang' && (command.value === 'en' || command.value === 'de')) {
    lang = command.value
    await saveSetting($, { lang })
    $.ui.invalidate('ui.render')
  } else if (command.type === 'set-tour' && (command.value === 'never' || command.value === 'show')) {
    await saveSetting($, { tour: command.value })
  } else if (command.type === 'set-slot' && isSlot(command.slot)) {
    slot = command.slot
    await $.store.set('slot:' + self.id, slot)
    moreVersion += 1
  } else if (command.type === 'pick-folder' && fromWindow) {
    // The dialog waits on the person, so the inbox goes on without it
    void pickAndStart($, command.isContinue === true, isSlot(command.slot) ? command.slot : null).catch(() => {})
  }
}

function isSlot(value) {
  return Number.isInteger(value) && value >= 0 && value < SLOT_MAX
}

// Guests: the Claude Code sessions running on this machine without this mod (started before it
// was set up), shown in the window to watch, not to use. The session running the window finds
// them by their processes and folders, reads the end of each one's transcript, and writes a state
// for it as a session with the mod would, marked `guest`
const GUEST_MS = 3000
let guestsAt = 0
let guestIds = new Set()
let guestChats = new Map()
let lastPublishing = new Set()
async function publishGuests($, now) {
  const found = await findGuests($, now).catch(() => [])
  const ids = new Set(found.map((guest) => guest.state.id))
  for (const guest of found) {
    await $.fs.write(self.base + '/sessions/' + guest.state.id + '.js', 'window.workshopSession(' + JSON.stringify(guest.state) + ')\n')
    const chat = JSON.stringify(guest.more.chat)
    if (guestChats.get(guest.state.id) !== chat) {
      guestChats.set(guest.state.id, chat)
      await $.fs.write(self.base + '/sessions/' + guest.state.id + '.more.js', 'window.workshopMore(' + JSON.stringify(guest.more) + ')\n')
    }
  }
  // A guest whose session ended goes; one that now runs the mod keeps its files, which are its own
  const gone = [...guestIds].filter((id) => !ids.has(id) && !lastPublishing.has(id))
  if (gone.length > 0) {
    await $.process.run(['rm', '-f', ...gone.flatMap((id) => [self.base + '/sessions/' + id + '.js', self.base + '/sessions/' + id + '.more.js'])]).catch(() => {})
    for (const id of gone) guestChats.delete(id)
  }
  guestIds = ids
}

async function findGuests($, now) {
  const listed = await $.process.run(['pgrep', '-x', 'claude'])
  const pids = listed.stdout.split('\n').filter(Boolean)
  if (pids.length === 0) return []
  // Each process's working folder, and how many sessions run in each
  const folders = await $.process.run(['lsof', '-a', '-d', 'cwd', '-Fn', '-p', pids.join(',')])
  const counts = new Map()
  for (const line of folders.stdout.split('\n')) if (line.startsWith('n/')) counts.set(line.slice(1), (counts.get(line.slice(1)) ?? 0) + 1)
  // The sessions that publish for themselves, which are no guests
  const entries = await $.fs.list(self.base + '/sessions').catch(() => [])
  const publishing = new Set(entries.filter((entry) => /^[\w-]+\.mod$/.test(entry.name) && now - entry.mtimeMs < GONE_MS).map((entry) => entry.name.slice(0, -4)))
  lastPublishing = publishing
  const home = await $.env.get('HOME')
  const guests = []
  for (const [cwd, count] of counts) {
    const folder = home + '/.claude/projects/' + cwd.replace(/[^a-zA-Z0-9]/g, '-')
    // The newest transcripts there, one a process; those that publish for themselves are no guests
    const newest = await $.process.run(['sh', '-c', 'ls -t "$1"/*.jsonl 2>/dev/null | head -n "$2"', 'newest', folder, String(count)])
    for (const file of newest.stdout.split('\n').filter(Boolean)) {
      const id = file.split('/').pop().replace(/\.jsonl$/, '')
      if (publishing.has(id) || id === self.id) continue
      const stat = await $.fs.stat(file).catch(() => null)
      if (stat === null || now - stat.mtimeMs > 6 * 3600 * 1000) continue
      const tail = await $.process.run(['tail', '-c', '400000', file])
      guests.push(guestOf(id, cwd, tail.stdout, stat.mtimeMs, now))
    }
  }
  return guests
}

// A guest's state, read from the end of its transcript: what it says, what it is doing now
function guestOf(id, cwd, tail, mtime, now) {
  const entries = []
  for (const line of tail.split('\n')) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      // The first line of a tail is cut; a line being written is not whole yet
    }
  }
  const chat = []
  const calls = []
  const answered = new Set()
  let model = null
  let title = null
  let lastText = ''
  let todos = []
  let lastEdit = null
  let started = mtime
  for (const entry of entries) {
    if (entry.type === 'ai-title' && entry.aiTitle) title = clip(entry.aiTitle, 48)
    if (entry.timestamp && Date.parse(entry.timestamp) < started) started = Date.parse(entry.timestamp)
    if (entry.isSidechain || !entry.message) continue
    const content = entry.message.content
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []
    if (entry.type === 'user') {
      for (const block of blocks) if (block.type === 'tool_result') answered.add(block.tool_use_id)
      const text = blocks.filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n')
      if (text.trim() && !entry.isMeta) {
        for (const row of tidyUserMessage(text)) chat.push({ role: 'user', kind: row.kind, text: row.text.slice(0, 8000), isFromWindow: false, tools: [] })
      }
    } else if (entry.type === 'assistant') {
      model = entry.message.model ?? model
      // One response comes as several entries, a block each: they make one row
      const last = chat.at(-1)
      const row = last && last.role === 'assistant' && last.messageId === entry.message.id ? last : { role: 'assistant', kind: 'answer', text: '', isFromWindow: false, tools: [], messageId: entry.message.id }
      if (row !== last) chat.push(row)
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          row.text = (row.text ? row.text + '\n\n' : '') + block.text
          lastText = block.text
        } else if (block.type === 'tool_use') {
          const label = labelFor({ tool: block.name, ...block.input })
          row.tools.push({ tool: block.name, label: clip(label, 60) })
          calls.push({ id: block.id, tool: block.name, label: clip(label, 80), who: 'main', at: Date.parse(entry.timestamp) || mtime, input: block.input })
          if (block.name === 'TodoWrite' && Array.isArray(block.input?.todos)) todos = block.input.todos.slice(0, 40)
          const diff = diffOf({ tool: block.name, ...block.input })
          if (diff !== null) lastEdit = { file: basename(block.input.file_path ?? block.input.notebook_path), lines: diff.split('\n').slice(0, 12), at: Date.parse(entry.timestamp) || mtime }
        }
      }
    }
  }
  // Working: its transcript grew just now, or a tool call has no result yet
  const pending = calls.filter((call) => !answered.has(call.id)).at(-1) ?? null
  const isWorking = now - mtime < 8000 || pending !== null
  const station = pending ? stationOf(pending.tool) : null
  const main = { id: 'main', name: 'main', color: MAIN_COLOR, isMain: true, station, calls: pending ? 1 : 0, isWaiting: false, isThinking: false, isAsleep: !isWorking && now - mtime > SLEEP_TICKS * TICK_MS, bubble: pending ? pending.label.slice(0, BUBBLE_MAX) : '', bubbleColor: null }
  const recentCalls = calls.slice(-HISTORY_MAX).map(({ tool, label, who, at, id: callId }) => ({ tool, label, who, at, result: answered.has(callId) ? 'ok' : 'running' }))
  const version = chat.length + ':' + (chat.at(-1)?.text.length ?? 0)
  return {
    state: {
      id, guest: true, project: cwd.split('/').filter(Boolean).pop() ?? '/', cwd, startedAt: started, at: now, isWorking, canControl: false,
      permission: null, recentCalls, recentHooks: [], live: { text: isWorking ? lastText.slice(-LIVE_MAX) : '', thinking: '' }, context: null, costUsd: null,
      answersMeta: [], lastEdit, title, titlesOn: false, moreVersion: version, model, permissionMode: null, isEnding: false, slot: null,
      windowNotices: [], mailOut: [], mailIn: [], todos, busy: station ? { [station]: true } : {}, agents: [main], lastHook: null,
    },
    more: { id, version, answers: [], edits: [], chat: chat.slice(-CHAT_MAX).map(({ messageId, ...row }) => row), commandLog: [] },
  }
}

// The window's settings, shared by every session: read, changed, written whole
async function saveSetting($, change) {
  const settings = await $.fs
    .read(self.base + '/settings.json')
    .then((text) => JSON.parse(text))
    .catch(() => ({}))
  await $.fs.write(self.base + '/settings.json', JSON.stringify({ ...settings, ...change }))
}

function logCommand($, name, args, text) {
  commandLog = [...commandLog, { at: Date.now(), command: '/' + name + (args ? ' ' + args : ''), text: clip(text, 2000) }].slice(-20)
  moreVersion += 1
}

// Opens a new Terminal window running Claude Code in a folder, or continuing the last
// conversation there; macOS only
async function startSession($, dir, isContinue = false, at = null) {
  const stat = await $.fs.stat(dir).catch(() => null)
  if (!dir.startsWith('/') || stat === null || stat.kind !== 'dir') {
    tellWindow($, dir + ' is not a folder, so no session was started there')
    return
  }
  // A small script Terminal runs in a window of its own. Opening a file asks nothing of macOS,
  // where telling Terminal what to do takes Apple Events, which an app like Claude's desktop app
  // may not be allowed to send. The spot chosen in the window rides along in the environment
  const quoted = "'" + dir.replace(/'/g, "'\\''") + "'"
  const script = ['#!/bin/zsh -l', 'cd -- ' + quoted + ' || exit 1']
  if (at !== null) script.push('export AGENT_WORKSHOP_SLOT=' + at)
  script.push('exec claude' + (isContinue ? ' --continue' : ''))
  const file = self.base + '/launch/' + randomHex(16) + '.command'
  await $.fs.write(file, script.join('\n') + '\n')
  await $.process.run(['chmod', '700', file])
  const opened = await $.process.run(['open', '-a', 'Terminal', file]).catch((error) => ({ exitCode: 1, stderr: String(error?.message ?? error) }))
  if (opened.exitCode !== 0) tellWindow($, tr('Terminal did not open: {error}', { error: clip(opened.stderr, 160) }))
  else $.ui.toast(tr('Started a new session in {dir}', { dir }))
}

// Asks for a folder in the system's own dialog, then starts a session there; macOS only. Where
// the dialog cannot open (an app not allowed to drive Finder), the window says so and offers the
// recent projects and a path instead
async function pickAndStart($, isContinue, at) {
  const script = [
    'tell application "Finder"',
    'activate',
    'set chosen to choose folder with prompt "' + tr('Start a Claude Code session in:') + '"',
    'end tell',
    'POSIX path of chosen',
  ]
  const ran = await $.process.run(['osascript', ...script.flatMap((line) => ['-e', line])], { timeoutMs: 600000 })
  if (ran.exitCode !== 0) {
    // -128 is the person pressing Cancel; anything else is the dialog failing
    if (!/-128/.test(ran.stderr)) tellWindow($, tr('The folder dialog could not open from here ({error}). Pick a recent project or type a folder instead.', { error: clip(ran.stderr.trim(), 120) }), 'pick-failed')
    return
  }
  const dir = ran.stdout.trim().replace(/\/$/, '')
  if (dir !== '') await startSession($, dir, isContinue, at)
}

// A message for the window, from the session that runs it, shown there once
function tellWindow($, text, kind = 'error') {
  windowNotices = [...windowNotices, { id: Date.now() + Math.random(), at: Date.now(), kind, text }].slice(-5)
  $.ui.toast(text)
}

// The folders Claude Code sessions ran in lately, newest first, from its own history: for the
// window's new-session form
async function publishProjects($) {
  const find =
    'for d in "$HOME"/.claude/projects/*/; do f=$(ls -t "$d"*.jsonl 2>/dev/null | head -1); ' +
    '[ -n "$f" ] && printf "%s %s\\n" "$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f")" "$(head -c 200000 "$f" | grep -o \'"cwd":"[^"]*"\' | head -1)"; done'
  const ran = await $.process.run(['sh', '-c', find]).catch(() => null)
  if (ran === null) return
  const seen = new Set()
  const projects = []
  for (const line of ran.stdout.split('\n').map((one) => /^(\d+) "cwd":"([^"]+)"$/.exec(one)).filter(Boolean).sort((a, b) => Number(b[1]) - Number(a[1]))) {
    const dir = line[2].replace(/\\\\/g, '\\')
    if (seen.has(dir) || projects.length >= 30) continue
    seen.add(dir)
    const stat = await $.fs.stat(dir).catch(() => null)
    if (stat?.kind === 'dir') projects.push({ dir, at: Number(line[1]) * 1000 })
  }
  await $.fs.write(self.base + '/projects.js', 'window.workshopProjects(' + JSON.stringify(projects) + ')\n')
}

// Waits for the window to answer a permission request, without holding up this hook's own time:
// one small shell loop looks for the answer the window's server leaves, until it gives up
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']
// A permission suggestion in words: what it adds, for whom, and where it is kept
function describeRule(update) {
  const known = { session: 'this session', localSettings: 'this project, for you', projectSettings: 'this project, for everyone', userSettings: 'all your projects' }[update?.destination]
  const where = known === undefined ? String(update?.destination ?? '') : tr(known)
  if (update?.type === 'addRules' || update?.type === 'replaceRules') {
    const rules = (update.rules ?? []).map((rule) => rule.toolName + (rule.ruleContent ? '(' + rule.ruleContent + ')' : '')).join(', ')
    return tr(update.behavior === 'deny' ? 'deny ' : update.behavior === 'ask' ? 'ask for ' : 'allow ') + rules + ' — ' + where
  }
  if (update?.type === 'addDirectories') return tr('allow work in ') + (update.directories ?? []).join(', ') + ' — ' + where
  if (update?.type === 'setMode') return tr('switch to ') + update.mode + ' — ' + where
  return JSON.stringify(update)
}
const SHOWN_MAX = 20000
// Permission requests waiting on the window, by id: several may wait at once (subagents)
const pending = new Map()
async function askWindow($, e) {
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const input = e.tool_input ?? {}
  const tool = String(e.tool_name)
  // A plan or a question takes reading, so the window has longer to answer those
  const isLong = tool === 'ExitPlanMode' || tool === 'AskUserQuestion'
  const waitS = isLong ? LONG_WAIT_S : PERMISSION_WAIT_S
  // What the tool will really do, never what the model wrote about it: the command, or the whole
  // input; when too long to show whole, the window may only deny
  const shown = tool === 'Bash' ? String(input.command ?? '') : isLong ? '' : JSON.stringify(input, null, 2)
  const diff = diffWhole({ tool, ...input }, SHOWN_MAX)
  const plan = typeof input.plan === 'string' ? input.plan : null
  // The flags a shell command carries, shown with it: leaving the sandbox above all
  const flags = tool === 'Bash' ? Object.entries(input).filter(([name]) => name !== 'command' && name !== 'description').map(([name, value]) => name + ': ' + JSON.stringify(value)) : []
  const request = {
    id,
    tool,
    filePath: typeof (input.file_path ?? input.notebook_path) === 'string' ? input.file_path ?? input.notebook_path : null,
    detail: tool === 'Bash' || diff !== null ? '' : shown.slice(0, SHOWN_MAX),
    command: tool === 'Bash' ? shown.slice(0, SHOWN_MAX) : null,
    flags,
    // Allowed from the window only when all of it is shown, and it stays in the sandbox
    isCut: shown.length > SHOWN_MAX || diff?.isCut === true || (plan?.length ?? 0) > 20000,
    leavesSandbox: input.dangerouslyDisableSandbox === true,
    diff: diff?.text ?? null,
    plan: plan?.slice(0, 20000) ?? null,
    questions: tool === 'AskUserQuestion' && Array.isArray(input.questions) ? input.questions : null,
    canAlways: Array.isArray(e.permission_suggestions) && e.permission_suggestions.length > 0,
    // What "always allow" would add, in words, as the terminal would name it
    rules: (Array.isArray(e.permission_suggestions) ? e.permission_suggestions : []).map(describeRule),
    canAcceptEdits: EDIT_TOOLS.includes(tool) || tool === 'ExitPlanMode',
    agent: e.agent_id === undefined ? 'main' : (agents.get(e.agent_id)?.name ?? 'agent'),
    since: Date.now(),
    until: Date.now() + waitS * 1000,
  }
  pending.set(id, request)
  // The oldest request first, with how many wait behind it
  permission = { ...[...pending.values()][0], waiting: pending.size - 1 }
  await publish($, true)
  $.ui.toast(tool === 'AskUserQuestion' ? tr('A question is waiting in the workshop window; it comes here in {s} s', { s: waitS }) : tr('Permission for {tool} is waiting in the workshop window; it comes here in {s} s', { tool, s: waitS }))
  const wait = 'f=$1; n=$(( $2 * 4 )); while [ $n -gt 0 ]; do if [ -f "$f" ]; then cat "$f"; rm -f "$f"; exit 0; fi; sleep 0.25; n=$((n - 1)); done; exit 1'
  try {
    const ran = await $.process.run(['sh', '-c', wait, 'wait', self.base + '/decisions/' + id, String(waitS)], {
      timeoutMs: (waitS + 5) * 1000,
    })
    if (ran.exitCode !== 0) return null
    const answer = JSON.parse(ran.stdout)
    if (answer.decision === 'deny') return { decision: { behavior: 'deny', message: 'Denied from the agent workshop window' } }
    if (answer.decision !== 'allow' || request.isCut || request.leavesSandbox) return null
    const decision = { behavior: 'allow' }
    const updates = []
    if (answer.always === true && request.canAlways) updates.push(...e.permission_suggestions)
    // The one way a plugin changes the permission mode: with an answer, as the terminal's
    // "Yes, and auto-accept edits" does; for an edit or a plan alone
    if (answer.mode === 'acceptEdits' && request.canAcceptEdits) updates.push({ type: 'setMode', mode: 'acceptEdits', destination: 'session' })
    if (updates.length > 0) decision.updatedPermissions = updates
    if (request.questions !== null && answer.answers && typeof answer.answers === 'object') decision.updatedInput = { ...input, answers: answer.answers }
    return { decision }
  } catch {
    return null
  } finally {
    pending.delete(id)
    const next = [...pending.values()][0]
    permission = next ? { ...next, waiting: pending.size - 1 } : null
    void publish($, true).catch(() => {})
  }
}

// The shared folder and the window's server are the window's, not Claude's: a tool call aimed at
// either is refused, so a prompt slipped into one session cannot read the others or command them.
// Best effort: paths are put in plain form (home spelled out, `.` and `..` and `//` folded,
// letters in one case, as macOS compares them, links followed where the file exists), commands
// and other tools' text scanned for the folder's name or the server's address. The settings'
// own deny rules, which the engine enforces, are the stronger fence (see the README)
const PATH_FIELDS = ['file_path', 'notebook_path', 'path']
function plainPath(path, home) {
  let full = String(path).replace(/^~(?=\/|$)/, home).replace(/^\$\{?HOME\}?(?=\/|$)/, home)
  if (!full.startsWith('/')) full = (self.cwd || home) + '/' + full
  const parts = []
  for (const part of full.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return ('/' + parts.join('/')).toLowerCase()
}
function strings(value, found = []) {
  if (typeof value === 'string') found.push(value)
  else if (Array.isArray(value)) value.forEach((one) => strings(one, found))
  else if (value && typeof value === 'object') Object.values(value).forEach((one) => strings(one, found))
  return found
}
async function touchesShared($, e) {
  if (self.base === null) return false
  const home = self.base.slice(0, -SHARED.length)
  const shared = self.base.toLowerCase()
  const inside = (path) => path === shared || path.startsWith(shared + '/')
  // Paths: in plain form, and where the file is there, wherever its links lead
  for (const field of PATH_FIELDS) {
    if (typeof e[field] !== 'string' || e[field] === '') continue
    const plain = plainPath(e[field], home)
    if (inside(plain)) return true
    const real = await $.fs.stat(plain, { resolve: true }).then((stat) => stat.realPath).catch(() => null)
    if (typeof real === 'string' && inside(real.toLowerCase())) return true
  }
  // Text anywhere in the call: commands, scripts, MCP arguments, URLs. The folder's name however
  // split or quoted, a path into it, a wildcard under ~/.claude, a `cd` there followed by more,
  // or the window server's address
  const text = strings(e).join('\n').toLowerCase()
  const rules = [
    /agent[^a-z\n]{0,8}workshop/,
    /\.claude\/+["']?agent/,
    /\.claude\/[^\s;|&]*[*?[]/,
    /cd\s+["']?[^;&|\n]*\.claude\/?["']?\s*(&&|;|\n)[^\n]*(agent|[*?])/,
  ]
  if (rules.some((rule) => rule.test(text))) return true
  if (viewerPort !== null && new RegExp('(127\\.0\\.0\\.1|localhost|\\[::1\\]|0\\.0\\.0\\.0)(:|%3a)' + viewerPort + '\\b').test(text)) return true
  return false
}

// A diff of what an edit changes, as `- ` and `+ ` lines, short enough to show
function diffOf(e, max = 4000) {
  return diffWhole(e, max)?.text ?? null
}
// The diff, and whether showing it took cutting: a permission card must not show a part as whole
function diffWhole(e, max = 4000) {
  const tool = String(e.tool)
  const lines = (text, mark) => String(text ?? '').split('\n').map((line) => mark + line)
  let diff = []
  if (tool === 'Edit') diff = [...lines(e.old_string, '- '), ...lines(e.new_string, '+ ')]
  else if (tool === 'MultiEdit') diff = (e.edits ?? []).flatMap((one) => [...lines(one.old_string, '- '), ...lines(one.new_string, '+ '), ''])
  else if (tool === 'Write') diff = lines(e.content, '+ ')
  else return null
  const whole = diff.join('\n')
  return { text: whole.slice(0, max), isCut: whole.length > max }
}

// Asks a small model what this turn is about, in a few words, for the window's sign
async function nameTurn($, text) {
  const asked = await $.model.complete({
    model: 'haiku',
    prompt:
      'In 3 to 6 words, say what this request to a coding assistant is about, as a short phrase ' +
      "starting with a verb in -ing, like 'fixing the failing tests'. Reply with the phrase only.\n\nRequest:\n" +
      text.slice(0, 2000),
    maxTokens: 24,
    timeoutMs: 15000,
  })
  if (asked.isAnswered && titlesOn) title = clip(asked.text.replace(/["'\n.]/g, ' '), 48)
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function remember(list, item) {
  return [...list, item].slice(-HISTORY_MAX)
}

// Starts the window's server: a small Python program serving the shared folder on 127.0.0.1,
// with a token only the page gets. Answers its port, or null where it cannot run
async function startServer($) {
  if (server !== null) return server.port
  try {
    // The server makes its token itself and says it with its port, so no command line shows it
    const stream = $.process.spawn({ argv: ['python3', $.plugin.root + '/web/server.py', self.base] })
    const pieces = stream[Symbol.asyncIterator]()
    const first = await pieces.next()
    const port = first.done ? NaN : parseInt(first.value.text.trim().split(/\s+/)[0], 10)
    if (!Number.isInteger(port)) return null
    server = { port, pieces }
    // Read on for the server's life; when it ends, the window can no longer send commands
    void (async () => {
      try {
        while (!(await pieces.next()).done) {
          // The server prints nothing more
        }
      } catch {
        // It stopped
      }
      if (server?.pieces === pieces) server = null
    })()
    return port
  } catch {
    return null
  }
}

function stopServer() {
  void server?.pieces.return?.()
  server = null
}

// Opens the 3D window. One server serves every window: a session finding one running (its
// heartbeat fresh, its process alive) uses it; else it starts its own and owns the window. The
// browser gets a launcher file (in the private folder) that takes it to the page with a one-time
// key in the address's fragment, which the page swaps for the token: no command line and no page
// anyone can fetch carries the token. Without python3 the page opens as a file, to watch only
async function open3d($) {
  if (self.base === null) return tr('The 3D window needs a home folder to share between sessions, and found none.')
  await $.process.run(['mkdir', '-p', '-m', '700', self.base]).catch(() => {})
  await $.process.run(['chmod', '700', self.base]).catch(() => {})
  await $.fs.write(self.base + '/index.html', await $.fs.read($.plugin.root + '/web/workshop.html'))
  let port = await runningPort($)
  if (port === null) {
    isWindowOwner = true
    listedAt = 0
    port = await startServer($)
  }
  await publish($, true)
  let page = 'file://' + self.base + '/index.html'
  if (port !== null) {
    const key = randomHex(32)
    await $.fs.write(self.base + '/claims/' + key, '')
    const launcher = self.base + '/open/' + randomHex(16) + '.html'
    const address = `http://127.0.0.1:${port}/#k=${key}`
    await $.fs.write(launcher, `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Agent workshop</title><script>location.replace(${JSON.stringify(address)})</script>\n`)
    page = 'file://' + launcher
  }
  const attempts = [
    ['open', '-na', 'Google Chrome', '--args', '--app=' + page, '--window-size=1400,860'],
    ['open', page],
    ['xdg-open', page],
  ]
  for (const argv of attempts) {
    const ran = await $.process.run(argv).catch(() => null)
    if (ran !== null && ran.exitCode === 0) {
      return port === null
        ? tr('3D workshop opened to watch only (python3 was not found, so it cannot send commands).')
        : tr('3D workshop opened: every session running this mod gets a room, and you can prompt them from it.')
    }
  }
  return tr('Could not open a browser. Open this in one: {page}', { page })
}

// The port of a window server already running for the shared folder, when its heartbeat is fresh
// and its process alive
async function runningPort($) {
  if (server !== null) return server.port
  const beat = await $.fs
    .read(self.base + '/viewer')
    .then((text) => JSON.parse(text))
    .catch(() => null)
  if (!beat || !Number.isInteger(beat.port) || !Number.isInteger(beat.pid) || Date.now() - beat.at > FRESH_MS) return null
  const alive = await $.process.run(['kill', '-0', String(beat.pid)]).catch(() => null)
  return alive && alive.exitCode === 0 ? beat.port : null
}

// This session stops serving the window; every session stops sharing once the heartbeat goes
// stale, and the guests' rooms go with it
function close3d($) {
  isWindowOwner = false
  stopServer()
  const files = [...guestIds].flatMap((id) => [self.base + '/sessions/' + id + '.js', self.base + '/sessions/' + id + '.more.js'])
  guestIds = new Set()
  if (files.length > 0) void $.process.run(['rm', '-f', ...files]).catch(() => {})
}

// What the window leaves behind, cleared now and then by the session running it: rooms of
// sessions gone, answers nobody waited for, used launchers and keys, inboxes of sessions gone
const SWEEP_MS = 60000
let sweptAt = 0
async function sweep($, now) {
  const old = (entry, ms) => now - entry.mtimeMs > ms
  const gone = []
  const sessions = await $.fs.list(self.base + '/sessions').catch(() => [])
  for (const entry of sessions) if (entry.kind === 'file' && old(entry, 10 * 60000)) gone.push(self.base + '/sessions/' + entry.name)
  for (const [folder, ms] of [['decisions', (LONG_WAIT_S + 60) * 1000], ['launch', 120000], ['open', 120000], ['claims', 300000]]) {
    const entries = await $.fs.list(self.base + '/' + folder).catch(() => [])
    for (const entry of entries) if (entry.kind === 'file' && old(entry, ms)) gone.push(self.base + '/' + folder + '/' + entry.name)
  }
  if (gone.length > 0) await $.process.run(['rm', '-f', '--', ...gone]).catch(() => {})
  const boxes = await $.fs.list(self.base + '/inbox').catch(() => [])
  const live = new Set(sessions.filter((entry) => !old(entry, 10 * 60000)).map((entry) => entry.name.split('.')[0]))
  const empty = boxes.filter((entry) => entry.kind === 'dir' && entry.name !== '_window' && !live.has(entry.name)).map((entry) => self.base + '/inbox/' + entry.name)
  if (empty.length > 0) await $.process.run(['rm', '-rf', '--', ...empty]).catch(() => {})
}

async function open($) {
  await $.ui.open({ id: PANE, title: TITLE, rows: 24, columns: 110 })
}

export function register(on) {
  // Runs before your first prompt, and again after a reload
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'workshop',
      description: 'Open the agent workshop: Claude and its subagents at their tool stations; /workshop 3d opens it in 3D in a window of its own',
      argumentHint: '[close|floor|hooks|clear|auto|3d|3d off|lang en|lang de|help]',
      immediate: true,
    })
    isAutoOpen = (await $.store.get('isAutoOpen')) === true
    agentFor('main')
    $.clock.every(TICK_MS, () => {
      tick()
      $.ui.invalidate('ui.render')
    })
    // The 3D window's side; without a home folder or a session id the pane still works
    try {
      const home = await $.env.get('HOME')
      self = {
        id: await $.session.id(),
        project: String(e.cwd).split('/').filter(Boolean).pop() ?? '/',
        cwd: String(e.cwd),
        startedAt: Date.now(),
        base: home === undefined ? null : home + SHARED,
      }
      const kept = await $.store.get('slot:' + self.id).catch(() => undefined)
      const given = Number(await $.env.get('AGENT_WORKSHOP_SLOT').catch(() => undefined))
      slot = isSlot(kept) ? kept : isSlot(given) ? given : null
      readLang(await $.fs.read(self.base + '/settings.json').then((text) => JSON.parse(text)).catch(() => ({})))
      $.clock.every(STATE_MS, () => void publish($).catch(() => {}))
    } catch {
      self = { ...self, base: null }
    }
    if (isAutoOpen) void open($)
    return next(e)
  })

  on('command.run', { command: 'workshop' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === '' || arg === 'open' || arg === 'floor' || arg === 'hooks') {
      if (arg === 'floor' || arg === 'hooks') view = arg
      await open($)
      return { text: tr('Workshop opened.') }
    }
    if (arg === 'close') {
      await $.ui.close({ id: PANE })
      return { text: tr('Workshop closed.') }
    }
    if (arg === 'help') return { text: HELP[lang] }
    if (arg === 'lang en' || arg === 'lang de') {
      if (self.base === null) return { text: tr('The language needs a home folder to keep it in, and found none.') }
      lang = arg.slice(5)
      await saveSetting($, { lang })
      $.ui.invalidate('ui.render')
      return { text: tr(lang === 'de' ? 'The workshop speaks German now.' : 'The workshop speaks English now.') }
    }
    if (arg === '3d') return { text: await open3d($) }
    if (arg === '3d off') {
      close3d($)
      return { text: tr('The 3D window stops updating in a few seconds; close it when you like.') }
    }
    if (arg === 'clear') {
      counts = {}
      lastHook = null
      return { text: tr('Hook counts cleared.') }
    }
    if (arg === 'auto') {
      isAutoOpen = !isAutoOpen
      await $.store.set('isAutoOpen', isAutoOpen)
      return { text: tr(isAutoOpen ? 'The workshop opens with each session (on terminals 144 columns or wider).' : 'The workshop opens only on /workshop.') }
    }
    return { text: tr('usage: /workshop [close|floor|hooks|clear|auto|3d|3d off|lang en|lang de|help]') }
  })

  // Every settings hook event, whether or not a settings hook is configured: counted, and the
  // ones that change who is in the room acted on
  on('classic.*', async ($, e, next) => {
    const event = next.event.slice('classic.'.length)
    if (typeof e.permission_mode === 'string' && e.agent_id === undefined) permissionMode = e.permission_mode
    if (event === 'SubagentStart') say(agentFor(e.agent_id, e.agent_type), tr('hi!'), ALERT_TICKS)
    record(event, e)
    recentHooks = remember(recentHooks, { event, who: lastHook.who, at: Date.now() })
    if (event === 'SubagentStop') {
      const agent = agents.get(e.agent_id)
      if (agent !== undefined) {
        agent.isLeaving = true
        agent.station = null
        say(agent, tr('bye'), ALERT_TICKS)
      }
    } else if (event === 'PermissionRequest' || (event === 'Notification' && e.notification_type === 'permission_prompt')) {
      const agent = agentFor(e.agent_id)
      agent.isWaiting = true
      say(agent, '? ' + (e.tool_name ?? tr('may I')), 0, '#E3B341')
      // With a window that can answer, it gets the first say; the terminal asks if it doesn't
      if (event === 'PermissionRequest' && canControl && self.base !== null) {
        const answer = await askWindow($, e)
        if (answer !== null) return answer
      }
    } else if (event === 'UserPromptSubmit') {
      isWorking = true
      say(agentFor(), '!', ALERT_TICKS)
    } else if (event === 'PreCompact') {
      say(agentFor(), tr('tidying up…'), DONE_TICKS)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Runs when this session sends a message to another (SendMessage): noted, for the window
  on('session.send', async ($, e, next) => {
    const sender = e.agentId === undefined ? agents.get('main') : agents.get(e.agentId)
    mailOut = [...mailOut, { id: Date.now() + Math.random(), at: Date.now(), to: clip(e.to, 60), who: sender?.name ?? 'main', text: clip(e.text, 300) }].slice(-MAIL_MAX)
    return next(e)
  })

  // Runs when another session's message arrives here: noted, for the window
  on('session.receive', async ($, e, next) => {
    if (e.origin?.kind === 'peer-send-message' || e.origin?.kind === 'peer') {
      mailIn = [...mailIn, { id: Date.now() + Math.random(), at: Date.now(), text: clip(e.text, 300) }].slice(-MAIL_MAX)
    }
    return next(e)
  })

  // Runs when the session ends: its room leaves the 3D window
  on('session.end', async ($, e, next) => {
    if (self.base !== null && self.id !== null) {
      const own = (kind) => self.base + '/sessions/' + self.id + kind + '.js'
      await $.process.run(['rm', '-f', sessionFile(), own('.more'), own('.cmds'), own('.files'), self.base + '/sessions/' + self.id + '.mod']).catch(() => {})
      await $.process.run(['rm', '-rf', '--', self.base + '/inbox/' + self.id, self.base + '/uploads/' + self.id]).catch(() => {})
    }
    if (isWindowOwner) close3d($)
    return next(e)
  })

  // Runs around each tool call: the agent who makes it walks to its station and works there
  on('tool.call', async ($, e, next) => {
    if (await touchesShared($, e)) return { deny: "The agent workshop's folder (~/.claude/agent-workshop) and its window are not Claude's to read or change" }
    const agent = agentFor(e.agentId)
    const station = stationOf(e.tool)
    if (String(e.tool) === 'TodoWrite' && Array.isArray(e.todos) && e.agentId === undefined) {
      todos = e.todos.slice(0, 40).map((todo) => ({ content: clip(todo.content, 200), status: todo.status, activeForm: clip(todo.activeForm, 200) }))
    }
    agent.station = station
    agent.calls += 1
    busy[station] = (busy[station] ?? 0) + 1
    say(agent, labelFor(e))
    const call = { tool: String(e.tool), label: clip(labelFor(e), 80), who: agent.name, at: Date.now(), result: 'running' }
    recentCalls = remember(recentCalls, call)
    const settle = (result) => (recentCalls = recentCalls.map((one) => (one === call ? { ...one, result } : one)))
    try {
      const answer = await next(e)
      if (answer.deny !== undefined || answer.isError) {
        say(agent, tr(answer.deny !== undefined ? 'blocked' : 'oops'), OOPS_TICKS, '#E5484D')
      }
      settle(answer.deny !== undefined ? 'blocked' : answer.isError ? 'failed' : 'ok')
      const diff = answer.deny === undefined && !answer.isError ? diffOf(e) : null
      if (diff !== null) {
        edits = [...edits, { file: basename(e.file_path ?? e.notebook_path), diff, at: Date.now() }].slice(-EDITS_MAX)
        moreVersion += 1
      }
      return answer
    } catch (error) {
      settle('failed')
      throw error
    } finally {
      busy[station] -= 1
      agent.calls -= 1
      agent.isWaiting = false
      if (agent.calls === 0 && agent.bubbleTicks === 0) say(agent, '')
    }
  })

  // Runs when the main loop's turn starts: its id, so the window can stop it
  on('turn.start', async ($, e, next) => {
    turnId = e.turnId
    isWorking = true
    turnPrompt = tidyUserMessage(e.text).find((row) => row.kind === 'prompt')?.text ?? ''
    windowPrompts = windowPrompts.filter((text) => !e.text.includes(text))
    liveText = ''
    liveThinking = ''
    if (titlesOn && turnPrompt.trim() !== '') void nameTurn($, turnPrompt).catch(() => {})
    moreVersion += 1
    return next(e)
  })

  // Runs as each model response streams: what the model writes and thinks, for the window. A
  // subagent's response only marks it thinking or not
  on('turn.step', async function* ($, e, next) {
    const agent = agentFor(e.agentId)
    const isMain = e.agentId === undefined
    if (isMain && liveText !== '') liveText += '\n\n'
    const pieces = next(e)[Symbol.asyncIterator]()
    try {
      while (true) {
        const piece = await pieces.next()
        if (piece.done) return piece.value
        const chunk = piece.value
        if (chunk.kind === 'thinking') {
          agent.isThinking = true
          if (isMain) liveThinking = (liveThinking + chunk.text).slice(-1000)
        } else if (chunk.kind === 'text') {
          agent.isThinking = false
          if (isMain) liveText = (liveText + chunk.text).slice(-LIVE_MAX * 2)
        } else if (chunk.kind === 'tool') {
          agent.isThinking = false
        }
        yield chunk
      }
    } finally {
      agent.isThinking = false
    }
  })

  // Runs when a turn ends: the main agent leaves its station; a subagent's end sends it out the door
  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const agent = agents.get(e.agentId)
      if (agent !== undefined) agent.isLeaving = true
      return next(e)
    }
    isWorking = false
    turnId = null
    answers = [...answers, { at: Date.now(), prompt: clip(turnPrompt, 2000), answer: e.answer.slice(0, 20000), durationMs: e.durationMs, reason: e.reason }].slice(-ANSWERS_MAX)
    moreVersion += 1
    const agent = agentFor()
    agent.station = null
    agent.stroll = null
    agent.isWaiting = false
    busy = {}
    const seconds = Math.round(e.durationMs / 1000)
    if (e.reason === 'answer') say(agent, tr('done ✓ {s}s', { s: seconds }), DONE_TICKS, '#3FB950')
    else if (e.reason === 'aborted') say(agent, tr('stopped'), DONE_TICKS)
    else say(agent, tr(e.reason === 'refusal' ? 'refused' : 'error'), DONE_TICKS, '#E5484D')
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const columns = e.props.bodyColumns
    const subagents = [...agents.values()].filter((agent) => !agent.isMain).length

    const header = Box({
      key: 'header',
      flexDirection: 'row',
      columnGap: 1,
      children: [
        Text({ bold: true, children: ['agent workshop'] }),
        Text({ dimColor: true, children: [tr(subagents === 1 ? '· {n} subagent' : '· {n} subagents', { n: subagents })] }),
        lastHook === null
          ? Text({ dimColor: true, children: [tr('· no hooks yet')] })
          : Box({
              key: 'last-hook',
              flexDirection: 'row',
              columnGap: 1,
              children: [
                Text({ dimColor: true, children: [tr('· hook')] }),
                Text({ color: eventColor(lastHook.event), children: [lastHook.event] }),
                Text({ color: lastHook.color, children: [lastHook.who] }),
              ],
            }),
        Box({ flexGrow: 1, children: [] }),
        Button({ key: 'floor', label: tr('room'), hotkey: 'f', plain: true, dimColor: view !== 'floor', onPress: () => setView($, 'floor') }),
        Button({ key: 'hooks', label: tr('hooks'), hotkey: 'h', plain: true, dimColor: view !== 'hooks', onPress: () => setView($, 'hooks') }),
      ],
    })

    if (view === 'hooks') return Box({ flexDirection: 'column', children: [header, hooksTable(elements, columns)] })

    // The room takes every row under the header: cells on a terminal, a picture elsewhere,
    // and a roster of agents in words when the pane is too small for a room
    room = layout(columns, (e.props.scroll?.bodyRows ?? 24) - 1)
    if (room === null) return Box({ flexDirection: 'column', children: [header, roster(elements, columns)] })
    const placed = [...agents.values()].filter((agent) => agent.x !== null)
    const painted = paint({
      room,
      ticks,
      busy: Object.fromEntries(Object.entries(busy).map(([id, n]) => [id, n > 0])),
      isDoorOpen: placed.some((agent) => {
        const door = doorSpot(room, agent.size)
        return !agent.isMain && Math.abs(agent.x - door.x) + Math.abs(agent.y - door.y) < 8
      }),
      agents: placed.map((agent) => ({
        x: agent.x,
        y: agent.y,
        isMain: agent.isMain,
        color: agent.color,
        facing: agent.facing,
        step: Math.floor(agent.step / 2),
        isTyping: agent.calls > 0 && !agent.isWaiting && !agent.isWalking,
        isAsleep: agent.isAsleep === true,
        bubble: agent.bubble === '' ? undefined : { text: agent.bubble, background: agent.bubbleColor },
      })),
    })
    const picture =
      e.surface === 'terminal'
        ? elements.Raster({ key: 'scene', columns: room.width, rows: room.rows, cells: rasterCells(painted) })
        : elements.Svg({ ...drawing(painted), alt: tr('The agent workshop: ') + describe() })
    return Box({
      flexDirection: 'column',
      children: [header, Box({ key: 'floor', marginLeft: Math.floor((columns - room.width) / 2), children: [picture] })],
    })
  })
}

function setView($, next) {
  view = next
  $.ui.invalidate('ui.render')
}

// Who is doing what, in words
function describe() {
  return [...agents.values()]
    .map((agent) => agent.name + (agent.station === null ? tr(' idle') : tr(' at {station}', { station: tr(agent.station) })) + (agent.isWaiting ? tr(' (waiting for you)') : ''))
    .join(', ')
}

// The small pane's room: one row per agent
function roster({ Box, Text }, columns) {
  return Box({
    key: 'roster',
    flexDirection: 'column',
    children: [...agents.values()].map((agent) =>
      Box({
        key: 'agent-' + agent.id,
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ color: agent.color, children: ['●'] }),
          Text({ children: [pad(agent.name, NAME_MAX)] }),
          Text({ dimColor: true, children: [pad(tr(agent.station ?? 'idle'), 10)] }),
          Text({ children: [clip(agent.bubble, Math.max(1, columns - NAME_MAX - 12))] }),
        ],
      }),
    ),
  })
}

// Every hook event: how often it fired this session, and when it fires
function hooksTable({ Box, Text }, columns) {
  const known = HOOKS.map(([name]) => name)
  const extra = Object.keys(counts).filter((name) => !known.includes(name)).map((name) => [name, ''])
  const describeWidth = Math.max(1, columns - EVENT_WIDTH - 7)
  return Box({
    key: 'hooks-table',
    flexDirection: 'column',
    children: [
      Text({ dimColor: true, children: [tr('Settings hooks fire at these points. Each count is this session’s.')] }),
      ...[...HOOKS, ...extra].map(([name, text]) =>
        Box({
          key: 'hook-' + name,
          flexDirection: 'row',
          children: [
            Text({ color: eventColor(name), dimColor: counts[name] === undefined, children: [pad(name, EVENT_WIDTH)] }),
            Text({ children: [String(counts[name] ?? 0).padStart(4) + '  '] }),
            Text({ dimColor: true, children: [clip(tr(text), describeWidth)] }),
          ],
        }),
      ),
    ],
  })
}
