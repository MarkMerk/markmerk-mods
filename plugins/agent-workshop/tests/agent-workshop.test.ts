import { expect, mock, test } from 'claude-code/testing'

const pane = (bodyColumns: number) =>
  ({
    plugin: 'agent-workshop',
    component: 'Pane',
    requestId: 'agent-workshop',
    props: {
      title: 'Workshop',
      isFocused: false,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 30 },
      view: {},
    },
  }) as const

// Answer the engine's events in Claude Code's place
function engine(on: Parameters<Parameters<typeof test>[1]>[1], { withStore = true } = {}) {
  const clock = mock.clock(on)
  on('session.start', (_$, e) => e)
  on('command.register', () => ({ value: undefined }))
  if (withStore) {
    on('store.get', () => ({ value: undefined }))
    on('store.set', () => ({ value: undefined }))
  }
  on('ui.open', () => ({ value: { isOpen: true } }))
  on('classic.*', () => ({}))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', (_$, e) => (String(e.tool) === 'Read' ? { result: 'no such file', isError: true } : { result: 'ok' }))
  return clock
}

test('the header names the last hook event, and the hooks view counts them', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp' })
  const ui = await $.ui.mount({ ...pane(100), surface: 'terminal' })

  // The room fills the pane under the header, as cells on the terminal
  expect(await ui.find({ key: 'scene' })).toBeDefined()
  expect((await ui.find({ key: 'header' }))?.text).toContain('no hooks yet')

  await $.classic.UserPromptSubmit({ prompt: 'fix the failing tests' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Read', file_path: '/tmp/nope.txt' })
  await ui.redraw()
  expect((await ui.find({ key: 'last-hook' }))?.text).toContain('PreToolUse')
  expect((await ui.find({ key: 'last-hook' }))?.text).toContain('main')

  await ui.press({ key: 'hooks' })
  expect((await ui.find({ key: 'hook-PreToolUse' }))?.text).toContain('2')
  expect((await ui.find({ key: 'hook-UserPromptSubmit' }))?.text).toContain('1')
  expect((await ui.find({ key: 'hook-Stop' }))?.text).toContain('0')
  await ui.press({ key: 'floor' })
  expect(await ui.find({ key: 'scene' })).toBeDefined()

  expect((await $.command.run({ command: 'workshop', args: 'clear' })).text).toBe('Hook counts cleared.')
  await ui.redraw()
  expect((await ui.find({ key: 'header' }))?.text).toContain('no hooks yet')
  await ui.unmount()
})

test('a subagent comes in, works at a station, and leaves by the door', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/tmp' })
  // A small pane lists the agents in words
  const ui = await $.ui.mount({ ...pane(40), surface: 'terminal' })
  expect((await ui.find({ key: 'agent-main' }))?.text).toContain('idle')

  await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'a1' })
  await ui.redraw()
  expect((await ui.find({ key: 'agent-a1' }))?.text).toContain('Explore#1')
  expect((await ui.find({ key: 'agent-a1' }))?.text).toContain('files')

  await $.classic.SubagentStop({
    agent_id: 'a1',
    agent_type: 'Explore',
    agent_transcript_path: '/tmp/a1.jsonl',
    stop_hook_active: false,
  })
  // It walks back to the door, then is gone
  await clock.advance(140 * 120)
  await ui.redraw()
  expect(await ui.find({ key: 'agent-a1' })).toBeUndefined()

  // The main turn ends: the main agent leaves its station and says how long it took
  await $.turn.complete({ answer: 'done', durationMs: 12_000, isAborted: false, turnId: 't1', reason: 'answer' })
  await ui.redraw()
  expect((await ui.find({ key: 'agent-main' }))?.text).toContain('done ✓ 12s')
  await ui.unmount()
})

