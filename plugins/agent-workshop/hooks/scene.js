// The workshop in a three-quarter view: the back wall stands up, the floor runs toward you,
// and the furniture and agents have height, so whatever is nearer is drawn over what is behind.
// Each terminal cell holds two pixels, one above the other, drawn as '▀' in two colors. The
// first and the last cell rows are the tops of the back and front walls, where labels sit.

// The widest room, in cells: one pixel per column
const MAX_WIDTH = 160
// How tall the back wall's face is, in pixels, and where the door is in it
const WALL_FACE = 10
const DOOR_X = 3
const DOOR_W = 7
// A station's width, and the room a row of them needs
const STATION_W = 12
const SIDE = 2
// The agents: Claude's own loop, and a subagent
export const MAIN = { w: 11, h: 7 }
export const SUB = { w: 9, h: 5 }
// How far in front of the back wall the back row stands
const BACK_FOOT = WALL_FACE + 5
// The floor needed for a front row of stations, and the width six stations in one row need
const FRONT_ROW_HEIGHT = 50
const SINGLE_ROW_WIDTH = DOOR_X + DOOR_W + 2 + 6 * (STATION_W + 1) + SIDE

const WALL_TOP = 0x23222b
const WALL_FACE_COLOR = 0x3a3846
const WALL_PANEL = 0x35333f
const BASEBOARD = 0x26252e
const SIDE_WALL = 0x2b2a33
const PLANKS = [0x5a4a3a, 0x5f4f3e, 0x564636]
const SEAM = 0x52432f
const RUG = 0x5a3a3f
const RUG_EDGE = 0x7a5258
const DOOR = 0x6b4e33
const DOOR_FRAME = 0x4a3524
const DOOR_OPEN = 0xf3d9a4
const WINDOW_FRAME = 0x26252e
const SKY = [0x7fa7d9, 0x9cc0e8]
const SHADOW = 0x000000
const BUBBLE = 0xe8e2d0
const INK = 0x16161c
const LABEL = 0x8b8b96
const LABEL_LIT = 0xf2f0ea

const PALETTE = {
  K: 0x16161c,
  d: 0x20302a,
  G: 0x3fb950,
  W: 0x7a5a3a,
  w: 0x5c4329,
  T: 0x9a7a55,
  F: 0x6b5038,
  r: 0xe5484d,
  b: 0x6a9bcc,
  y: 0xe3b341,
  g: 0x7fb069,
  p: 0xb48ead,
  P: 0xe8e2d0,
  k: 0x55555f,
  s: 0xc9ced6,
  S: 0x9aa3ae,
  M: 0x6b6f78,
  N: 0x8a8f99,
  O: 0x9f86e0,
  L: 0xd6c8ff,
}

