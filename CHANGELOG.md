# Changelog

本文件记录用户可见的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.0] - 2026-11-19

首个公开版本。

### 新增

- 群聊注入：自己的群名片、角色（群主/管理员/普通成员）、头衔，以及所在群名与人数
- 私聊注入：对方 QQ、备注名或昵称、是否好友，以及自己的昵称与 QQ
- `sessionMapFile`：把 DSH 内部 `sessionId` 反查回 `group:N` / `private:N`
- 配置热加载（按文件 mtime 检测，改完下一轮生效）
- `debug` 开关，每轮往 stdout 打一行注入结果

### 修复

在开发过程中修掉的、会影响正确性的问题：

- **注入可能被静默过滤**：宿主或某个 preset 若设了 `includeRuntimeContext: false`（如 `@deepseek-ai/dsh-persona` 支持该开关），非 `required` 的 context 会被整批丢弃，注入无声消失。改为同时注册 `required: true` 的 context。
- **`ttlMs: 0` 反而永远命中缓存**：原实现先查缓存命中再判断 TTL，导致「关闭缓存」配置失效。改为 TTL 非正数时直接不查缓存。
- **空结果被缓存**：一次网络抖动会让身份空满一个 TTL 周期。改为空结果不入缓存，下轮重试。
- **角色被编造**：查不到角色时原实现输出「普通成员」。改为如实写「角色未知」；私聊在既非好友、昵称也查不到时不注入，而非塞一句「好友状态未知」。
- **`lastText` 无上界**：长跑的桥接会不断新建会话，缓存无限增长。加容量闸（最多 200 个会话）。

### 已知限制

- 不注入群友名单（每轮塞几十上百人是浪费 token 且易漂移）
- 不改 QQ 侧任何数据，也不发消息
- 没有设置页，全部走 JSON 配置文件