test('on the desktop the floor is a drawing', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/tmp' })
  const ui = await $.ui.mount({ ...pane(100), surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('/workshop 3d shares this session into the window, which other sessions join', async ($, on) => {
  const clock = engine(on)
  const files = new Map<string, string>()
  const ran: string[][] = []
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.read', (_$, e) => {
    if (e.path.endsWith('/web/workshop.html')) return { value: '<html>the page</html>' }
    const text = files.get(e.path)
    if (text === undefined) throw new Error('no such file')
    return { value: text }
  })
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', () => ({ value: [{ name: 's0.js', kind: 'file', size: 10, mtimeMs: Date.now(), isLink: false }] }))
  await $.session.start({ cwd: '/work/my-project' })
  const base = '/home/me/.claude/agent-workshop'

  // With no window open, nothing is written
  await clock.advance(3000)
  expect(files.size).toBe(0)

  expect((await $.command.run({ command: 'workshop', args: '3d' })).text).toContain('3D workshop opened')
  expect(files.get(base + '/index.html')).toBe('<html>the page</html>')
  expect(files.get(base + '/sessions/s1.js')).toContain('"project":"my-project"')
  // The index lists this session beside the others the folder holds
  expect(files.get(base + '/index.js')).toBe('window.workshopIndex(["s0","s1"])\n')
  expect(ran.at(-1)).toContain('--app=file://' + base + '/index.html')

  // The state follows what the agents do
  await $.classic.SubagentStart({ agent_id: 'a1', agent_type: 'Explore' })
  await $.tool.call({ tool: 'Grep', pattern: 'TODO', agentId: 'a1' })
  await clock.advance(300)
  const state = files.get(base + '/sessions/s1.js') ?? ''
  expect(state).toContain('"name":"Explore#1"')
  expect(state).toContain('"station":"files"')
  expect(state).toContain('"event":"PreToolUse"')

  // Turned off, the heartbeat stops, goes stale, and the session stops writing
  await $.command.run({ command: 'workshop', args: '3d off' })
  files.set(base + '/viewer', String(Date.now() - 60_000))
  await clock.advance(2500)
  const after = files.get(base + '/sessions/s1.js')
  await $.classic.UserPromptSubmit({ prompt: 'more' })
  await clock.advance(3000)
  expect(files.get(base + '/sessions/s1.js')).toBe(after)
})

test('the window prompts a session, and answers its permission requests', async ($, on) => {
  const clock = engine(on)
  const files = new Map<string, string>()
  const ran: string[][] = []
  const prompts: string[] = []
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    // The shell loop that waits for the window's answer finds one
    if (e.argv[0] === 'sh') return { value: { exitCode: 0, stdout: JSON.stringify({ decision: 'allow', mode: 'acceptEdits' }), stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  // The server, once started, beats the heartbeat while the page uses it
  let isServing = false
  on('process.spawn', async function* () {
    isServing = true
    yield { stream: 'stdout', text: '51234\n' }
    await new Promise(() => {})
    return { code: 0, signal: null }
  })
  const origins: unknown[] = []
  on('prompt.submit', (_$, e) => {
    prompts.push(e.text)
    origins.push(e.origin)
    return { text: e.text }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0 } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.read', (_$, e) => {
    if (e.path.endsWith('/viewer') && isServing) return { value: JSON.stringify({ at: Date.now(), canControl: true, port: 51234, pid: 4242 }) }
    if (e.path.endsWith('/web/workshop.html')) return { value: '<html>the page</html>' }
    const text = files.get(e.path)
    if (text === undefined) throw new Error('no such file')
    return { value: text }
  })
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_$, e) => {
    const prefix = e.path + '/'
    const names = [...files.keys()].filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))
    return { value: names.map((name) => ({ name, kind: 'file', size: 1, mtimeMs: Date.now(), isLink: false })) }
  })
  await $.session.start({ cwd: '/work/my-project' })
  const base = '/home/me/.claude/agent-workshop'

  expect((await $.command.run({ command: 'workshop', args: '3d' })).text).toContain('you can prompt them from it')
  // The browser gets a launcher in the private folder, taking it to the page with a one-time key
  // in the fragment, which also lies in claims/ for the server to burn; no token anywhere
  const opened = ran.at(-1)?.find((arg) => arg.startsWith('--app=')) ?? ''
  expect(opened).toMatch(new RegExp('^--app=file://' + base + '/open/[0-9a-f]{32}\\.html$'))
  const launcher = files.get(opened.slice('--app=file://'.length)) ?? ''
  const key = /#k=([0-9a-f]{64})/.exec(launcher)?.[1] ?? ''
  expect(launcher).toContain('http://127.0.0.1:51234/#k=' + key)
  expect(files.has(base + '/claims/' + key)).toBe(true)
  expect(files.get(base + '/sessions/s1.js')).toContain('"canControl":true')

  // A prompt left in the inbox is submitted, and the inbox emptied
  files.set(base + '/inbox/s1/1.json', JSON.stringify({ session: 's1', type: 'prompt', text: 'run the tests' }))
  await clock.advance(300)
  expect(prompts).toEqual(['run the tests'])
  // As the person's own words: the model reads it without the plugin's frame
  expect(origins[0]).toMatchObject({ kind: 'plugin', asUser: true })
  expect(ran.some((argv) => argv[0] === 'rm' && argv[2] === base + '/inbox/s1/1.json')).toBe(true)

  // The window asks for a new session: the folder dialog, then a Terminal in the folder chosen
  files.set(base + '/inbox/_window/2.json', JSON.stringify({ session: '_window', type: 'pick-folder' }))
  ran.length = 0
  await clock.advance(300)
  const dialog = ran.find((argv) => argv[0] === 'osascript' && argv.some((arg) => arg.includes('choose folder')))
  expect(dialog).toBeDefined()

  // A permission request waits for the window, which allows it
  const answer = await $.classic.PermissionRequest({ tool_name: 'Write', tool_input: { file_path: '/work/my-project/a.md' } })
  expect(answer.decision).toEqual({ behavior: 'allow', updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }] })
  const asked = ran.find((argv) => argv[0] === 'sh')
  expect(asked?.at(-2)).toMatch(new RegExp('^' + base + '/decisions/[0-9a-f]{24}$'))
})

