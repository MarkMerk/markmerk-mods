// The avatar: body rows stay the same, the legs alternate to look like running
const BODY = ['▐▛███▜▌', '▝▜█████▛▘']
const LEGS = ['▘▘ ▝▝', '▝▝ ▘▘']
// Left offset of each row inside the sprite, and the sprite's full width
const OFFSETS = [1, 0, 2]
const WIDTH = 9
const COLOR = '#D97757'
// The avatar's color once the context window is nearly full, and from which percent
const HOT_COLOR = '#E5484D'
const HOT_PERCENT = 85
// The second player in a game of tennis, and a subagent's small avatar
const RIVAL_COLOR = '#6A9BCC'
const MINI = ['▟█▙', '▙█▟']
const MINI_MAX = 3
// The widest and narrowest tennis scene, in cells: both players and the court between them
const SCENE_MAX = 2 * WIDTH + 64
const SCENE_MIN = 2 * WIDTH + 30
// How far a player runs in from the baseline, and how far the ball flies each tick
const MOVE_MAX = 4
const BALL_SPEED = 3
// Ticks between a point and the next serve
const PAUSE_TICKS = 12
const POINTS = ['0', '15', '30', '40']
// Ticks of strolling before a game of tennis starts (about 20 seconds), and how long it lasts
const TENNIS_AFTER_TICKS = 160
const TENNIS_TICKS = 300
// A turn at least this long ends with a chime
const CHIME_MS = 15000
// Milliseconds between ticks, and how many ticks each short mood lasts
const TICK_MS = 120
const ALERT_TICKS = 8
const OOPS_TICKS = 12
const DONE_TICKS = 40
// Ticks of strolling before the avatar falls asleep (about a minute)
const SLEEPY_TICKS = 500
// Ticks the band may say no turn is running before a stuck "working" is dropped
const STALE_TICKS = 25
const BUBBLE_MAX = 28
// Ticks a jump lasts, and ticks its "hop!" stays
const JUMP_TICKS = 5
const HOP_TICKS = 8

// The desktop app draws the block characters in a font whose glyphs don't fill a cell, so there
// the avatar is a vector drawing: one cell is this many pixels
const CELL_W = 8
const CELL_H = 16
// Which quarters of its cell each block character fills: upper left, upper right, lower left, lower right
const QUARTERS = {
  '█': [1, 1, 1, 1],
  '▐': [0, 1, 0, 1],
  '▌': [1, 0, 1, 0],
  '▛': [1, 1, 1, 0],
  '▜': [1, 1, 0, 1],
  '▘': [1, 0, 0, 0],
  '▝': [0, 1, 0, 0],
  '▟': [0, 1, 1, 1],
  '▙': [1, 0, 1, 1],
}
// The named colors of the terminal, and the color of a cell that names none, as the drawing spells them
const PAINT = { green: '#3FB950', yellow: '#E3B341', red: '#E5484D' }
const PLAIN = '#8B8B8B'

// Where the avatar is, which way it runs, and which leg frame shows
let x = 0
let direction = 1
let frame = 0
let ticks = 0
// The band's width and whether a turn is running, as the last draw saw them
let columns = 80
let isWorking = false

// What the avatar is doing: idle, tennis, hop, alert, working, oops, done, stopped or asleep
let mood = 'idle'
// Ticks left in a short mood, and the mood that follows it
let moodTicks = 0
let moodAfter = 'idle'
// What the bubble says in the short moods
let note = ''
// The tool calls running now, newest last, as bubble labels
let tools = []
let idleTicks = 0
let staleTicks = 0
// How full the context window is, in percent, once known
let contextPercent = null
// What /avatar set: saved in the store, so it lasts between sessions
let isHidden = false
let isMuted = false
// The subagents working now, by id
let agents = new Set()
// The game of tennis. The ball: its column in the scene, which way it flies,
// where this shot started and where it lands, and whether it ends in the net
let ball = 0
let ballDirection = 1
let flightFrom = 0
let flightTo = 0
let isFault = false
// How far each player stands in from the baseline, where each is running to, and the leg frames
let playerAt = 0
let rivalAt = 0
let playerTarget = 0
let rivalTarget = 0
let playerLegs = 0
let rivalLegs = 0
// The points of this game, yours then the rival's, and the shots of this rally
let score = [0, 0]
let rally = 0
// Ticks left before the next serve, who serves it, and what the scoreboard says meanwhile
let pause = 0
let serveDirection = 1
let banner = ''
// A small generator of its own, so a game plays the same way in a test
let seed = 7
// Ticks left in the air after a click
let jump = 0
// True once a game was played in this quiet spell, so the avatar gets to sleep
let hasPlayed = false