// The stations, each drawn as you see it from the front and a little above: a top in a lighter
// shade, a front face in a darker one. `c`, `z` and `l` are the moving parts: `swap` says what
// each is when the station is idle, and in its two busy frames. The first three stand against
// the back wall, the other three in the room, with their agents behind them.
export const STATIONS = [
  {
    id: 'shell',
    label: 'shell',
    sprite: [
      '..KKKKKKKK..',
      '..KddddddK..',
      '..KdGGGddK..',
      '..KdGcdddK..',
      '..KddddddK..',
      '..KKKKKKKK..',
      '.....KK.....',
      'TTTTTTTTTTTT',
      'TTkkkkkkTTTT',
      'TTTTTTTTTkTT',
      'FFFFFFFFFFFF',
      'F..........F',
      'F..........F',
    ],
    swap: { c: ['d', 'G', 'd'] },
  },
  {
    id: 'files',
    label: 'files',
    sprite: [
      'WWWWWWWWWWWW',
      'WrbyWgrpbbgW',
      'WrbyWgrpbbgW',
      'WrbyWgrpcbgW',
      'WWWWWWWWWWWW',
      'WpgbbWyrbgpW',
      'WpgbbWyrbgpW',
      'WpgbbWyzbgpW',
      'WWWWWWWWWWWW',
      'WbbyrrgWpbyW',
      'WbbyrrgWpbyW',
      'wwwwwwwwwwww',
    ],
    swap: { c: ['b', 'W', 'b'], z: ['b', 'b', 'W'] },
  },
  {
    id: 'edit',
    label: 'edit',
    sprite: [
      '.........ll.',
      '.........kl.',
      '..........k.',
      '..........k.',
      '..........k.',
      '..........k.',
      '.........kkk',
      'TTTTTTTTTTTT',
      'TPPPPPPTTTTT',
      'TPkkzkPTTyTT',
      'FFFFFFFFFFFF',
      'F..........F',
      'F..........F',
    ],
    swap: { l: ['k', 'y', 'y'], z: ['k', 'y', 'P'] },
  },
  {
    id: 'web',
    label: 'web',
    sprite: [
      '....sSSs..c.',
      '...sSssSs.k.',
      '...sSssSs.k.',
      '....sSSs..k.',
      '.....MM...k.',
      'TTTTTTTTTTTT',
      'TTkkkTTzkkTT',
      'FFFFFFFFFFFF',
      'F..........F',
    ],
    swap: { c: ['N', 'y', 'N'], z: ['k', 'r', 'k'] },
  },
  {
    id: 'mcp',
    label: 'mcp',
    sprite: [
      'NNNNNNNNNNNN',
      'MMMMMMMMMMMM',
      'MKcKgKbKyKzM',
      'MKKKKKKKKKKM',
      'MKgKzKyKcKbM',
      'MKKKKKKKKKKM',
      'MMMMMMMMMMMM',
      'M..........M',
    ],
    swap: { c: ['r', 'L', 'r'], z: ['b', 'b', 'L'] },
  },
  {
    id: 'agents',
    label: 'agents',
    sprite: [
      '.....cc.....',
      '....cOOc....',
      '...wwwwww...',
      '.wTTTTTTTTw.',
      'wTTTTTTTTTTw',
      '.wTTTTTTTTw.',
      '...FFFFFF...',
      '.....FF.....',
      '....FFFF....',
    ],
    swap: { c: ['O', 'L', 'O'] },
  },
]

// Which station a tool is worked at
export function stationOf(tool) {
  const name = String(tool)
  if (name === 'Bash' || name === 'BashOutput' || name === 'KillShell' || name === 'Monitor') return 'shell'
  if (name === 'Read' || name === 'Grep' || name === 'Glob' || name === 'LS') return 'files'
  if (name === 'Edit' || name === 'Write' || name === 'MultiEdit' || name === 'NotebookEdit') return 'edit'
  if (name === 'WebFetch' || name === 'WebSearch') return 'web'
  if (name.startsWith('mcp__')) return 'mcp'
  return 'agents'
}

// Where everything is in a room of this many cells, or null when there is no room for one.
// Pixel rows count from just under the top of the back wall. A tall room puts three stations
// against the back wall and three in front; a short, wide one puts all six against the wall.
export function layout(columns, rows) {
  const width = Math.min(columns, MAX_WIDTH)
  const height = (rows - 2) * 2
  const hasFrontRow = height >= FRONT_ROW_HEIGHT && width >= 60
  if (!hasFrontRow && (width < SINGLE_ROW_WIDTH || height < WALL_FACE + 6 + MAIN.h + 8)) return null
  const backLeft = DOOR_X + DOOR_W + 2
  const backCount = hasFrontRow ? 3 : 6
  const backSlot = (width - SIDE - backLeft) / backCount
  const frontSlot = (width - 2 * SIDE) / 3
  const stations = STATIONS.map((station, index) => {
    const isBack = index < backCount
    const tall = station.sprite.length
    if (isBack) {
      const x = Math.round(backLeft + backSlot * index + (backSlot - STATION_W) / 2)
      return { ...station, isBack, x, y: BACK_FOOT - tall, foot: BACK_FOOT }
    }
    const x = Math.round(SIDE + frontSlot * (index - 3) + (frontSlot - STATION_W) / 2)
    return { ...station, isBack, x, y: height - 2 - tall, foot: height - 2 }
  })
  // Windows in the back wall, in the gaps between the stations there
  const backs = stations.filter((one) => one.isBack)
  const windows = backs.slice(1).map((one, i) => Math.round((backs[i].x + STATION_W + one.x) / 2))
  return { width, rows, height, stations, windows, hasFrontRow }
}

// The row agents walk along between stations, for an agent this tall
export function aisleY(room, size) {
  const back = BACK_FOOT + 1 + size.h
  if (!room.hasFrontRow) return Math.round((back + room.height) / 2 - size.h / 2)
  const front = Math.min(...room.stations.filter((one) => !one.isBack).map((one) => one.y)) - size.h
  return Math.round((back + front) / 2 - size.h / 2)
}

