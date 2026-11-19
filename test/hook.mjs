// hook 级测试：验证 context 注册（required:true）+ assemble 监听器注入。
// 用 mock ctx 直接调 apply。运行：node test/hook.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    let data = {}
    if (req.url === '/get_login_info') data = { user_id: 10001000 }
    else if (req.url === '/get_group_member_info') data = { card: '测试名片', role: 'owner', nickname: '测试机器人' }
    else if (req.url === '/get_friend_list') data = { friends: [{ user_id: 20002000, nickname: '测试备注', remark: '测试备注' }] }
    else if (req.url === '/get_stranger_info') data = { user_id: 20002000, nickname: '测试备注' }
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

// mock ctx：记下注册的 context 定义与 assemble 监听器
let handle
let registeredContext
const ctx = {
  logger: { warn() {} },
  systemPrompt: {
    context(def) { registeredContext = def; return () => {} },
  },
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

console.log('-- context 注册（防 suppressRuntimeContext 过滤）--')
check('注册了 qq-identity context', !!registeredContext && registeredContext.name === 'qq-identity')
check('context 标 required:true', registeredContext && registeredContext.required === true)
check('context 用 interpolate:false', registeredContext && registeredContext.interpolate === false)
check('context order 是有限数', registeredContext && Number.isFinite(registeredContext.order), registeredContext && registeredContext.order)
check('context.text 是函数', registeredContext && typeof registeredContext.text === 'function')

// 群会话
const assembly = await handle({}, { agent: { id: 'group:555' } }, next)
const entry = assembly.contexts.find((c) => c.name === 'qq-identity')
console.log('  注入内容 -> ' + (entry && entry.text))
check('写入 qq-identity context', !!entry)
check('内容含群名片', entry && entry.text.includes('测试名片'))
check('内容含群主', entry && entry.text.includes('群主'))
check('interpolate=false', entry && entry.interpolate === false)
check('保留原有 context', assembly.contexts.some((c) => c.name === 'other'))

console.log('-- context provider 能拿到上一轮结果（同步路径）--')
const syncText = registeredContext.text({ agent: { id: 'group:555' } })
check('同步 provider 返回上轮身份', typeof syncText === 'string' && syncText.includes('测试名片'), syncText)

// 重复调用只更新不叠加
const assembly2 = await handle({}, { agent: { id: 'group:555' } }, async () => ({ contexts: [{ name: 'qq-identity', text: 'old' }] }))
const matches = assembly2.contexts.filter((c) => c.name === 'qq-identity')
check('重复注入不叠加', matches.length === 1, 'count=' + matches.length)
check('重复注入覆盖旧值', matches[0].text.includes('测试名片'), matches[0].text)

// 无 agent 时原样返回
const assembly3 = await handle({}, {}, next)
check('无 agent 原样返回', assembly3.contexts.length === 1 && assembly3.contexts[0].name === 'other')

// 上下文缺 contexts 数组时不崩
let crashed = null
let assembly4 = null
try {
  assembly4 = await handle({}, { agent: { id: 'group:555' } }, async () => ({}))
} catch (e) { crashed = e }
check('contexts 缺失时不抛异常', !crashed, crashed && crashed.message)

server.close()
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