// The scene's width for a band this wide, or 0 when there is no room for a court
function sceneWidth() {
  const scene = Math.min(columns, SCENE_MAX)
  return scene >= SCENE_MIN ? scene : 0
}

function roll(below) {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return Math.floor(seed / 65536) % below
}

// One shot: the ball leaves the hitter's racket for a spot the other player runs to,
// or, now and then in a long rally, for the net
function hit(scene, way) {
  ballDirection = way
  isFault = rally >= 2 && roll(100) < 30
  flightFrom = way > 0 ? playerAt + WIDTH + 2 : scene - WIDTH - rivalAt - 3
  if (isFault) {
    flightTo = Math.floor(scene / 2) - way
  } else if (way > 0) {
    rivalTarget = roll(MOVE_MAX + 1)
    flightTo = scene - WIDTH - rivalTarget - 3
  } else {
    playerTarget = roll(MOVE_MAX + 1)
    flightTo = playerTarget + WIDTH + 2
  }
  ball = flightFrom
}

function startTennis(forTicks) {
  setMood('tennis', forTicks, 'idle')
  hasPlayed = true
  playerAt = rivalAt = playerTarget = rivalTarget = 0
  score = [0, 0]
  rally = 0
  pause = 0
  banner = ''
  hit(sceneWidth(), 1)
}

// One tick of the game: the players run, the ball flies, and a shot into the net is a point
function playTennis() {
  const scene = sceneWidth()
  if (pause > 0) {
    pause -= 1
    if (pause === 0) {
      banner = ''
      rally = 0
      hit(scene, serveDirection)
    }
    return
  }
  if (playerAt !== playerTarget) {
    playerAt += Math.sign(playerTarget - playerAt)
    playerLegs = 1 - playerLegs
  }
  if (rivalAt !== rivalTarget) {
    rivalAt += Math.sign(rivalTarget - rivalAt)
    rivalLegs = 1 - rivalLegs
  }
  ball += ballDirection * BALL_SPEED
  const hasLanded = ballDirection > 0 ? ball >= flightTo : ball <= flightTo
  if (!hasLanded) return
  ball = flightTo
  if (!isFault) {
    rally += 1
    hit(scene, -ballDirection)
    return
  }
  // Into the net: the point goes to the player who didn't hit it, who serves next
  const winner = ballDirection > 0 ? 1 : 0
  if (score[winner] === POINTS.length - 1) {
    banner = 'game'
    score = [0, 0]
  } else {
    score = score.map((points, i) => (i === winner ? points + 1 : points))
  }
  serveDirection = winner === 0 ? 1 : -1
  pause = PAUSE_TICKS
}

// The row the ball is on: it rises over the net, comes down, bounces once and comes up to the racket
function ballRow() {
  if (isFault) return ball === flightTo ? 2 : 1
  const flown = Math.abs(ball - flightFrom) / Math.max(1, Math.abs(flightTo - flightFrom))
  if (flown < 0.12) return 1
  if (flown < 0.62) return 0
  if (flown < 0.72) return 1
  if (flown < 0.84) return 2
  return 1
}

// A row of text as cells of one style, shifted right by its offset
function cellsOf(text, offset, style) {
  return [...Array.from({ length: offset }, () => null), ...[...text].map((char) => (char === ' ' ? null : { char, ...style }))]
}