test('the window gets what the model writes and thinks, the answers, the edits and the titles', async ($, on) => {
  const clock = engine(on)
  const files = new Map<string, string>()
  const asked: string[] = []
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, tokens: 90_000, percent: 45 }, rateLimits: [], cost: { usd: 0.5 } } }))
  on('model.complete', (_$, e) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true, text: 'fixing the failing tests', usage: { input_tokens: 1, output_tokens: 1 } } }
  })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.step', async function* (_$, e) {
    yield { kind: 'thinking', index: 0, text: 'Let me look' }
    yield { kind: 'text', index: 1, text: 'The tests ' }
    yield { kind: 'text', index: 1, text: 'pass now.' }
    return { turnId: e.turnId, index: e.index, answer: 'The tests pass now.', toolUses: [] }
  })
  on('fs.read', (_$, e) => {
    if (e.path.endsWith('/web/workshop.html')) return { value: '<html></html>' }
    const text = files.get(e.path)
    if (text === undefined) throw new Error('no such file')
    return { value: text }
  })
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', () => ({ value: [] }))
  await $.session.start({ cwd: '/work/app' })
  const base = '/home/me/.claude/agent-workshop'
  await $.command.run({ command: 'workshop', args: '3d' })
  const state = () => JSON.parse((files.get(base + '/sessions/s1.js') ?? '').replace(/^window\.workshopSession\(|\)\n$/g, ''))
  const more = () => JSON.parse((files.get(base + '/sessions/s1.more.js') ?? '').replace(/^window\.workshopMore\(|\)\n$/g, ''))

  // Titles are off until the window turns them on
  files.set(base + '/settings.json', JSON.stringify({ titles: true }))
  await clock.advance(2100)
  expect(state().titlesOn).toBe(true)
  expect(state().context).toEqual({ percent: 45, tokens: 90_000, window: 200_000 })
  expect(state().costUsd).toBe(0.5)

  // A turn: its title, then the response as it streams
  await $.turn.start({ text: 'make the tests pass', turnId: 't1' })
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1 })) {
    // Drain the stream
  }
  await clock.advance(300)
  expect(asked[0]).toContain('make the tests pass')
  expect(state().title).toBe('fixing the failing tests')
  expect(state().live.text).toBe('The tests pass now.')
  expect(state().live.thinking).toBe('Let me look')

  // An edit leaves its diff, and the answer joins the answers
  await $.tool.call({ tool: 'Edit', file_path: '/work/app/a.ts', old_string: 'a = 1', new_string: 'a = 2' })
  await $.turn.complete({ answer: 'The tests pass now.', durationMs: 9000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(300)
  expect(state().lastEdit.lines).toEqual(['- a = 1', '+ a = 2'])
  expect(state().answersMeta.length).toBe(1)
  expect(more().answers[0]).toMatchObject({ prompt: 'make the tests pass', answer: 'The tests pass now.', durationMs: 9000 })
  expect(more().edits[0]).toMatchObject({ file: 'a.ts', diff: '- a = 1\n+ a = 2' })
})

