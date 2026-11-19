// hook 级测试：验证 system-prompt/assemble 监听器能把身份写进 assembly.contexts。
// 用 mock ctx 直接调 apply 注册的监听器。运行：node test/hook.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {}
    let data = {}
    if (req.url === '/get_login_info') data = { user_id: 10001000 }
    else if (req.url === '/get_group_member_info') data = { card: '测试名片', role: 'owner', nickname: '测试机器人' }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', retcode: 0, data }))
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qqid-hook-'))
fs.writeFileSync(path.join(home, 'qq-identity-config.json'), JSON.stringify({
  baseUrl: `http://127.0.0.1:${port}`, ttlMs: 0,
}))
process.env.DSH_HOME = home

const { apply, name, inject } = await import('../lib/index.js')

let handle
const ctx = {
  logger: { warn() {} },
  on(event, fn) { if (event === 'system-prompt/assemble') handle = fn },
  effect(fn) { return fn() },
}
apply(ctx)

const next = async () => ({ contexts: [{ name: 'other', text: 'x' }] })

let pass = 0, fail = 0
const check = (n, c, d) => c ? (pass++, console.log('  PASS ' + n)) : (fail++, console.log('  FAIL ' + n + (d ? ' :: ' + d : '')))

check('导出 name 正确', name === 'dsh-qq-identity', name)
check('inject 含 systemPrompt', Array.isArray(inject) && inject.includes('systemPrompt'))
check('注册了 assemble 监听器', typeof handle === 'function')

// 群会话
const assembly = await handle({}, { agent: { id: 'group:555' } }, next)
const entry = assembly.contexts.find((c) => c.name === 'qq-identity')
console.log('  注入内容 -> ' + (entry && entry.text))
check('写入 qq-identity context', !!entry)
check('内容含群名片', entry && entry.text.includes('测试名片'))
check('内容含群主', entry && entry.text.includes('群主'))
check('interpolate=false', entry && entry.interpolate === false)
check('保留原有 context', assembly.contexts.some((c) => c.name === 'other'))

// 重复调用只更新不叠加
const assembly2 = await handle({}, { agent: { id: 'group:555' } }, async () => ({ contexts: [{ name: 'qq-identity', text: 'old' }] }))
const matches = assembly2.contexts.filter((c) => c.name === 'qq-identity')
check('重复注入不叠加', matches.length === 1, 'count=' + matches.length)

// 无 agent 时原样返回
const assembly3 = await handle({}, {}, next)
check('无 agent 原样返回', assembly3.contexts.length === 1 && assembly3.contexts[0].name === 'other')

server.close()
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
