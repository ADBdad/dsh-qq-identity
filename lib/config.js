// 配置读写：绝不写插件目录（pnpm 重装会覆盖），一律放 $DSH_HOME。
import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.DSH_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.dsh')
const CFG_PATH = path.join(HOME, 'qq-identity-config.json')

export const DEFAULT_CFG = {
  baseUrl: 'http://127.0.0.1:3000',
  accessToken: '',
  timeoutMs: 6000,
  ttlMs: 60000,
  enableGroup: true,
  enablePrivate: true,
  groupPattern: '^group:(\\d+)$',
  privatePattern: '^private:(\\d+)$',
  // 会话映射文件：把 DSH 的 sessionId 反查成 QQ 会话 key（group:N / private:N）。
  // 格式为 { "sessions": { "group:<群号>": "session-<uuid>", ... } }；留空则不启用反查。
  sessionMapFile: '',
  debug: false,
}

let cached = null
let cachedMtime = 0

export function loadCfg() {
  try {
    const st = fs.statSync(CFG_PATH)
    if (cached && st.mtimeMs === cachedMtime) return cached
  } catch (error) {
    // 文件不存在，返回默认并落盘一份，方便用户直接改
    try {
      fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true })
      fs.writeFileSync(CFG_PATH, JSON.stringify(DEFAULT_CFG, null, 2), 'utf8')
    } catch (e) {}
    cached = { ...DEFAULT_CFG }
    cachedMtime = 0
    return cached
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'))
  } catch (error) {
    return cached || { ...DEFAULT_CFG }
  }
  const num = (v, d, min, max) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d
  }
  cached = {
    baseUrl: typeof raw.baseUrl === 'string' && raw.baseUrl ? raw.baseUrl : DEFAULT_CFG.baseUrl,
    accessToken: typeof raw.accessToken === 'string' ? raw.accessToken : '',
    timeoutMs: num(raw.timeoutMs, DEFAULT_CFG.timeoutMs, 500, 60000),
    ttlMs: num(raw.ttlMs, DEFAULT_CFG.ttlMs, 0, 3600000),
    enableGroup: raw.enableGroup !== false,
    enablePrivate: raw.enablePrivate !== false,
    groupPattern: typeof raw.groupPattern === 'string' && raw.groupPattern ? raw.groupPattern : DEFAULT_CFG.groupPattern,
    privatePattern: typeof raw.privatePattern === 'string' && raw.privatePattern ? raw.privatePattern : DEFAULT_CFG.privatePattern,
    sessionMapFile: typeof raw.sessionMapFile === 'string' ? raw.sessionMapFile : '',
    debug: raw.debug === true,
  }
  try { cachedMtime = fs.statSync(CFG_PATH).mtimeMs } catch (error) { cachedMtime = 0 }
  return cached
}

export function saveCfg(patch) {
  const next = { ...loadCfg(), ...(patch || {}) }
  const dir = path.dirname(CFG_PATH)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = CFG_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  fs.renameSync(tmp, CFG_PATH)
  cached = null
  cachedMtime = 0
  return next
}

export function configPath() {
  return CFG_PATH
}