// A grid of cells as an SVG document: block characters become rectangles, the court's lines
// and the ball become shapes, and anything else stays a letter
function drawingOf(grid, width) {
  const shapes = []
  // The block characters' quarters, gathered into one path per paint: separate rectangles that
  // touch show hairline seams when the drawing is scaled, a single path doesn't
  const blocks = new Map()
  for (const [row, cells] of grid.entries()) {
    for (const [col, cell] of cells.entries()) {
      if (cell === null) continue
      const left = col * CELL_W
      const top = row * CELL_H
      const midX = left + CELL_W / 2
      const midY = top + CELL_H / 2
      const paint = `fill="${PAINT[cell.color] ?? cell.color ?? PLAIN}"${cell.dimColor ? ' opacity="0.55"' : ''}`
      const quarters = QUARTERS[cell.char]
      if (quarters !== undefined) {
        for (const [i, isFilled] of quarters.entries()) {
          if (!isFilled) continue
          const x = left + (i % 2) * (CELL_W / 2)
          const y = top + Math.floor(i / 2) * (CELL_H / 2)
          blocks.set(paint, [...(blocks.get(paint) ?? []), `M${x} ${y}h${CELL_W / 2}v${CELL_H / 2}h${-CELL_W / 2}z`])
        }
      } else if (cell.char === '▁') {
        shapes.push(`<rect x="${left}" y="${top + CELL_H - 2}" width="${CELL_W}" height="2" ${paint}/>`)
      } else if (cell.char === '┃' || cell.char === '╻') {
        const from = cell.char === '┃' ? top : midY
        shapes.push(`<rect x="${midX - 1}" y="${from}" width="2" height="${top + CELL_H - from}" ${paint}/>`)
      } else if (cell.char === '─') {
        shapes.push(`<rect x="${left}" y="${midY - 1}" width="${CELL_W}" height="2" ${paint}/>`)
      } else if (cell.char === '●' || cell.char === 'o') {
        shapes.push(`<circle cx="${midX}" cy="${midY}" r="${cell.char === '●' ? 3.5 : 3}" ${paint}/>`)
      } else {
        const letter = cell.char.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        shapes.push(
          `<text x="${midX}" y="${top + CELL_H - 4}" font-family="ui-monospace, Menlo, monospace" font-size="12" text-anchor="middle" ${paint}>${letter}</text>`,
        )
      }
    }
  }
  // The blocks go underneath, so the ball and the lines stay on top
  const paths = [...blocks].map(([paint, parts]) => `<path d="${parts.join('')}" ${paint}/>`)
  shapes.unshift(...paths)
  const pixels = { width: width * CELL_W, height: grid.length * CELL_H }
  return {
    ...pixels,
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels.width}" height="${pixels.height}" viewBox="0 0 ${pixels.width} ${pixels.height}" shape-rendering="crispEdges">${shapes.join('')}</svg>`,
  }
}

// A click on the avatar, or /avatar jump: it hops, and a sleeper wakes up
function poke() {
  jump = JUMP_TICKS
  if (mood === 'asleep' || mood === 'idle') setMood('hop', HOP_TICKS, 'idle', 'hop!')
}

// Read how full the context window is
async function measure($) {
  try {
    const { context } = await $.session.usage()
    contextPercent = context.percent ?? null
  } catch {
    // Keep the last reading
  }
}

function withContext(text) {
  return contextPercent === null ? text : text + ' · ' + contextPercent + '%'
}

function setMood(name, forTicks = 0, after = 'idle', text = '') {
  mood = name
  moodTicks = forTicks
  moodAfter = after
  note = text
  idleTicks = 0
}

function basename(path) {
  return String(path ?? '').split('/').pop()
}

function clip(text) {
  const line = String(text).replace(/\s+/g, ' ').trim()
  return line.length > BUBBLE_MAX ? line.slice(0, BUBBLE_MAX - 1) + '…' : line
}

// The bubble's words for a tool call
function labelFor(e) {
  const tool = String(e.tool)
  if (tool === 'Bash') return clip('$ ' + (e.command ?? ''))
  if (tool === 'Read') return clip('reading ' + basename(e.file_path))
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') {
    return clip('editing ' + basename(e.file_path ?? e.notebook_path))
  }
  if (tool === 'Grep' || tool === 'Glob') return 'searching'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'browsing'
  if (tool === 'Agent' || tool === 'Task') return 'delegating'
  if (tool.startsWith('mcp__')) return clip('using ' + tool.split('__').pop())
  return clip(tool)
}