test('the window runs slash commands, sees todos and the chat, and answers questions', async ($, on) => {
  const clock = engine(on)
  const files = new Map<string, string>()
  const ran: string[][] = []
  const commands: string[] = []
  let decision = ''
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === 'sh') return { value: { exitCode: 0, stdout: decision, stderr: '' } }
    if (e.argv[0] === 'git') return { value: { exitCode: 0, stdout: 'src/a.ts\nREADME.md\n', stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  // The server, once started, beats the heartbeat while the page uses it
  let isServing = false
  on('process.spawn', async function* () {
    isServing = true
    yield { stream: 'stdout', text: '51234\n' }
    await new Promise(() => {})
    return { code: 0, signal: null }
  })
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 's1' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'The agent-workshop plugin sent a message: list the files This is how Claude Code surfaces a prompt a plugin submits between turns — it starts this turn in the user\'s place. Address the message above.', toolUses: [] },
      { role: 'assistant', text: 'Here they are.', toolUses: [{ tool: 'Bash', input: { command: 'ls' } }] },
      { role: 'user', text: '<task-notification>\n<task-id>a1</task-id>\n<status>completed</status>\n<summary>Agent "Review scene.js logic" finished</summary>\n</task-notification>\n\nit still shows this', toolUses: [] },
      { role: 'user', text: '<local-command-caveat>Caveat: the messages below were generated by the user</local-command-caveat>\n<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args></command-args>', toolUses: [] },
      { role: 'user', text: '<local-command-stdout>Set model to Opus 5.5</local-command-stdout>', toolUses: [] },
      { role: 'user', text: '<system-reminder>internal</system-reminder>', toolUses: [] },
    ],
  }))
  on('command.list', () => ({
    value: [
      { name: 'compact', description: 'Compact the conversation', source: 'builtin' },
      { name: 'code-review', description: 'Review the current diff', source: 'builtin' },
      { name: 'some-new-skill', description: 'Use this skill whenever the user asks for it', source: 'builtin' },
      { name: 'claude.ai Notion:make-this-a-notion-page (MCP)', description: 'Make a page', source: 'mcp' },
      { name: 'cv-builder', description: 'Use this skill to update the CV', source: 'user' },
      { name: 'engineering:debug', description: 'Structured debugging session', source: 'plugin', plugin: 'engineering' },
    ],
  }))
  on('command.run', (_$, e) => {
    if (e.command === 'compact' || e.command === 'exit') commands.push(e.command + ' ' + e.args)
    return { text: 'Compacted.' }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('fs.read', (_$, e) => {
    if (e.path.endsWith('/viewer') && isServing) return { value: JSON.stringify({ at: Date.now(), canControl: true, port: 51234, pid: 4242 }) }
    if (e.path.endsWith('/web/workshop.html')) return { value: '<html></html>' }
    const text = files.get(e.path)
    if (text === undefined) throw new Error('no such file')
    return { value: text }
  })
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_$, e) => {
    const prefix = e.path + '/'
    const names = [...files.keys()].filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))
    return { value: names.map((name) => ({ name, kind: 'file', size: 1, mtimeMs: Date.now(), isLink: false })) }
  })
  await $.session.start({ cwd: '/work/app' })
  const base = '/home/me/.claude/agent-workshop'
  await $.command.run({ command: 'workshop', args: '3d' })
  const state = () => JSON.parse((files.get(base + '/sessions/s1.js') ?? '').replace(/^window\.workshopSession\(|\)\n$/g, ''))
  const more = () => JSON.parse((files.get(base + '/sessions/s1.more.js') ?? '').replace(/^window\.workshopMore\(|\)\n$/g, ''))

  // The typeahead's lists, and the model
  // Commands and skills are listed; MCP prompts and plugins' namespaced commands are not
  const listed = JSON.parse((files.get(base + '/sessions/s1.cmds.js') ?? '').replace(/^window\.workshopCommands\(|\)\n$/g, '')).commands.map((one: { name: string }) => one.name)
  expect(listed).toEqual(['compact', 'code-review', 'some-new-skill', 'cv-builder'])
  expect(files.get(base + '/sessions/s1.files.js')).toContain('"src/a.ts"')
  expect(state().model).toBe('claude-opus-5-5')

  // A slash command from the window runs as if typed, and its answer is logged
  files.set(base + '/inbox/s1/1.json', JSON.stringify({ session: 's1', type: 'command', command: 'compact', args: 'keep the plan' }))
  await clock.advance(300)
  await clock.advance(300)
  expect(commands).toEqual(['compact keep the plan'])
  expect(more().commandLog[0]).toMatchObject({ command: '/compact keep the plan', text: 'Compacted.' })

  // A prompt the window sent shows as typed, without the words wrapped around it
  await $.turn.start({ text: 'The agent-workshop plugin sent a message: list the files This is how Claude Code surfaces a prompt a plugin submits between turns — it starts this turn in the user\'s place. Address the message above.', turnId: 't1' })
  await clock.advance(300)
  expect(more().chat[0]).toMatchObject({ role: 'user', text: 'list the files', isFromWindow: true })
  expect(more().chat[1].tools[0]).toMatchObject({ tool: 'Bash', label: '$ ls' })
  // The engine's own notes become short lines of their kind
  expect(more().chat[2]).toMatchObject({ role: 'user', kind: 'notice', text: 'Agent "Review scene.js logic" finished' })
  expect(more().chat[3]).toMatchObject({ kind: 'prompt', text: 'it still shows this' })
  expect(more().chat[4]).toMatchObject({ kind: 'command', text: '/model' })
  expect(more().chat[5]).toMatchObject({ kind: 'output', text: 'Set model to Opus 5.5' })
  expect(more().chat.some((row: { text: string }) => row.text.includes('<'))).toBe(false)

  // Idle long enough after its turn, the main agent is asleep: the window gets the fact, not a
  // snore bubble
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(140 * 400)
  const sleeper = state().agents.find((one: { isMain: boolean }) => one.isMain)
  expect(sleeper.isAsleep).toBe(true)
  expect(sleeper.bubble).toBe('')

  // The todo list
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' }] })
  await clock.advance(300)
  expect(state().todos).toEqual([{ content: 'Write tests', status: 'in_progress', activeForm: 'Writing tests' }])

  // "Always allow" keeps the request's own suggestion
  decision = JSON.stringify({ decision: 'allow', always: true })
  const suggestion = { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], behavior: 'allow', destination: 'localSettings' }
  const always = await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' }, permission_suggestions: [suggestion] })
  expect(always.decision).toEqual({ behavior: 'allow', updatedPermissions: [suggestion] })

  // A question gets its answers as the tool's input
  decision = JSON.stringify({ decision: 'allow', answers: { 'Which color?': 'Blue' } })
  const questions = [{ question: 'Which color?', header: 'Color', options: [{ label: 'Blue', description: '' }], multiSelect: false }]
  const answered = await $.classic.PermissionRequest({ tool_name: 'AskUserQuestion', tool_input: { questions } })
  expect(answered.decision).toEqual({ behavior: 'allow', updatedInput: { questions, answers: { 'Which color?': 'Blue' } } })

  // The window ends the session: goodbye first, for the window to show, then /exit
  files.set(base + '/inbox/s1/9.json', JSON.stringify({ session: 's1', type: 'end' }))
  await clock.advance(300)
  expect(state().isEnding).toBe(true)
  expect(state().agents.find((one: { isMain: boolean }) => one.isMain).bubble).toBe('bye!')
  expect(commands).not.toContain('exit ')
  await clock.advance(3600)
  expect(commands).toContain('exit ')
})

