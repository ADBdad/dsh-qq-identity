// DSH QQ 身份自动注入插件。
// 每轮 assemble 时按会话 id 查 OneBot，把「她自己是谁 / 对方是谁」注入提示词，
// AI 无需主动调用工具。市场空白点：现成 QQ 插件全是工具型，没人做自动注入。
import { identityText } from './identity.js'
import { loadCfg } from './config.js'

export const name = 'dsh-qq-identity'
export const inject = ['systemPrompt']

const CONTEXT_NAME = 'qq-identity'
// 排在 working-directory(100) 之前：身份是「你是谁」，应该先于「你在哪」。
const CONTEXT_ORDER = 95

// 上一轮算出的身份文本，按 agent.id 缓存。
// 同步的 context provider 读它（suppressRuntimeContext 打开时仍能拿到上轮结果），
// async waterfall 每轮把它刷新成本轮最新值。
const lastText = new Map()

export function apply(ctx) {
  const dispose = ctx.systemPrompt.context({
    name: CONTEXT_NAME,
    order: CONTEXT_ORDER,
    // required:true 是关键——若宿主（或某个 preset 的 dsh-persona）设了
    // includeRuntimeContext:false，非 required 的 context 会被整批过滤掉，
    // 身份注入会静默消失。标 required 确保它活下来。
    required: true,
    interpolate: false,
    text: (context) => lastText.get(context && context.agent && context.agent.id) || '',
  })
  if (typeof ctx.effect === 'function') ctx.effect(() => dispose)

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const result = await next()
    const cfg = loadCfg()
    const agent = context && context.agent
    if (cfg.debug) console.log('[qq-identity] hook fired, agent=' + (agent && agent.id))
    if (!agent || !agent.id) return result
    if (!Array.isArray(result.contexts)) return result

    const text = await identityText(agent.id, ctx.logger)
    if (cfg.debug) console.log('[qq-identity] identityText=' + (text || '(空)'))

    // 查失败时保留上轮的文本（可能是空的），不要把已知身份清空。
    if (text) lastText.set(agent.id, text)
    const finalText = text || lastText.get(agent.id) || ''
    if (!finalText) return result

    const entry = { name: CONTEXT_NAME, text: finalText, interpolate: false }
    const idx = result.contexts.findIndex((c) => c && c.name === CONTEXT_NAME)
    if (idx >= 0) result.contexts[idx] = { ...result.contexts[idx], ...entry }
    else result.contexts.unshift(entry)
    return result
  }, { prepend: true })
}