// What the bubble says now, and in which color
function bubble() {
  if (mood === 'alert') return { text: '!', color: COLOR }
  if (mood === 'working') {
    return { text: withContext(tools.length > 0 ? tools[tools.length - 1] : 'thinking…'), dim: true }
  }
  if (mood === 'oops') return { text: note, color: 'red' }
  if (mood === 'done') return { text: withContext(note), color: 'green' }
  if (mood === 'stopped' || mood === 'hop') return { text: note, dim: true }
  if (mood === 'asleep') return { text: ['z', 'zZ', 'zZz'][Math.floor(ticks / 6) % 3], dim: true }
  return { text: '' }
}

function step() {
  const max = Math.max(0, columns - WIDTH)
  x += direction
  // Turn around at either edge
  if (x >= max) {
    x = max
    direction = -1
  } else if (x <= 0) {
    x = 0
    direction = 1
  }
  frame = (frame + 1) % LEGS.length
}

// One tick of the clock: move the avatar as its mood says
function tick() {
  ticks += 1
  if (jump > 0) jump -= 1
  if (moodTicks > 0) {
    moodTicks -= 1
    if (moodTicks === 0) setMood(moodAfter)
  }

  // Follow the band when an event was missed, such as after a reload mid-turn
  if (isWorking && (mood === 'idle' || mood === 'asleep' || mood === 'tennis')) setMood('working')
  staleTicks = mood === 'working' && !isWorking ? staleTicks + 1 : 0
  if (staleTicks > STALE_TICKS) setMood('idle')

  if (mood === 'working') {
    step()
  } else if (mood === 'idle') {
    idleTicks += 1
    // A slow stroll
    if (ticks % 3 === 0) step()
    if (!hasPlayed && idleTicks > TENNIS_AFTER_TICKS && sceneWidth() > 0) startTennis(TENNIS_TICKS)
    else if (idleTicks > SLEEPY_TICKS) {
      setMood('asleep')
      // A subagent whose end was missed doesn't run beside a sleeper
      agents = new Set()
    }
  } else if (mood === 'tennis') {
    if (sceneWidth() === 0) setMood('idle')
    else playTennis()
  } else if (mood === 'done') {
    // A little dance on the spot
    if (ticks % 2 === 0) frame = (frame + 1) % LEGS.length
  }
}