test('the main agent falls asleep when idle, and wakes for work', async ($, on) => {
  const clock = engine(on)
  await $.session.start({ cwd: '/tmp' })
  const ui = await $.ui.mount({ ...pane(40), surface: 'terminal' })
  await clock.advance(140 * 300)
  await ui.redraw()
  expect((await ui.find({ key: 'agent-main' }))?.text).toMatch(/z/)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(140)
  await ui.redraw()
  expect((await ui.find({ key: 'agent-main' }))?.text).not.toMatch(/ z( Z)?( z)?$/)
})

test('a session takes the spot it was started for, moves when asked, and keeps the window settings', async ($, on) => {
  const clock = engine(on, { withStore: false })
  const files = new Map<string, string>()
  const stored = new Map<string, unknown>()
  const ran: string[][] = []
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    // The folder dialog is not allowed here, as from an app that may not drive Finder
    if (e.argv[0] === 'osascript') return { value: { exitCode: 1, stdout: '', stderr: 'Not authorized to send Apple events to Finder. (-1743)' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('fs.stat', () => ({ value: { kind: 'dir', size: 0, mtimeMs: 0 } }))
  on('session.send', () => ({ isDelivered: true }))
  on('session.receive', (_$, e) => ({ text: e.text }))
  // The server, once started, beats the heartbeat while the page uses it
  let isServing = false
  on('process.spawn', async function* () {
    isServing = true
    yield { stream: 'stdout', text: '51234\n' }
    await new Promise(() => {})
    return { code: 0, signal: null }
  })
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/home/me' : e.name === 'AGENT_WORKSHOP_SLOT' ? '5' : undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', (_$, e) => {
    if (e.path.endsWith('/viewer') && isServing) return { value: JSON.stringify({ at: Date.now(), canControl: true, port: 51234, pid: 4242 }) }
    if (e.path.endsWith('/web/workshop.html')) return { value: '<html></html>' }
    const text = files.get(e.path)
    if (text === undefined) throw new Error('no such file')
    return { value: text }
  })
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_$, e) => {
    const prefix = e.path + '/'
    const names = [...files.keys()].filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length))
    return { value: names.map((name) => ({ name, kind: 'file', size: 1, mtimeMs: Date.now(), isLink: false })) }
  })
  on('store.get', (_$, e) => ({ value: stored.get(e.key) }))
  on('store.set', (_$, e) => {
    stored.set(e.key, e.value)
    return { value: undefined }
  })
  await $.session.start({ cwd: '/work/app' })
  const base = '/home/me/.claude/agent-workshop'
  await $.command.run({ command: 'workshop', args: '3d' })
  const state = () => JSON.parse((files.get(base + '/sessions/s1.js') ?? '').replace(/^window\.workshopSession\(|\)\n$/g, ''))

  // Started from the window's chosen spot
  expect(state().slot).toBe(5)

  // Moved: the new spot, kept in the store for a reload
  files.set(base + '/inbox/s1/1.json', JSON.stringify({ session: 's1', type: 'set-slot', slot: 30 }))
  await clock.advance(300)
  await clock.advance(300)
  expect(state().slot).toBe(30)
  expect(stored.get('slot:s1')).toBe(30)

  // The window's settings are changed one at a time, the others kept
  files.set(base + '/inbox/_window/2.json', JSON.stringify({ session: '_window', type: 'set-titles', on: true }))
  await clock.advance(300)
  files.set(base + '/inbox/_window/3.json', JSON.stringify({ session: '_window', type: 'set-tour', value: 'never' }))
  await clock.advance(300)
  expect(JSON.parse(files.get(base + '/settings.json') ?? '{}')).toEqual({ titles: true, tour: 'never' })

  // A new session at a spot: a script Terminal opens, no Apple Events asked
  files.set(base + '/inbox/_window/4.json', JSON.stringify({ session: '_window', type: 'new-session', dir: "/work/it's here", isContinue: true, slot: 12 }))
  await clock.advance(300)
  const launch = [...files.keys()].find((path) => path.startsWith(base + '/launch/') && path.endsWith('.command')) ?? ''
  expect(files.get(launch)).toBe("#!/bin/zsh -l\ncd -- '/work/it'\\''s here' || exit 1\nexport AGENT_WORKSHOP_SLOT=12\nexec claude --continue\n")
  expect(ran).toContainEqual(['open', '-a', 'Terminal', launch])

  // Messages between sessions: what this one sends and what reaches it, for a courier in the window
  await $.session.send({ to: 'thesis', text: 'The build is green, go ahead' })
  await $.session.receive({ origin: { kind: 'peer-send-message', isVerified: true } as never, text: 'Thanks, starting now' })
  await clock.advance(300)
  expect(state().mailOut.at(-1)).toMatchObject({ to: 'thesis', who: 'main', text: 'The build is green, go ahead' })
  expect(state().mailIn.at(-1)).toMatchObject({ text: 'Thanks, starting now' })

  // The folder dialog failing is told to the window, which offers recent projects instead
  files.set(base + '/inbox/_window/5.json', JSON.stringify({ session: '_window', type: 'pick-folder' }))
  await clock.advance(300)
  await clock.advance(300)
  expect(state().windowNotices.at(-1)).toMatchObject({ kind: 'pick-failed' })
})