// Where an agent of this size stands to work at a station, and which way it faces: in front of
// a station at the back wall with its back to you, behind one in the room facing you
export function spotAt(room, id, size) {
  const station = room.stations.find((one) => one.id === id)
  const x = station.x + STATION_W / 2 - size.w / 2
  return station.isBack
    ? { x, y: station.foot + 1, facing: 'up' }
    : { x, y: station.y - size.h + 2, facing: 'down' }
}

// Where the door is: in the back wall, at the left
export function doorSpot(room, size) {
  return { x: DOOR_X + DOOR_W / 2 - size.w / 2, y: WALL_FACE + 1 }
}

// An agent seen from the front: a lighter top, eyes on the side it faces and none from behind,
// arms out that drop in turn while it types, and legs that walk
function agentRows(size, facing, step, isTyping) {
  const isMain = size === MAIN
  const left = 2
  const right = size.w - 3
  const eyes = { down: [left + 1, right - 1], left: [left, left + 2], right: [right - 2, right], up: [] }[facing]
  const row = (cells) => Array.from({ length: size.w }, (_, x) => cells(x)).join('')
  const body = row((x) => (x >= left && x <= right ? 'X' : '.'))
  const top = body.replace(/X/g, 'H')
  const face = row((x) => (eyes.includes(x) ? 'e' : x >= left && x <= right ? 'X' : '.'))
  // Typing, one arm drops a row and then the other
  const isDown = (x) => isTyping && (step % 2 === 0 ? x < left : x > right)
  const arms = row((x) => (x >= left && x <= right ? 'X' : isDown(x) ? '.' : 'X'))
  const dropped = row((x) => (x >= left && x <= right ? 'X' : isDown(x) && (x === 1 || x === size.w - 2) ? 'X' : '.'))
  const feet = step % 2 === 0 ? [left, left + 2, right - 2, right] : [left - 1, left + 1, right - 1, right + 1]
  const legs = row((x) => (feet.includes(x) ? 'X' : '.'))
  return isMain ? [top, body, face, arms, dropped, body, legs] : [top, face, arms, dropped, legs]
}

function parseHex(hex) {
  return parseInt(hex.slice(1), 16)
}

function mix(color, toward, by) {
  const channel = (shift) => {
    const from = (color >> shift) & 0xff
    const to = (toward >> shift) & 0xff
    return Math.round(from + (to - from) * by) << shift
  }
  return channel(16) | channel(8) | channel(0)
}