export function register(on) {
  // Runs before your first prompt, and again after a reload
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'avatar',
      description: 'Hide or show the avatar, mute its chime, start a game of tennis, or make it jump',
      argumentHint: '[hide|show|mute|unmute|tennis|jump]',
      immediate: true,
    })
    isHidden = (await $.store.get('isHidden')) === true
    isMuted = (await $.store.get('isMuted')) === true
    $.clock.every(TICK_MS, () => {
      tick()
      if (isHidden) return
      // Asleep, only the bubble changes, and slowly
      if (mood !== 'asleep' || ticks % 6 === 0) $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  // Runs when you type /avatar: with no argument it hides or shows the avatar
  on('command.run', { command: 'avatar' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'mute' || arg === 'unmute') {
      isMuted = arg === 'mute'
      await $.store.set('isMuted', isMuted)
      return { text: isMuted ? 'chime muted' : 'chime on' }
    }
    if (arg === 'jump') {
      poke()
      $.ui.invalidate('ui.render')
      return {}
    }
    if (arg === 'tennis') {
      if (sceneWidth() === 0) return { text: 'the terminal is too narrow for a court' }
      if (mood !== 'idle' && mood !== 'asleep' && mood !== 'tennis') return { text: 'busy now, ask again after the turn' }
      if (mood === 'tennis') setMood('idle')
      else startTennis(TENNIS_TICKS)
      return { text: mood === 'tennis' ? 'game on' : 'game over' }
    }
    if (arg !== '' && arg !== 'hide' && arg !== 'show') {
      return { text: 'usage: /avatar [hide|show|mute|unmute|tennis|jump]' }
    }
    isHidden = arg === '' ? !isHidden : arg === 'hide'
    await $.store.set('isHidden', isHidden)
    $.ui.invalidate('ui.render')
    return { text: isHidden ? 'avatar hidden' : 'avatar shown' }
  })

  // Runs when the avatar's own region reports a click
  on('ui.message', async ($, e, next) => {
    if (e.data?.poke === true) {
      poke()
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Runs when you send a prompt: the avatar stops and looks up
  on('prompt.submit', async ($, e, next) => {
    hasPlayed = false
    setMood('alert', ALERT_TICKS, 'working')
    return next(e)
  })

  // Runs when Claude starts answering: the avatar runs
  on('turn.start', async ($, e, next) => {
    if (mood !== 'alert') setMood('working')
    return next(e)
  })

  // Runs around each tool call: the bubble names it, and a failure makes the avatar flinch
  on('tool.call', async ($, e, next) => {
    const label = labelFor(e)
    // A subagent's tool call: its small avatar joins the run
    if (e.agentId !== undefined) agents = new Set([...agents, e.agentId])
    tools = [...tools, label]
    if (mood !== 'alert') setMood('working')
    try {
      const answer = await next(e)
      if (answer.deny !== undefined || answer.isError) {
        setMood('oops', OOPS_TICKS, 'working', answer.deny !== undefined ? 'blocked' : 'oops')
      }
      return answer
    } finally {
      const at = tools.lastIndexOf(label)
      tools = tools.filter((_, i) => i !== at)
      await measure($)
    }
  })

  // Runs when a turn ends: the avatar celebrates, or shrugs
  on('turn.complete', async ($, e, next) => {
    // A subagent's turn isn't the end of yours: only its small avatar leaves
    if (e.agentId !== undefined) {
      agents = new Set([...agents].filter((id) => id !== e.agentId))
      return next(e)
    }
    tools = []
    await measure($)
    // A chime for a long turn, so you can look away while Claude works
    if (!isMuted && e.reason === 'answer' && e.durationMs >= CHIME_MS) {
      $.audio.play({ asset: 'sounds/done.aiff' }).catch(() => {})
    }
    const seconds = Math.round(e.durationMs / 1000)
    if (e.reason === 'answer') setMood('done', DONE_TICKS, 'idle', 'done ✓ ' + seconds + 's')
    else if (e.reason === 'aborted') setMood('stopped', DONE_TICKS, 'idle', 'stopped')
    else setMood('oops', DONE_TICKS, 'idle', e.reason === 'refusal' ? 'refused' : 'error')
    return next(e)
  })

  // Runs each time Claude Code draws the band above the prompt
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Leave the band to a survey, and to a terminal too small for the avatar
    if (isHidden || e.props.hasSurvey || e.props.maxRows < 3 || e.props.bodyColumns < WIDTH) return next(e)
    columns = e.props.bodyColumns
    isWorking = e.props.isWorking
    const { Box, Text, Client, Svg } = $.ui.resolve(e)
    // The desktop app gets drawings, the terminal block characters
    const isDrawn = e.surface === 'desktop'

    const spriteColor = contextPercent !== null && contextPercent >= HOT_PERCENT ? HOT_COLOR : COLOR
    // A game of tennis: a court as wide as the band allows, a net in the middle, a player at each
    // baseline. Drawn as a grid of cells, each row then cut into runs of one style.
    const scene = sceneWidth()
    if (mood === 'tennis' && scene > 0) {
      const grid = [0, 1, 2].map(() => Array.from({ length: scene }, () => null))
      const put = (row, col, text, style) => {
        for (const [i, char] of [...text].entries()) {
          if (char !== ' ' && col + i >= 0 && col + i < scene) grid[row][col + i] = { char, ...style }
        }
      }
      const net = Math.floor(scene / 2)
      const player = { color: spriteColor }
      const rival = { color: RIVAL_COLOR }
      const line = { dimColor: true }
      const rivalLeft = scene - WIDTH - rivalAt

      // The court's surface, the net, and the score over it
      put(2, 0, '▁'.repeat(scene), { color: 'green', dimColor: true })
      put(1, net, '╻', line)
      put(2, net, '┃', line)
      const board = banner !== '' ? banner : POINTS[score[0]] + ' : ' + POINTS[score[1]]
      for (const [i, char] of [...board].entries()) grid[0][net - Math.floor(board.length / 2) + i] = { char, ...line }
      // The players, each with a racket held toward the net
      put(0, playerAt + OFFSETS[0], BODY[0], player)
      put(1, playerAt + OFFSETS[1], BODY[1], player)
      put(2, playerAt + OFFSETS[2], LEGS[playerLegs], player)
      put(1, playerAt + WIDTH, '─o', line)
      put(0, rivalLeft + OFFSETS[0], BODY[0], rival)
      put(1, rivalLeft + OFFSETS[1], BODY[1], rival)
      put(2, rivalLeft + OFFSETS[2], LEGS[rivalLegs], rival)
      put(1, rivalLeft - 2, 'o─', line)
      put(ballRow(), ball, '●', { color: 'yellow' })

      // Cut a row into runs of cells that share a style: one Text each, and a Box for a gap
      const runs = (cells) => {
        const children = []
        let from = 0
        while (from < cells.length) {
          const first = cells[from]
          let to = from + 1
          while (
            to < cells.length &&
            (cells[to] === null) === (first === null) &&
            cells[to]?.color === first?.color &&
            cells[to]?.dimColor === first?.dimColor
          ) {
            to += 1
          }
          children.push(
            first === null
              ? Box({ width: to - from, flexShrink: 0, children: [] })
              : Text({
                  color: first.color,
                  dimColor: first.dimColor === true,
                  children: [cells.slice(from, to).map((cell) => cell.char).join('')],
                }),
          )
          from = to
        }
        return Box({ flexDirection: 'row', children })
      }
      if (isDrawn) {
        return Box({
          key: 'tennis',
          marginLeft: Math.floor((columns - scene) / 2),
          children: [Svg({ ...drawingOf(grid, scene), alt: 'A game of tennis, ' + board })],
        })
      }
      return Box({
        key: 'tennis',
        flexDirection: 'column',
        marginLeft: Math.floor((columns - scene) / 2),
        children: grid.map(runs),
      })
    }

    const left = Math.max(0, Math.min(x, columns - WIDTH))
    const rows = [...BODY, LEGS[frame]]
    // The avatar is drawn by sprite.js in a region of its own, which reports clicks;
    // on the desktop it is a drawing, which doesn't
    const sprite = isDrawn
      ? Svg({
          ...drawingOf(
            rows.map((row, i) => cellsOf(row, OFFSETS[i], { color: spriteColor, dimColor: mood === 'asleep' })),
            WIDTH,
          ),
          alt: 'Claude avatar',
        })
      : Client({
          key: 'avatar',
          module: './sprite.js',
          width: WIDTH,
          height: 3,
          props: {
            rows,
            offsets: OFFSETS,
            color: spriteColor,
            isDim: mood === 'asleep',
          },
        })
    // In the air the avatar is a row higher, over its shadow
    const lift = (tree) =>
      jump > 0 && e.props.maxRows >= 4
        ? Box({
            flexDirection: 'column',
            children: [
              tree,
              Box({ key: 'shadow', marginLeft: left + 2, children: [Text({ dimColor: true, children: ['▔▔▔▔▔'] })] }),
            ],
          })
        : tree

    const { text, color, dim } = bubble()
    // The subagents' small avatars run beside the big one, at ground level
    const minis = Array.from({ length: Math.min(agents.size, MINI_MAX) }, () => MINI[frame]).join(' ')
    const sideWidth = Math.max(text.length, minis.length)
    if (sideWidth === 0) return lift(Box({ marginLeft: left, children: [sprite] }))

    // The bubble goes to the right of the avatar, or to its left near the right edge
    const roomRight = columns - (left + WIDTH + 1)
    const isOnRight = sideWidth <= roomRight || left < sideWidth + 1
    const cut = (line) => (isOnRight ? line.slice(0, Math.max(0, roomRight)) : line)
    const blank = Text({ children: [' '] })
    const side = Box({
      flexDirection: 'column',
      alignItems: isOnRight ? 'flex-start' : 'flex-end',
      children: [
        text === ''
          ? blank
          : Box({ key: 'bubble', children: [Text({ color, dimColor: dim === true, children: [cut(text)] })] }),
        blank,
        minis === ''
          ? blank
          : Box({ key: 'minis', children: [Text({ color: COLOR, dimColor: true, children: [cut(minis)] })] }),
      ],
    })
    return lift(
      Box({
        flexDirection: 'row',
        columnGap: 1,
        marginLeft: isOnRight ? left : left - sideWidth - 1,
        children: isOnRight ? [sprite, side] : [side, sprite],
      }),
    )
  })
}