test('sessions without the mod show as guests, read from their transcripts', async ($, on) => {
  const clock = engine(on)
  const files = new Map<string, string>()
  const line = (entry: object) => JSON.stringify(entry)
  const transcript = [
    '{"cut off line',
    line({ type: 'ai-title', aiTitle: 'Plotting the light curves', sessionId: 'g1' }),
    line({ type: 'user', timestamp: '2026-10-11T10:00:00Z', message: { role: 'user', content: 'plot the light curve' } }),
    line({ type: 'assistant', timestamp: '2026-10-11T10:00:05Z', message: { id: 'm1', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Reading the data first.' }] } }),
    line({ type: 'assistant', timestamp: '2026-10-11T10:00:06Z', message: { id: 'm1', model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'python plot.py' } }] } }),
  ].join('\n')
  on('process.run', (_$, e) => {
    const [command] = e.argv
    if (command === 'pgrep') return { value: { exitCode: 0, stdout: '100\n200\n300\n', stderr: '' } }
    if (command === 'lsof') return { value: { exitCode: 0, stdout: 'p100\nfcwd\nn/work/astro\np200\nfcwd\nn/work/app\np300\nfcwd\nn/opt/blog\n', stderr: '' } }
    if (command === 'sh' && e.argv[4]?.includes('-opt-blog')) return { value: { exitCode: 0, stdout: '/home/me/.claude/projects/-opt-blog/x9.jsonl\n', stderr: '' } }
    if (command === 'sh' && e.argv[4]?.includes('astro')) return { value: { exitCode: 0, stdout: '/home/me/.claude/projects/-work-astro/g1.jsonl\n', stderr: '' } }
    if (command === 'sh' && e.argv[4]?.includes('-work-app')) return { value: { exitCode: 0, stdout: '/home/me/.claude/projects/-work-app/s1.jsonl\n', stderr: '' } }
    if (command === 'tail') return { value: { exitCode: 0, stdout: transcript, stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  // The server, once started, beats the heartbeat while the page uses it
  let isServing = false
  on('process.spawn', async function* () {
    isServing = true
    yield { stream: 'stdout', text: '51234\n' }
    await new Promise(() => {})
    return { code: 0, signal: null }
  })
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: Date.now() - 2000 } }))
  on('fs.read', (_$, e) => {
    if (e.path.endsWith('/viewer') && isServing) return { value: JSON.stringify({ at: Date.now(), canControl: true, port: 51234, pid: 4242 }) }
    if (e.path.endsWith('/web/workshop.html')) return { value: '<html></html>' }
    const text = files.get(e.path)
    if (text === undefined) throw new Error('no such file')
    return { value: text }
  })
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  // blog runs the mod: its mark is fresh, so it is never a guest, whatever its transcript
  on('fs.list', () => ({ value: [{ name: 'x9.mod', kind: 'file', size: 1, mtimeMs: Date.now(), isLink: false }] }))
  await $.session.start({ cwd: '/work/app' })
  await $.command.run({ command: 'workshop', args: '3d' })
  await clock.advance(3300)
  const base = '/home/me/.claude/agent-workshop/sessions/'
  const read = (path: string, call: string) => JSON.parse((files.get(path) ?? '').replace(new RegExp('^window\\.' + call + '\\(|\\)\\n$', 'g'), ''))

  // The session in astro is a guest; this one, and blog, which run the mod, are not
  expect(files.has(base + 's1.js')).toBe(true)
  expect(files.has(base + 's1.mod')).toBe(true)
  expect(files.has(base + 'x9.js')).toBe(false)
  const guest = read(base + 'g1.js', 'workshopSession')
  expect(guest).toMatchObject({ id: 'g1', guest: true, project: 'astro', canControl: false, title: 'Plotting the light curves', model: 'claude-sonnet-5-5', isWorking: true })
  // Its Claude is at the shell, the Bash call having no result yet
  expect(guest.agents[0]).toMatchObject({ station: 'shell', bubble: '$ python plot.py' })
  const chat = read(base + 'g1.more.js', 'workshopMore').chat
  expect(chat).toEqual([
    { role: 'user', kind: 'prompt', text: 'plot the light curve', isFromWindow: false, tools: [] },
    { role: 'assistant', kind: 'answer', text: 'Reading the data first.', isFromWindow: false, tools: [{ tool: 'Bash', label: '$ python plot.py' }] },
  ])
})

