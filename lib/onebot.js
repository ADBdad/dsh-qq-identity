// SnowLuma（OneBot 11 风格）HTTP 接口封装。
// 抄自 dsh-qq-tools/lib/onebot.js 的成熟写法：自带 fetch，不新增依赖。

export async function onebot(action, body, cfg) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '')
  if (!base) throw new Error('没有配置 OneBot/SnowLuma 地址')
  const ctrl = new AbortController()
  const timeout = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 6000
  const timer = setTimeout(() => ctrl.abort(new Error('OneBot 请求超时')), timeout)
  try {
    const headers = { 'content-type': 'application/json' }
    if (cfg.accessToken) headers.authorization = 'Bearer ' + cfg.accessToken
    const r = await fetch(base + '/' + action, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    })
    const text = await r.text()
    let data
    try {
      data = JSON.parse(text)
    } catch (error) {
      throw new Error('OneBot 返回不是 JSON：' + text.slice(0, 200))
    }
    if (!r.ok) throw new Error('OneBot HTTP ' + r.status + '：' + text.slice(0, 200))
    if (data && data.status && data.status !== 'ok') {
      throw new Error('OneBot 错误：' + String(data.message || data.wording || ('retcode ' + data.retcode)))
    }
    return data && data.data !== undefined ? data.data : data
  } finally {
    clearTimeout(timer)
  }
}
