# dsh-qq-identity

> QQ 身份自动注入插件 —— 让 AI 在 QQ 里知道自己是谁、对面是谁。
> 基于 [OneBot 11](https://github.com/botuniverse/onebot-11) / [SnowLuma](https://snowluma.com)。纯只读、零依赖、333 行。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/DSH-0.2.x-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

现成的 QQ 插件几乎都是「工具型」：AI 想知道自己的群名片、是不是管理员、对面是谁，得**主动调一次工具**。多数时候它根本不会想到去调，于是群里被问「你是管理员吗」只能瞎猜。

这个插件反过来——**每轮对话开始前，身份已经在提示词里了**：

```
群聊 · 注入的是「她自己」
【你的群内身份】群「测试群」，42 人。你在群里的身份：测试名片（QQ 10001000），管理员，头衔「群管」

私聊 · 注入的是「对方」
【私聊对象】你自己是 测试机器人（QQ 10001000）。对方 QQ 20002000，你备注为「测试备注」，是你的好友
```

不发消息、不改群、不写文件。只有 5 个只读 action（`get_login_info` / `get_group_info` / `get_group_member_info` / `get_friend_list` / `get_stranger_info`）。

## 它解决什么

| 场景 | 没有本插件 | 有本插件 |
|---|---|---|
| 群里有人问「你是管理员吗」 | 靠猜，或调工具才发现 | 直接知道 |
| 群友给她改了个花名 | 一直以为自己是昵称 | 知道群名片与昵称是两回事 |
| 群里有几个熟人 | 只看到群号 | 知道群名、多少人 |
| 私聊里对方改了备注 | 只看到 QQ 号 | 知道备注是「测试备注」，是你的好友 |
| 陌生人加好友私聊 | 当成熟人对待 | 知道「不是你的好友」 |

身份是**每轮都成立的事实**，不该指望模型每次想起来去查。这就是本插件存在的理由。

## 安装

```bash
dsh plugin --profile web add github:ADBdad/dsh-qq-identity
```

装完重启一次引擎。插件没有任何设置页，全部走配置文件。

**前置条件**：已经有一个跑着的 OneBot 11 HTTP 服务端（SnowLuma / NapCat / go-cqhttp 等）。插件不读 QQ 密码，只跟协议端说话。

> 配置存在 `~/.dsh/qq-identity-config.json`，**不在插件目录里** —— 重装插件不会丢。

## 配置

文件路径：`~/.dsh/qq-identity-config.json`（首次启动自动生成一份默认配置，直接改即可）

```json
{
  "baseUrl": "http://127.0.0.1:3000",
  "accessToken": "",
  "timeoutMs": 6000,
  "ttlMs": 60000,
  "enableGroup": true,
  "enablePrivate": true,
  "groupPattern": "^group:(\\d+)$",
  "privatePattern": "^private:(\\d+)$",
  "sessionMapFile": "",
  "debug": false
}
```

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://127.0.0.1:3000` | OneBot HTTP 地址。DSH 与协议端同机时默认值即可 |
| `accessToken` | 空 | OneBot 的 `Authorization: Bearer` token；协议端没设就留空 |
| `timeoutMs` | `6000` | 单次查询超时（毫秒），范围 500–60000 |
| `ttlMs` | `60000` | 身份缓存时间。**设 `0` 表示每轮都现查**（不缓存） |
| `enableGroup` | `true` | 群聊注入开关 |
| `enablePrivate` | `true` | 私聊注入开关 |
| `groupPattern` | `^group:(\d+)$` | 会话 id → 群号。第一个捕获组是号码 |
| `privatePattern` | `^private:(\d+)$` | 会话 id → QQ 号。同上 |
| `sessionMapFile` | 空 | sessionId 反查表（见下节）。桥接直接用 `group:N` 时留空即可 |
| `debug` | `false` | 打开后每轮往 stdout 打一行调试日志 |

改完配置**下轮立即生效**，不用重启（按文件 mtime 检测）。

### `sessionMapFile` 是干什么的

DSH 给插件的 `agent.id` 是**内部 sessionId**（`session-11111111-…`），不是 `group:30003000`。两者要靠桥接落盘的映射表对上：

```json
{
  "sessions": {
    "group:30003000": "session-11111111-2222-3333-4444-555555555555",
    "private:20002000": "session-…"
  }
}
```

某些桥接会把这张表落在自己的 state 目录下，填进 `sessionMapFile` 即可：

```json
{ "sessionMapFile": "<桥接根目录>/state/sessions.json" }
```

> 如果你的桥接把会话 id 直接设成 `group:N` / `private:N`，留空就行，插件会走正则直连。
> **这一步没配对的表现是：插件跑着、日志没报错、但提示词里什么都没有。** 排查时先看这里。

## 工作原理

只做一件事：注册 `system-prompt/assemble` 这个异步 waterfall，每轮组装提示词时插一条 context。

```
一轮对话开始
   ↓
system-prompt/assemble（async waterfall）
   ↓  context.agent.id = session-xxx
   ↓  查 sessionMapFile → "group:30003000"
   ↓  正则 → 群号 30003000
   ↓
OneBot（并发发出，互不阻塞）:
  get_login_info                    → { user_id: 10001000, nickname: "测试机器人" }
  get_group_info(30003000)         → { group_name: "测试群", member_count: 42 }
  get_group_member_info(30003000, 10001000)
                                    → { card: "测试名片", role: "admin", title: "群管" }
   ↓
拼成 context { name: "qq-identity", text: "【你的群内身份】…", interpolate: false }
   ↓
进入提示词，模型直接读到
```

三个实现上的取舍，都踩过坑：

1. **用 async waterfall，不用 `systemPrompt.variable()`**。后者的 provider 是同步求值的，没法在里边 await OneBot 查询。waterfall 可以。
2. **context 标 `required: true`**。宿主或某个 preset 若设了 `includeRuntimeContext: false`（`dsh-persona` 支持这个开关），非 required 的 context 会被整批过滤掉，注入静默消失。
3. **只读 + 失败静默 + 并发**。任何一次查询失败都返回空串，绝不让「查身份」打断对话；群名与成员名片用 `Promise.all` 并发，首轮 3 次往返压成 1 轮，之后 `ttlMs` 内零请求。

## 兼容

| 项 | 支持 |
| --- | --- |
| DSH | 0.2.x |
| Node | ≥ 18（用原生 fetch） |
| OneBot 11 | SnowLuma、NapCat、go-cqhttp 等（需支持下面 5 个 action） |
| 平台 | Windows / Linux / macOS（无平台相关代码） |

依赖的 5 个只读 action：

- `get_login_info` —— 拿自己的 QQ 号和昵称
- `get_group_info` —— 群名 / 群人数
- `get_group_member_info` —— 群名片 / 角色 / 头衔
- `get_friend_list` —— 判断是否好友 + 拿备注
- `get_stranger_info` —— 拿陌生人昵称

> `get_group_info` 缺失时插件不报错，只是注入里没有群名和人数——其余照常。

会话 id 格式由桥接约定。默认按 `group:N` / `private:N` 解析，其它桥接改正则或填 `sessionMapFile` 即可。

## 测试

```bash
npm test              # 两个都跑
node test/smoke.mjs   # 身份解析（假 OneBot 服务，17 项）
node test/hook.mjs    # context 注册 + assemble 注入（18 项）
```

两个都不依赖外部服务，起假 OneBot 在随机端口上跑完就退。

## 排障

**提示词里没有身份**

按顺序查三件事：

1. `~/.dsh/qq-identity-config.json` 的 `debug` 改 `true`，看日志有没有 `[qq-identity] hook fired`
2. 有 hook 但 `identityText=(空)` —— 十有八九是 `sessionMapFile` 没配或路径不对
3. 连 hook 都没触发 —— 检查插件是否已启用（插件页），以及宿主是否根本不走 `system-prompt/assemble`

**日志里是 `401 unauthorized`**

`accessToken` 没填或填错。这个 token 是你的 OneBot 协议端启动时配置的那个，去协议端的配置文件或启动参数里找：

```bash
```

**日志里是 `fetch failed` / `ECONNREFUSED`**

`baseUrl` 不对，或协议端没起。先手工确认：

```bash
curl -s -X POST http://127.0.0.1:3000/get_login_info -H 'content-type: application/json' -d '{}'
```

**注入里没有群名 / 群人数**

协议端不支持 `get_group_info`，或该 action 报错。插件会静默跳过，其余字段照常注入。

**群名片对，但角色说「角色未知」**

协议端返回的 `role` 不是 `owner`/`admin`/`member` 三者之一。插件不会编造，如实写「角色未知」。

**私聊时什么都不注入**

对方既不在好友列表里、`get_stranger_info` 也拿不到昵称。这种情况插件选择不注入，而不是塞一句「好友状态未知」的废话。

## 边界

- **只读**。不写任何 QQ 数据，不发消息，不改名片，不操作群。
- **不做记忆**。它只回答「此刻的身份是什么」，不记录历史、不做画像。要记人的插件是另一个方向。
- **不替代工具**。想查群成员列表、历史消息、群荣誉这些，仍然需要工具型插件（如 `dsh-qq-tools`）。本插件只管身份。
- **不含设置页**。配置就一个 JSON 文件，改完即生效。
- **不注入群友名单**。群里几十上百人，每轮都塞进提示词是浪费 token 且易漂移。要知道「谁在群里」请用工具查。

## 体积

| 部分 | 行数 | 字节 |
| --- | --- | --- |
| `lib/` 四个文件 | 333 | 14 KB |
| 运行依赖 | **0** | — |
| 发布内容 | lib + patch + README + LICENSE | 24.6 KB |

## License

MIT