test("Claude may not read or change the workshop's folder, however it spells it", async ($, on) => {
  engine(on)
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('session.id', () => ({ value: 's1' }))
  on('fs.stat', () => {
    throw new Error('no such file')
  })
  await $.session.start({ cwd: '/work/app' })
  const refused = async (call: Record<string, unknown>) => {
    const answer = (await $.tool.call(call as never)) as { deny?: string }
    return answer.deny !== undefined
  }
  const attempts = [
    { tool: 'Write', file_path: '/home/me/.claude/agent-workshop/viewer', content: '{}' },
    { tool: 'Write', file_path: '~/.claude/agent-workshop/viewer', content: '{}' },
    { tool: 'Write', file_path: '$HOME/.claude/./agent-workshop/viewer', content: '{}' },
    { tool: 'Edit', file_path: '/home/me//.claude/../.claude/agent-workshop/settings.json', old_string: 'a', new_string: 'b' },
    { tool: 'Write', file_path: '/home/me/.CLAUDE/AGENT-WORKSHOP/viewer', content: '{}' },
    { tool: 'Read', file_path: '/home/me/.claude/agent-workshop/sessions/s2.js' },
    { tool: 'Bash', command: 'cd ~/.claude && cat agent-workshop/viewer' },
    { tool: 'Bash', command: 'echo {} > "$HOME/.claude/agent-w"*/viewer' },
    { tool: 'Bash', command: 'cd ~/.claude; ls a*' },
    { tool: 'Bash', command: "python3 -c \"import os;open(os.path.join(os.environ['HOME'],'.claude','agent'+'-workshop','viewer'),'w')\"" },
    { tool: 'Bash', command: 'cp x.json ~/.claude/agent"-"workshop/inbox/s2/1.json' },
    { tool: 'mcp__filesystem__write_file', path: '/home/me/.claude/agent-workshop/inbox/s2/1.json', content: '{}' },
  ]
  for (const call of attempts) expect({ call, refused: await refused(call) }).toEqual({ call, refused: true })
  const fine = [
    { tool: 'Bash', command: 'git status' },
    { tool: 'Bash', command: 'ls ~/.claude/projects' },
    { tool: 'Read', file_path: '/home/me/.claude/settings.json' },
    { tool: 'Write', file_path: '/work/app/notes.md', content: 'agent notes' },
  ]
  for (const call of fine) expect({ call, refused: await refused(call) }).toEqual({ call, refused: false })
})
