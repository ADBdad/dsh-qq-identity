// 冒烟测试：起一个假 OneBot，验证群聊/私聊身份注入文本。
// 不依赖任何外部服务。运行：node test/smoke.mjs
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// 假 OneBot
const seen = []
const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {}
    seen.push({ url: req.url, body })
    let data = {}
    if (req.url === '/get_login_info') data = { user_id: 10001000, nickname: '测试机器人' }
    else if (req.url === '/get_group_member_info') data = { card: '测试名片', nickname: '测试机器人', role: 'admin', title: '群管' }
    else if (req.url === '/get_friend_list') data = { friends: [{ user_id: 20002000, nickname: '测试备注', remark: '测试备注' }] }
    else if (req.url === '/get_stranger_info') data = { user_id: 999, nickname: '路人甲' }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', retcode: 0, data }))
  })
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

// 临时 DSH_HOME + 配置
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'qqid-'))
// 模拟桥接落盘的会话映射：sessionId -> QQ key
const mapFile = path.join(home, 'sessions.json')
fs.writeFileSync(mapFile, JSON.stringify({
  sessions: {
    'group:30003000': 'session-group-aaa',
    'private:20002000': 'session-private-bbb',
  },
  sessionPolicies: {},
}, null, 2))
fs.writeFileSync(path.join(home, 'qq-identity-config.json'), JSON.stringify({
  baseUrl: `http://127.0.0.1:${port}`,
  accessToken: '',
  ttlMs: 0,
  enableGroup: true,
  enablePrivate: true,
  groupPattern: '^group:(\\d+)$',
  privatePattern: '^private:(\\d+)$',
  sessionMapFile: mapFile,
}, null, 2))
process.env.DSH_HOME = home

const { identityText } = await import('../lib/identity.js')

let pass = 0
let fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS ' + name) }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')) }
}

console.log('== 群聊身份注入 ==')
const g = await identityText('group:123456')
console.log('  -> ' + g)
check('群聊含群名片', g.includes('测试名片'), g)
check('群聊含管理员', g.includes('管理员'), g)
check('群聊含头衔', g.includes('群管'), g)
check('群聊调用 get_group_member_info', seen.some((s) => s.url === '/get_group_member_info'))

console.log('== 私聊身份注入（好友）==')
const p1 = await identityText('private:20002000')
console.log('  -> ' + p1)
check('私聊含备注', p1.includes('测试备注'), p1)
check('私聊含"是你的好友"', p1.includes('是你的好友'), p1)

console.log('== 私聊身份注入（陌生人）==')
const p2 = await identityText('private:999')
console.log('  -> ' + p2)
check('私聊含昵称', p2.includes('路人甲'), p2)
check('私聊含"不是你的好友"', p2.includes('不是你的好友'), p2)

console.log('== DSH sessionId 反查 QQ key ==')
const sg = await identityText('session-group-aaa')
console.log('  -> ' + sg)
check('sessionId 反查到群身份', sg.includes('测试名片') && sg.includes('管理员'), sg)
const sp = await identityText('session-private-bbb')
console.log('  -> ' + sp)
check('sessionId 反查到私聊对象', sp.includes('测试备注'), sp)

console.log('== 未知 sessionId 不注入 ==')
const n = await identityText('session-unknown')
check('未知 sessionId 返回空', n === '', n)

server.close()
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
