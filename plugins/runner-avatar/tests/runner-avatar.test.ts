import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'runner-avatar',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('the avatar strolls, then follows a turn from start to finish', async ($, on) => {
  const clock = mock.clock(on)
  // Answer the engine's events in Claude Code's place
  on('session.start', (_$, e) => e)
  // Beneath the mod the band is empty
  on('ui.render', () => ({ type: 'Box', props: { key: 'empty' }, children: [] }))
  on('ui.message', () => ({}))
  on('command.register', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  const played: unknown[] = []
  on('audio.play', (_$, e) => {
    played.push(e)
    return { value: undefined }
  })
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200_000, tokens: 84_000, percent: 42 }, rateLimits: [], cost: {} },
  }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', (_$, e) => (String(e.tool) === 'Read' ? { result: 'no such file', isError: true } : { result: 'ok' }))
  await $.session.start({ cwd: '/tmp' })

  const ui = await $.ui.mount(BAND)

  // Idle: the avatar is there, with no bubble, and strolls one cell every third tick
  expect(JSON.stringify(await ui.drawn())).toContain('▐▛███▜▌')
  expect(await ui.find({ key: 'bubble' })).toBeUndefined()
  expect((await ui.drawn()).props.marginLeft).toBe(0)
  await clock.advance(360)
  await ui.redraw()
  expect((await ui.drawn()).props.marginLeft).toBe(1)

  // A turn starts: the bubble says so
  await $.turn.start({ text: 'hello', turnId: 't1' })
  await ui.redraw()
  expect((await ui.find({ key: 'bubble' }))?.text).toBe('thinking…')

  // A tool call that fails makes the avatar flinch
  await $.tool.call({ tool: 'Read', file_path: '/tmp/nope.txt' })
  await ui.redraw()
  expect((await ui.find({ key: 'bubble' }))?.text).toBe('oops')

  // A subagent's tool call brings its small avatar, and its turn's end takes it away
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1' })
  await ui.redraw()
  expect((await ui.find({ key: 'minis' }))?.text).toContain('█')
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'a1' })
  await ui.redraw()
  expect(await ui.find({ key: 'minis' })).toBeUndefined()

  // The turn ends: the avatar celebrates, then goes back to strolling
  await $.turn.complete({ answer: 'hi', durationMs: 20_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await ui.redraw()
  expect((await ui.find({ key: 'bubble' }))?.text).toBe('done ✓ 20s · 42%')
  // A turn of 15 seconds or more chimes
  expect(played.length).toBe(1)
  await clock.advance(120 * 40)
  await ui.redraw()
  expect(await ui.find({ key: 'bubble' })).toBeUndefined()

  // /avatar hides the avatar, and /avatar show brings it back
  expect((await $.command.run({ command: 'avatar', args: '' })).text).toBe('avatar hidden')
  await ui.redraw()
  expect(JSON.stringify(await ui.drawn())).not.toContain('▐▛███▜▌')
  expect((await $.command.run({ command: 'avatar', args: 'show' })).text).toBe('avatar shown')

  // A click on the avatar makes it hop over its shadow, then land
  await ui.pointer({ type: 'down', x: 2, y: 0, button: 'left' })
  await ui.redraw()
  expect(await ui.find({ key: 'shadow' })).toBeDefined()
  expect((await ui.find({ key: 'bubble' }))?.text).toBe('hop!')
  await clock.advance(120 * 10)
  await ui.redraw()
  expect(await ui.find({ key: 'shadow' })).toBeUndefined()

  // /avatar tennis starts a game, the ball flies, and a new turn ends the game
  expect((await $.command.run({ command: 'avatar', args: 'tennis' })).text).toBe('game on')
  await ui.redraw()
  expect(await ui.find({ key: 'tennis' })).toBeDefined()
  expect(JSON.stringify(await ui.drawn())).toContain('●')
  expect((await ui.find({ key: 'tennis' }))?.text).toContain('0 : 0')
  // Long enough for a rally to end in the net: somebody has 15
  await clock.advance(120 * 150)
  await ui.redraw()
  expect((await ui.find({ key: 'tennis' }))?.text).toMatch(/15|30|40|game/)
  await $.turn.start({ text: 'again', turnId: 't3' })
  await ui.redraw()
  expect(await ui.find({ key: 'tennis' })).toBeUndefined()
})

test('on the desktop the avatar and the court are drawings', async ($, on) => {
  mock.clock(on)
  on('session.start', (_$, e) => e)
  on('ui.render', () => ({ type: 'Box', props: { key: 'empty' }, children: [] }))
  on('ui.message', () => ({}))
  on('command.register', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  await $.session.start({ cwd: '/tmp' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  // No block characters and no region of its own: one drawing, three rows of cells high
  const idle = JSON.stringify(await ui.drawn())
  expect(idle).toContain('<svg')
  expect(idle).not.toContain('▐▛███▜▌')
  expect(idle).not.toContain('sprite.js')
  expect(idle).toContain('height=\\"48\\"')
  // The body is one path, not a rectangle per quarter, so no seams show when it is scaled
  expect(idle.match(/<path /g)?.length).toBe(1)
  expect(idle).not.toContain('<rect')

  expect((await $.command.run({ command: 'avatar', args: 'tennis' })).text).toBe('game on')
  await ui.redraw()
  const court = JSON.stringify(await ui.find({ key: 'tennis' }))
  expect(court).toContain('<svg')
  expect(court).toContain('<circle')
})
