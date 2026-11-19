<div align="center">

# dsh-qq-identity

**让 QQ 里的 AI 知道「我是谁、对面是谁」——不用调工具，每轮开口前身份已经在提示词里了。**

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![dsh](https://img.shields.io/badge/DSH-0.2.x-blueviolet.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#开发)

</div>

> [!IMPORTANT]
> **这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件，不是独立应用，也不是 QQ 桥接。**
>
> - 它**不收发消息**。收发消息是 QQ 桥接插件的事，本插件只在「某轮对话已经要开始了」时补一条身份事实。
> - 它**不碰 QQ 协议**，不读你的 QQ 密码，只对一个已经跑着的 [OneBot 11](https://github.com/botuniverse/onebot-11) HTTP 服务端发只读查询。
> - 装它的前提：DSH 已装好，协议端（SnowLuma / NapCat 等）已跑起来并登录了机器人号，桥接插件已经能把 QQ 消息送进 DSH。缺任何一环，这个插件都无从下手。

---

## 目录

- [它解决什么](#它解决什么)
- [注入之后长什么样](#注入之后长什么样)
- [快速开始](#快速开始)
- [配置](#配置)
- [`sessionMapFile`：最容易踩的坑](#sessionmapfile最容易踩的坑)
- [工作原理](#工作原理)
- [它依赖什么](#它依赖什么)
- [排障](#排障)
- [边界](#边界)
- [兼容](#兼容)
- [开发](#开发)
- [相关项目](#相关项目)
- [更新记录](CHANGELOG.md)

---

## 它解决什么

现成的 QQ 插件几乎都是「工具型」：AI 想知道自己的群名片、是不是管理员、对面是谁，得**主动调一次工具**。

问题在于它常常想不起来调。群里有人问「你是管理员吗」，它要么沉默，要么瞎猜，要么真去调一次——而这本来就是一句「是/不是」的事。

身份不是一条待查询的信息，是**每轮都成立的前提**。这个插件就干这一件事：把前提放进提示词。

| 场景 | 没有本插件 | 有本插件 |
|---|---|---|
| 群里有人问「你是管理员吗」 | 靠猜，或临时调工具才发现 | 一直知道自己的角色 |
| 群友给机器人起了个群名片 | 以为群名片就是昵称，或者说不出自己叫什么 | 知道群名片与昵称是两回事 |
| 需要判断群规模 | 只知道群号 | 知道群名和人数 |
| 私聊里对方设了备注 | 只看到一个 QQ 号 | 知道备注名，知道是不是好友 |
| 陌生人发起私聊 | 当成熟人对待 | 知道「不是你的好友」 |
| 群里几十人的名字 | 每轮塞名单，烧 token 还容易记串 | 不塞，要知道谁在群里请用工具查 |

## 注入之后长什么样

插件不显示任何界面。它做的事是往提示词的 runtime context 里插一段文本，长这样（下面是**格式示意**，尖括号是占位）：

```
群聊 · 注入的是「她自己」

【你的群内身份】群「<群名>」，<人数> 人。你在群里的身份：<群名片>（QQ <自己的QQ>），<群主|管理员|普通成员>[，头衔「<头衔>」]


私聊 · 注入的是「对方」

【私聊对象】你自己是 <自己的昵称>（QQ <自己的QQ>）。对方 QQ <对方QQ>，<你备注为「<备注>」|昵称「<昵称>」>，<是你的好友|不是你的好友>
```

规则很简单，就三条：

- **拿不到的字段整段省略** —— 协议端不支持某个 action，那几段字直接消失，不占位、不凑字数。
- **拿得到但取值不在预期内，如实说「角色未知」** —— 不硬猜成「普通成员」。编造一个看起来合理的身份，比不注入更糟。
- **查不到任何人时干脆不注入** —— 私聊对象既不在好友列表、也拿不到昵称，插件返回空串，而不是塞一句「好友状态未知」的废话。

群聊只注入「她自己」，私聊只注入「对方」。两个方向刻意不混，也不会把别处会话的内容带进来。

## 快速开始

### 1. 装

最省事的一条：**把这个仓库地址贴给你自己的 DSH，说「帮我装这个插件」**。

或者命令行（`--profile` 填你跑 QQ 桥接的那个，桌面端一般 `desktop`，网页端 `web`）：

```bash
dsh plugin --profile web add github:ADBdad/dsh-qq-identity
```

装完**重启一次 DSH**。

> `github:` 这种写法会让包管理器去 clone 仓库，所以那台机器得装了 `git`。没有的话改用 tarball 直链：
>
> ```bash
> dsh plugin --profile web add https://codeload.github.com/ADBdad/dsh-qq-identity/tar.gz/refs/heads/main
> ```

### 2. 配协议端地址

首次启动会自动生成 `~/.dsh/qq-identity-config.json`。**如果你的协议端就在本机 3000 端口且没设 token，这一步什么都不用做。**

不是的话改两行：

```json
{
  "baseUrl": "http://127.0.0.1:3000",
  "accessToken": "<协议端启动时配的那个 token>"
}
```

改完**下轮立即生效，不用重启**（按文件 mtime 检测）。

### 3. 确认真的生效了

按顺序试，任一条通了就算好了：

1. **最直接**：在 QQ 里私聊机器人，问「你知道我是谁吗？你的备注叫什么？」。答得上备注或 QQ 号，就是生效了。
2. **看日志**：配置里把 `debug` 改成 `true`，然后发一条消息，日志里会出现
   ```
   [qq-identity] hook fired, agent=session-...
   [qq-identity] identityText=【私聊对象】...
   ```
3. **什么都没发生**：见 [排障](#排障)。最常见的原因是 `sessionMapFile` 没配对。

> ⚠️ 注意：用桥接自己的「发测试消息」接口发出去的，是**机器人自己发的消息**，一般不会触发一轮新对话——别用它验收，用另一个号私聊或群里 @ 一下机器人。

### 4. 升级 / 卸载

```bash
# 升级（先卸再装，避免拿到缓存里的旧副本）
dsh plugin --profile web remove dsh-qq-identity
dsh plugin --profile web add github:ADBdad/dsh-qq-identity

# 卸载
dsh plugin --profile web remove dsh-qq-identity
```

**设置不会丢。** 配置存在 `~/.dsh/qq-identity-config.json`，不在插件目录里；卸载只删代码。

## 配置

文件：`~/.dsh/qq-identity-config.json`

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

没有设置页。配置就一个 JSON，改完即生效——这是刻意的，本插件只有 10 个键，做一个页面反而更麻烦。

## `sessionMapFile`：最容易踩的坑

**这是本插件唯一一个「配错了不报错、只是静默不工作」的地方。** 症状是：插件跑着、日志干干净净、但提示词里一个字都没有。

原因在 `agent.id`。DSH 交给插件的 `agent.id` 是**内部 sessionId**（形如 `session-<uuid>`），不是 `group:<群号>`。两者要靠桥接落盘的映射表对上：

```json
{
  "sessions": {
    "group:<群号>": "session-<uuid>",
    "private:<QQ号>": "session-<uuid>"
  }
}
```

把这张表的路径填进 `sessionMapFile`：

```json
{ "sessionMapFile": "<桥接根目录>/state/sessions.json" }
```

如果你用的桥接把会话 id 直接设成 `group:N` / `private:N`，留空就行——插件会走正则直连，完全不读这张表。

> 排障顺序：先看 `debug` 有没有打出 `hook fired`。有 hook 但 `identityText=(空)`，八成就是这里。

## 工作原理

只做一件事：注册 `system-prompt/assemble` 这个异步 waterfall，每轮组装提示词时插一条 context。

```
一轮对话开始
   ↓
system-prompt/assemble（async waterfall）
   ↓  context.agent.id = session-<uuid>
   ↓  查 sessionMapFile → "group:<群号>"
   ↓  正则 → 群号
   ↓
OneBot（并发发出，互不阻塞）:
  get_login_info                        → { user_id, nickname }
  get_group_info(<群号>)                 → { group_name, member_count }
  get_group_member_info(<群号>, <自己>)   → { card, role, title }
   ↓
拼成 context { name: "qq-identity", text: "【你的群内身份】…", interpolate: false }
   ↓
进入提示词，模型直接读到
```

三个实现上的取舍，都是踩过坑才定的：

1. **用 async waterfall，不用 `systemPrompt.variable()`。** 后者的 provider 是同步求值的，没法在里边 await OneBot 查询。
2. **context 标 `required: true`。** 宿主或某个 preset 若设了 `includeRuntimeContext: false`（`dsh-persona` 支持这个开关），非 required 的 context 会被整批过滤掉，注入静默消失。
3. **只读 + 失败静默 + 并发。** 任何一次查询失败都返回空串，绝不让「查身份」打断对话；群名与成员名片用 `Promise.all` 并发，首轮三次往返压成一轮，之后 `ttlMs` 内零请求。

## 它依赖什么

插件本身**不碰 QQ 协议**，只会说 OneBot 11 的 HTTP。所以你需要在某处跑一个「QQ 接口」程序，让插件通过 `http://127.0.0.1:3000` 跟它说话。

| 协议端 | 说明 |
|---|---|
| [**SnowLuma**](https://github.com/SnowLuma/SnowLuma) | 实测过，本插件的开发环境就是它 |
| [**NapCat**](https://github.com/NapNeko/NapCatQQ) | 同族接口，理论上通用；自带网页后台扫码登录，比手配省事 |
| [go-cqhttp](https://github.com/Mrs4s/go-cqhttp) / Lagrange 等 | 只要支持下面 5 个 action 就能用 |

**插件实际用到的接口**（换协议端时照这个核对）：

```
get_login_info              自己的 QQ 号和昵称
get_group_info              群名 / 群人数
get_group_member_info       群名片 / 角色 / 头衔
get_friend_list             判断是否好友 + 拿备注
get_stranger_info           拿陌生人昵称
```

全部是**只读**。一个写操作都没有，也不发消息。

> 只走 **HTTP**，不走 WebSocket。协议端开了 WS 但没开 HTTP 的话，插件连不上。

## 排障

先看这张表，再往下翻细节：

| 现象 | 最可能的原因 | 怎么办 |
|---|---|---|
| 提示词里没有任何身份 | `sessionMapFile` 没配 / 路径不对 | 见 [上面那节](#sessionmapfile最容易踩的坑) |
| 日志里 `401 unauthorized` | `accessToken` 空或错 | 填协议端的 token |
| 日志里 `fetch failed` / `ECONNREFUSED` | `baseUrl` 不对，或协议端没起 | 先用 curl 手工确认 |
| 群名片对，但角色说「角色未知」 | 协议端返回的 `role` 不是那三个值 | 正常行为，插件不编造 |
| 私聊时什么都不注入 | 对方既不在好友列表、也拿不到昵称 | 正常行为，不塞废话 |
| 注入了，但好像没进模型上下文 | 有 preset 设了 `includeRuntimeContext: false` 却没走 `required` | 见「工作原理」第 2 条，本插件已按 `required: true` 加固 |

<details>
<summary><b>手工确认协议端通不通</b></summary>

```bash
curl -s -X POST http://127.0.0.1:3000/get_login_info \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <你的token>' \
  -d '{}'
```

返回 `{"status":"ok","data":{"user_id":...,"nickname":"..."}}` 就是通的。返回 `401` 是 token 问题；连不上是地址或协议端没起。
</details>

<details>
<summary><b>为什么我用桥接的「发测试消息」验收，什么都没发生？</b></summary>

因为那条消息是**机器人自己发的**。多数桥接会把自己的消息当作回显忽略掉，不会开新一轮对话，自然也不会走 `system-prompt/assemble`。

用另一个号私聊机器人，或者在群里 @ 一下，才会真正跑一轮。
</details>

<details>
<summary><b>群里几十上百人，为什么不把名单也注入进去？</b></summary>

浪费 token，而且人一多模型必然记串。身份是「我是谁、对面是谁」，成员名单是「谁在群里」——后者该用工具按需查，而且大多数时候根本不需要查。
</details>

<details>
<summary><b>会不会拖慢对话？</b></summary>

首轮最多 3 次 OneBot 查询，但**只走 2 个串行往返**：群聊先取自己的 QQ（`get_login_info`），再并发取群信息和成员名片；私聊先并发取好友列表和自己的信息，再取陌生人昵称。之后 `ttlMs`（默认 60 秒）内完全不查。

任何一次查询失败都静默跳过，最坏情况是这段身份文本变短，不会卡住对话。
</details>

<details>
<summary><b>和 dsh-qq-tools 这类工具型插件冲突吗？</b></summary>

不冲突，方向不同。工具型插件给模型「能查什么」，本插件让模型「不用查就知道」。两个一起装是互补的。
</details>

## 边界

- **只读**。不写任何 QQ 数据，不发消息，不改名片，不操作群。五个 action 全是 `get_*`。
- **不做记忆**。它只回答「此刻的身份是什么」，不记录历史、不做画像。
- **不替代工具**。想查群成员列表、历史消息、群荣誉这些，仍然需要工具型插件。
- **不注入群友名单**。理由见上面 FAQ。
- **不含设置页**。配置就一个 JSON 文件，改完即生效。
- **不收集任何数据**。除上述 5 个只读查询外不产生任何网络请求，不上报、不写日志文件。

## 兼容

| 项 | 支持 |
| --- | --- |
| DSH | 0.2.x（开发与实测环境 0.2.2） |
| Node | ≥ 18（用原生 fetch） |
| OneBot 11 | SnowLuma（实测）、NapCat、go-cqhttp、Lagrange 等 |
| 平台 | Windows / Linux / macOS（无平台相关代码） |

会话 id 格式由桥接约定。默认按 `group:N` / `private:N` 解析，其它格式改正则或填 `sessionMapFile` 即可。

> 这里不把 DSH 版本钉死到小版本号——钉了过两天就对不上。真遇到新版不适配，提 issue。

## 开发

纯 ESM，零依赖，没有构建步骤。

```bash
git clone https://github.com/ADBdad/dsh-qq-identity.git
cd dsh-qq-identity
npm test              # 两个都跑

node test/smoke.mjs   # 身份解析（起假 OneBot 服务）
node test/hook.mjs    # context 注册 + assemble 注入
```

两个测试都不依赖外部服务：自己起一个假 OneBot 在随机端口上，跑完就退。

```
lib/config.js     (~76 行)  配置读写：原子写、缺键补默认值、按 mtime 热读
lib/onebot.js     (~35 行)  OneBot HTTP 客户端：一个函数，带 token / 超时 / {status,retcode,data} 拆包
lib/identity.js   (~172 行) 身份解析：sessionId → 会话 key → 群号/QQ号 → 注入文本
lib/index.js      (~52 行)  插件入口：注册 context + assemble waterfall

cordis.patch.yml  插件挂载声明
test/             上面两个测试
```

改动前建议先看 `lib/index.js` 顶部那两个常量（`CONTEXT_NAME` / `CONTEXT_ORDER`），注入顺序和去重都靠它们。

## 相关项目

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — 上游 agent 平台
- [OneBot 11](https://github.com/botuniverse/onebot-11) — 本插件唯一说话的协议
- [SnowLuma](https://github.com/SnowLuma/SnowLuma) — 实测用的 QQ 协议端
- 工具型 QQ 插件（查群成员 / 历史消息 / 群荣誉）—— 和本插件互补，不冲突
- QQ 桥接类插件（负责把 QQ 消息送进 DSH 并把回复发出去）—— 本插件的前提，不是替代品

## 更新记录

见 [CHANGELOG.md](CHANGELOG.md)。

## License

[MIT](LICENSE)
