// 身份解析：从会话 id 认出是哪个群/哪个人，查 OneBot 拼出注入文本。
// 带 TTL 缓存——不是后台循环，就一个 Map。
import fs from 'node:fs'
import { onebot } from './onebot.js'
import { loadCfg } from './config.js'

const cache = new Map() // key -> { text, ts }

function fromCache(key, ttlMs) {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (ttlMs > 0 && Date.now() - hit.ts > ttlMs) {
    cache.delete(key)
    return undefined
  }
  return hit.text
}

function putCache(key, text) {
  cache.set(key, { text, ts: Date.now() })
  // 简单容量闸，防止长期运行无限涨
  if (cache.size > 500) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

function listOf(data, key) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data[key])) return data[key]
  return []
}

function clean(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim()
}

let mapCache = null
let mapCacheTs = 0

// DSH 给 hook 的 agent.id 是内部 sessionId（session-xxx），不是 QQ 会话 key。
// 通过桥接落盘的 sessions.json 把 sessionId 反查回 group:N / private:N。
// 文件才几百字节，2 秒缓存足够，避免每轮读盘。
function sessionKeyFor(agentId, cfg) {
  const id = String(agentId || '')
  if (/^(group|private):\d+$/.test(id)) return id // 已经是 QQ key，直接用
  const file = cfg.sessionMapFile
  if (!file) return ''
  try {
    if (!mapCache || Date.now() - mapCacheTs > 2000) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      mapCache = data && data.sessions && typeof data.sessions === 'object' ? data.sessions : {}
      mapCacheTs = Date.now()
    }
    for (const [key, sid] of Object.entries(mapCache)) {
      if (sid === id) return key
    }
  } catch (e) {}
  return ''
}

async function selfQQ(cfg) {
  const info = await onebot('get_login_info', {}, cfg)
  return info && (info.user_id != null) ? String(info.user_id) : ''
}

// 群聊：自己的群名片 / 角色 / 头衔
async function groupIdentity(groupId, cfg) {
  const parts = []
  const myQQ = await selfQQ(cfg)
  let member = null
  if (myQQ) {
    try {
      const info = await onebot('get_group_member_info', { group_id: Number(groupId), user_id: Number(myQQ) }, cfg)
      if (info && !info.retcode) member = info
    } catch (e) {}
  }
  if (member) {
    const card = clean(member.card)
    const nick = clean(member.nickname)
    const role = clean(member.role)
    const title = clean(member.title)
    const roleText = role === 'owner' ? '群主' : role === 'admin' ? '管理员' : '普通成员'
    parts.push(`你在群里的身份：${card || nick || '成员'}（QQ ${myQQ}），${roleText}${title ? '，头衔「' + title + '」' : ''}`)
  } else {
    // 兜底：至少告诉它群号和自己 QQ，不编造角色
    parts.push(`当前群号 ${groupId}${myQQ ? '，你的 QQ ' + myQQ : ''}；未能取得你在群内的名片/角色。`)
  }
  return '【你的群内身份】' + parts.join('')
}

// 私聊：对方昵称 / 备注 / 是否好友
async function privateIdentity(peerQQ, cfg) {
  const parts = []
  let stranger = null
  let isFriend = null
  let remark = ''
  try {
    const friends = await onebot('get_friend_list', {}, cfg)
    const list = listOf(friends, 'friends')
    const me = list.find((f) => String(f.user_id) === String(peerQQ))
    if (me) {
      isFriend = true
      remark = clean(me.remark || me.nickname)
    } else if (list.length) {
      isFriend = false
    }
  } catch (e) {}
  try {
    stranger = await onebot('get_stranger_info', { user_id: Number(peerQQ) }, cfg)
  } catch (e) {}
  const nick = clean(stranger && stranger.nickname)
  const name = remark || nick || ''
  const friendText = isFriend === true ? '是你的好友' : isFriend === false ? '不是你的好友' : '好友状态未知'
  parts.push(`对方 QQ ${peerQQ}${name ? '，' + (remark ? '你备注为「' + remark + '」' : '昵称「' + nick + '」') : ''}，${friendText}`)
  return '【私聊对象】' + parts.join('')
}

// 根据 agent.id 生成注入文本；失败一律返回空串，绝不因查不到身份而打断对话。
export async function identityText(agentId, logger) {
  const cfg = loadCfg()
  // agent.id 可能是 DSH 内部 sessionId，先反查成 QQ 会话 key（group:N / private:N）
  const key = sessionKeyFor(agentId, cfg)
  const id = key || String(agentId || '')
  let m
  try {
    if (cfg.enableGroup && (m = id.match(new RegExp(cfg.groupPattern)))) {
      const key = 'g:' + m[1]
      const hit = fromCache(key, cfg.ttlMs)
      if (hit !== undefined) return hit
      const text = await groupIdentity(m[1], cfg)
      putCache(key, text)
      return text
    }
    if (cfg.enablePrivate && (m = id.match(new RegExp(cfg.privatePattern)))) {
      const peer = m[1]
      // 私聊：可以给"她自己"的身份提示，但保持简单——仍标注对方是谁
      const key = 'p:' + peer
      const hit = fromCache(key, cfg.ttlMs)
      if (hit !== undefined) return hit
      const text = await privateIdentity(peer, cfg)
      putCache(key, text)
      return text
    }
  } catch (error) {
    if (logger && typeof logger.warn === 'function') logger.warn('[qq-identity] 取身份失败：' + String(error && error.message || error))
  }
  return ''
}
