// DSH QQ 身份自动注入插件。
// 每轮 assemble 时按会话 id 查 OneBot，把「她自己是谁 / 对方是谁」注入提示词，
// AI 无需主动调用工具。市场空白点：现成 QQ 插件全是工具型，没人做自动注入。
import { identityText } from './identity.js'
import { loadCfg } from './config.js'

export const name = 'dsh-qq-identity'
export const inject = ['systemPrompt']

export function apply(ctx) {
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const result = await next()
    const agent = context && context.agent
    if (loadCfg().debug) console.log('[qq-identity] hook fired, agent=' + (agent && agent.id) + ' keys=' + Object.keys(context || {}).join(','))
    if (!agent || !agent.id) return result

    const text = await identityText(agent.id, ctx.logger)
    if (loadCfg().debug) console.log('[qq-identity] identityText=' + (text || '(空)'))
    if (!text) return result

    const entry = { name: 'qq-identity', text, interpolate: false }
    const idx = result.contexts.findIndex((c) => c.name === 'qq-identity')
    if (idx >= 0) result.contexts[idx] = { ...result.contexts[idx], ...entry }
    else result.contexts.unshift(entry)

    // 调试日志：默认关，config 里 debug:true 才写。便于端到端实证 hook 真的触发。
    try {
      if (loadCfg().debug) {
        console.log('[qq-identity] 注入 agent=' + agent.id + ' text=' + text.replace(/[\r\n]+/g, ' '))
      }
    } catch (e) {}
    return result
  })
}