// Paints the room into a grid of pixels plus text overlays, by cell index.
// `world`: { room, ticks, busy: { [station]: true }, isDoorOpen, agents: [...] }, each agent
// { x, y, isMain, color ('#rrggbb'), facing, step, isTyping, bubble?: { text, background? } }
export function paint(world) {
  const { room, ticks } = world
  const { width, height } = room
  const pixels = new Array(width * height)
  const overlays = new Map()
  const put = (x, y, color) => {
    if (x >= 0 && x < width && y >= 0 && y < height && color !== undefined) pixels[y * width + x] = color
  }
  const get = (x, y) => pixels[y * width + x]
  const sprite = (rows, left, top, colorOf) => {
    for (const [dy, row] of rows.entries()) {
      for (const [dx, char] of [...row].entries()) {
        if (char !== '.') put(left + dx, top + dy, colorOf(char))
      }
    }
  }
  const text = (row, from, line, color, background) => {
    for (const [i, char] of [...line].entries()) {
      if (from + i >= 0 && from + i < width) overlays.set(row * width + from + i, { char, color, background })
    }
  }
  // A soft shadow on whatever is under it
  const shadow = (left, right, y) => {
    for (let x = left; x <= right; x++) if (x >= 0 && x < width && y >= 0 && y < height) put(x, y, mix(get(x, y), SHADOW, 0.35))
  }

  // The back wall's face in panels, its baseboard, the windows and the door
  for (let y = 0; y < WALL_FACE; y++) {
    for (let x = 0; x < width; x++) put(x, y, y === WALL_FACE - 1 ? BASEBOARD : x % 16 === 0 ? WALL_PANEL : WALL_FACE_COLOR)
  }
  for (const middle of room.windows) {
    for (let y = 1; y < 7; y++) {
      for (let x = middle - 4; x <= middle + 4; x++) {
        const isFrame = y === 1 || y === 6 || x === middle - 4 || x === middle + 4 || x === middle
        put(x, y, isFrame ? WINDOW_FRAME : y < 4 ? SKY[1] : SKY[0])
      }
    }
  }
  for (let y = 1; y < WALL_FACE; y++) {
    for (let x = DOOR_X - 1; x <= DOOR_X + DOOR_W; x++) {
      const isFrame = x === DOOR_X - 1 || x === DOOR_X + DOOR_W || y === 1
      put(x, y, isFrame ? DOOR_FRAME : world.isDoorOpen ? DOOR_OPEN : y === 5 && x === DOOR_X + DOOR_W - 2 ? PALETTE.y : DOOR)
    }
  }
  // Wooden planks running across, each a little different, their seams staggered
  for (let y = WALL_FACE; y < height; y++) {
    const plank = Math.floor((y - WALL_FACE) / 3)
    for (let x = 0; x < width; x++) {
      const isSeam = (y - WALL_FACE) % 3 === 2 || (x + plank * 7) % 18 === 0
      put(x, y, isSeam ? SEAM : PLANKS[plank % PLANKS.length])
    }
  }
  // Light falling through the open door
  if (world.isDoorOpen) {
    for (let y = WALL_FACE; y < WALL_FACE + 4; y++) {
      for (let x = DOOR_X - (y - WALL_FACE); x <= DOOR_X + DOOR_W - 1 + (y - WALL_FACE); x++) {
        if (x >= 0) put(x, y, mix(get(x, y), DOOR_OPEN, 0.35 - (y - WALL_FACE) * 0.07))
      }
    }
  }
  // A rug in the middle of the floor, where there is room for one
  const aisle = aisleY(room, MAIN)
  const rugTop = aisle - 3
  const rugBottom = aisle + MAIN.h + 3
  if (rugTop > WALL_FACE + 4) {
    const rugLeft = Math.round(width * 0.32)
    const rugRight = Math.round(width * 0.68)
    for (let y = rugTop; y <= rugBottom; y++) {
      for (let x = rugLeft; x <= rugRight; x++) {
        const isEdge = y === rugTop || y === rugBottom || x === rugLeft || x === rugRight
        put(x, y, isEdge ? RUG_EDGE : (x + y) % 4 === 0 ? mix(RUG, RUG_EDGE, 0.3) : RUG)
      }
    }
  }
  // The side walls, seen edge on
  for (let y = 0; y < height; y++) {
    put(0, y, SIDE_WALL)
    put(width - 1, y, SIDE_WALL)
  }

  // Everything that stands on the floor, the farthest first, so nearer things cover it
  const frame = 1 + (Math.floor(ticks / 3) % 2)
  const things = [
    ...room.stations.map((station) => ({ foot: station.foot, draw: () => drawStation(station) })),
    ...world.agents.map((agent) => {
      const size = agent.isMain ? MAIN : SUB
      return { foot: Math.round(agent.y) + size.h, draw: () => drawAgent(agent, size) }
    }),
  ].sort((a, b) => a.foot - b.foot)
  function drawStation(station) {
    const isBusy = world.busy[station.id] === true
    shadow(station.x + 1, station.x + STATION_W, station.foot)
    sprite(station.sprite, station.x, station.y, (char) => {
      const swapped = station.swap[char]
      const actual = swapped === undefined ? char : swapped[isBusy ? frame : 0]
      return actual === '.' ? undefined : PALETTE[actual]
    })
    // A station's label sits on the wall top it stands by: the back one, or the front one
    const from = station.x + Math.floor((STATION_W - station.label.length) / 2)
    text(station.isBack ? 0 : room.rows - 1, from, station.label, isBusy ? LABEL_LIT : LABEL, WALL_TOP)
  }
  function drawAgent(agent, size) {
    const body = parseHex(agent.color)
    const left = Math.round(agent.x)
    // A working agent bobs a pixel now and then
    const top = Math.round(agent.y) - (agent.isTyping && Math.floor(ticks / 2) % 4 === 0 ? 1 : 0)
    shadow(left + 1, left + size.w - 2, Math.round(agent.y) + size.h)
    // Asleep, it sits a pixel lower with its eyes shut, its top rising and falling as it breathes
    const rows = agentRows(size, agent.isAsleep ? 'down' : agent.facing, agent.step, agent.isTyping)
    const settled = agent.isAsleep ? (Math.floor(ticks / 12) % 2 === 0 ? rows.slice(1) : rows.slice(1).map((row, i) => (i === 0 ? row.replace(/X/g, 'H') : row))) : rows
    sprite(settled, left, top + rows.length - settled.length, (char) =>
      char === 'e' ? (agent.isAsleep ? mix(body, INK, 0.45) : INK) : char === 'H' ? mix(body, 0xffffff, 0.22) : body,
    )
  }
  for (const thing of things) thing.draw()

  // The bubbles over everything: under an agent working at the back wall, over the others
  for (const agent of world.agents) {
    if (agent.bubble === undefined || agent.bubble.text === '') continue
    const size = agent.isMain ? MAIN : SUB
    const top = Math.round(agent.y)
    const isBelow = agent.facing === 'up' && top < aisle
    const row = isBelow ? 1 + Math.floor((top + size.h) / 2) + 1 : 1 + Math.floor(top / 2) - 1
    const line = ` ${agent.bubble.text} `
    const from = Math.max(0, Math.min(width - line.length, Math.round(agent.x + size.w / 2 - line.length / 2)))
    const background = agent.bubble.background === undefined ? BUBBLE : parseHex(agent.bubble.background)
    text(Math.max(0, Math.min(room.rows - 1, row)), from, line, INK, background)
  }
  return { room, pixels, overlays }
}

