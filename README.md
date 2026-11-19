# dsh-qq-identity

QQ 身份自动注入插件（DSH / OneBot 11 / SnowLuma）

## 它解决什么

现成的 QQ 插件都是「工具型」——AI 想直到群名片、自己是不是管理员时，得主动调一次 `qq_get_group_members`。本插件反过来：**每轮对话自动把身份注入提示词，AI 无需调用任何工具就知道**。

注入两类：

- **群聊**：她在群里的名片、是不是群主/管理员、头衔。
- **私聊**：对方昵称、你给对方的备注、是不是好友。

纯只读 + 纯注入，不发消息、不改群、零新增依赖。

## 安装

```bash
dsh plugin --profile web add github:ADBdad/dsh-qq-identity
```

装完在插件页启用 `QQ 身份注入` 组件即可。

## 配置

配置文件：`~/.dsh/qq-identity-config.json`（首次启动自动生成，不在插件目录，pnpm 重装不会丢）。

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
  "ownerQQ": "",
  "sessionMapFile": "",
  "debug": false
}
```

- `baseUrl` / `accessToken`：SnowLuma（或任意 OneBot 11 HTTP 实现）地址与 token。DSH 与 SnowLuma 同一台机时默认 `http://127.0.0.1:3000` 即可，token 留空。
- `ttlMs`：身份缓存时间，默认 60 秒。设 0 则每轮都查。
- `enableGroup` / `enablePrivate`：分别开关群聊/私聊注入。
- `groupPattern` / `privatePattern`：会话 id 到群号/QQ 号的正则，**第一个捕获组是号码**。默认匹配 `group:群号` / `private:QQ号` 这种格式。如果用别的桥接，改这里。
- `sessionMapFile`：把 DSH 内部 sessionId（`session-xxx`）反查成 `group:N`/`private:N` 的映射文件（某些桥接落在自己的 state 目录下）。如果你的桥接直接把会话 id 设成 `group:N`/`private:N`，留空即可；否则填上映射文件路径。
- `debug`：调试日志开关，默认 `false`。

改完配置下轮生效，无需重启（配置有 mtime 缓存检测）。

## 工作原理

注册 `system-prompt/assemble` 这个 async waterfall hook。每轮 assemble 时：

1. 从 `context.agent.id` 拿到会话 id；
2. 若它是 DSH 内部 `session-xxx` 而非 `group:N`/`private:N`，先查 `sessionMapFile` 反查出 QQ 会话 key；
3. 用正则解析出群号或 QQ 号；
4. 查 OneBot：`get_login_info` + `get_group_member_info`（群）/ `get_friend_list` + `get_stranger_info`（私聊）；
5. 拼成一条 `interpolate:false` 的 context 注入（`qq-identity`），并带 TTL 缓存。

查不到身份时静默返回空串，绝不打断对话。

## 兼容

- DSH 0.2.x / Node >= 18
- OneBot 11 标准 HTTP 接口：SnowLuma、NapCat、go-cqhttp 等（需支持上表 5 个 action）
- 会话 id 由桥接约定，默认按 `group:N` / `private:N` 解析；其它格式通过正则或 sessionMapFile 适配

## 测试

```bash
node test/smoke.mjs   # OneBot 身份解析（假服务）
node test/hook.mjs    # assemble hook 注入逻辑
```

## License

MIT