// The cells of a painted room, as a Raster wants them: [codePoint, foreground, background] each
export function rasterCells(painted) {
  const { room, pixels, overlays } = painted
  const { width, rows } = room
  const words = new Uint32Array(width * rows * 3)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < width; col++) {
      const at = (row * width + col) * 3
      const overlay = overlays.get(row * width + col)
      if (overlay !== undefined) {
        words[at] = overlay.char.codePointAt(0)
        words[at + 1] = overlay.color
        words[at + 2] = overlay.background
      } else if (row === 0 || row === rows - 1) {
        words[at] = 0x20
        words[at + 1] = WALL_TOP
        words[at + 2] = WALL_TOP
      } else {
        const y = (row - 1) * 2
        words[at] = 0x2580
        words[at + 1] = pixels[y * width + col]
        words[at + 2] = pixels[(y + 1) * width + col]
      }
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}

function toBase64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64()
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// The same room as an SVG, for surfaces that draw pictures rather than cells
const CELL_W = 8
const CELL_H = 16

function hex(color) {
  return '#' + color.toString(16).padStart(6, '0')
}

export function drawing(painted) {
  const { room, pixels, overlays } = painted
  const { width, rows, height } = room
  const shapes = []
  // The two wall tops, then each pixel row cut into runs of one color
  shapes.push(`<rect x="0" y="0" width="${width * CELL_W}" height="${CELL_H}" fill="${hex(WALL_TOP)}"/>`)
  shapes.push(`<rect x="0" y="${(rows - 1) * CELL_H}" width="${width * CELL_W}" height="${CELL_H}" fill="${hex(WALL_TOP)}"/>`)
  for (let y = 0; y < height; y++) {
    let from = 0
    while (from < width) {
      const color = pixels[y * width + from]
      let to = from + 1
      while (to < width && pixels[y * width + to] === color) to += 1
      shapes.push(
        `<rect x="${from * CELL_W}" y="${CELL_H + y * (CELL_H / 2)}" width="${(to - from) * CELL_W}" height="${CELL_H / 2}" fill="${hex(color)}"/>`,
      )
      from = to
    }
  }
  for (const [index, overlay] of overlays) {
    const left = (index % width) * CELL_W
    const top = Math.floor(index / width) * CELL_H
    const letter = overlay.char.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    shapes.push(`<rect x="${left}" y="${top}" width="${CELL_W}" height="${CELL_H}" fill="${hex(overlay.background)}"/>`)
    if (overlay.char !== ' ') {
      shapes.push(
        `<text x="${left + CELL_W / 2}" y="${top + CELL_H - 4}" font-family="ui-monospace, Menlo, monospace" font-size="12" text-anchor="middle" fill="${hex(overlay.color)}">${letter}</text>`,
      )
    }
  }
  const size = { width: width * CELL_W, height: rows * CELL_H }
  return {
    ...size,
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" shape-rendering="crispEdges">${shapes.join('')}</svg>`,
  }
}
