# SubRules

自维护的 Sub-Store 多平台规则模板。

## 文件

- `rules/substore.js`：Sub-Store 文件脚本
- `rules/mihomo.yaml`：Mihomo 规则模板
- `rules/sing-box.json`：sing-box 规则模板
- `rules/shadowrocket.conf`：Shadowrocket 规则配置
- `rules/test-substore.js`：脚本行为测试

## 工作方式

节点由 Sub-Store 文件界面中选中的订阅或组合生成，规则由本仓库维护。脚本不需要 Script Operator 参数，只读取请求中的四个精确 `target`：

```text
target=clash
target=singbox
target=shadowrocket
target=shadowrocket-rules
```

- Clash/Mihomo：拉取模板，注入 ClashMeta 节点并填充手动、自动、故障转移和地区策略组。
- sing-box：拉取模板，注入 sing-box outbounds 并填充对应出站组。
- Shadowrocket 节点：使用 Sub-Store 原生 Shadowrocket 节点对象，保留 Reality 和 Hysteria2 参数，只输出 `proxies` 节点订阅。
- Shadowrocket 规则：返回独立的 `[General]`、`[Proxy Group]`、`[Rule]` 远程配置。

## Sub-Store 设置

1. 创建一个 `mihomoConfig` 文件。
2. 在文件来源中选择现有订阅或组合；脚本会直接读取 `$file.sourceType` 和 `$file.sourceName`。
3. 添加 Script Operator，使用脚本链接：

```text
https://raw.githubusercontent.com/gagapony/SubRules/main/rules/substore.js
```

4. Script Operator 参数保持为空。

## 订阅入口

订阅不再公开直链。访问 `https://nodesub.528777.xyz/`，用 Element（Matrix）账号登录后领取自己的订阅链接：

```text
https://nodesub.528777.xyz/<token>?target=clash
https://nodesub.528777.xyz/<token>?target=singbox
https://nodesub.528777.xyz/<token>?target=shadowrocket
https://nodesub.528777.xyz/<token>?target=shadowrocket-rules
```

- 部署：本机 `NodeSub`（`docker compose up -d`），clover 反代 `nodesub.528777.xyz → http://127.0.0.1:16610`，复用泛域名证书。
- 登录：向本地 conduit（`/_matrix/client/v3/login`）校验，**密码不保存**；校验完立即 logout，不在 Element 里留设备。
- token：`HMAC-SHA256(user_id, TOKEN_SECRET)`，与密码无关，长期有效；轮换 `NodeSub/.env` 里的 `TOKEN_SECRET` 即可全部作废。
- 失败节流：同一 IP 10 分钟内 5 次错误后冷却。
- 上游：`Sub-Store 后端路径 /share/file/Subscription`，输出与旧 Worker 逐字节一致。
- 未做：Matrix 房间成员校验（入群=开通）。目前任何能登录本机 conduit 的账号都可以领取。

Shadowrocket 中分别导入：

1. `target=shadowrocket` 从普通节点“订阅”入口添加。
2. `target=shadowrocket-rules` 从“配置文件”入口下载并选为当前配置。

不要把真实 token、`TOKEN_SECRET`、上游订阅地址或生成后的节点配置提交到仓库。

## 故障兜底

### Clash / Mihomo 与 Shadowrocket

| 组 | 结构 |
|---|---|
| 选择代理 | `select [自动选择, 手动选择]` |
| 自动选择 | `url-test`：全部节点，测速间隔 300 秒、容差 100 ms |
| 手动选择 | `select`：全部节点，手动指定，不自带兜底 |
| 故障转移 | `fallback`：全部节点，按订阅顺序选第一个可用节点 |
| 香港 / 日本 / 美国 / 德国线路 | `select`：本地区节点，手动指定 |
| 香港 / 日本 / 美国 / 德国节点 | `fallback [本区线路, 故障转移]`：优先本区手选出口，失效后用共享备用 |

例如 `Telegram → 德国节点 → 德国线路`，在德国线路里选节点。外层检测该出口失败后切到故障转移；检测恢复后优先回到德国线路。外层使用 `fallback` 而非 `url-test`，不会因为备用节点更快就主动换区。

- 地区外层与共享备用检测间隔 30 秒、超时 3 秒；Mihomo 显式设置 `lazy: false`。检测和切换需要时间，不保证 30 秒内完成，也不会无缝迁移已有连接。
- 应用组不再重复列出 `手动选择`；全局手选通过 `选择代理 → 手动选择` 进入。这里选死节点不会自动兜底，需要地区优先兜底时应选 `地区节点`。
- AI、Telegram、Spotify、Truth Social 默认使用 `选择代理`；哔哩哔哩、新浪微博等保留直连默认。
- 2026-10-30 起模板整体与手机验证过的临时配置同步：DNS（fake-ip、IPv6 关闭、prefer-h3）、s­niffer、TUN（默认关闭）、38 条规则与 12 个规则集（仅 jsdelivr / skk.moe 源）、GLOBAL 组随仓库模板下发；另加回 `unified-delay` 与 `tcp-concurrent`，策略组不带图标。sing-box 与 Shadowrocket 原生配置不包含该基线，另行维护。
- `故障转移` 只放裸节点，不反向引用地区组，避免循环依赖。
- Sub-Store 在某地区没有匹配节点时仍使用全部节点填充该地区叶子组，避免空组；此时地区名不保证实际出口地区。Shadowrocket 原生配置使用正则动态匹配，不做这一补齐，请检查订阅节点名称与地区匹配情况。

### sing-box 的差异

官方 sing-box 没有与 Mihomo 等价的顺序优先 `fallback` 出站。本次仅同步入口整理：`选择代理` 保留自动/手动，应用组删除重复手动入口。

- 保留原地区选路：香港、日本、德国为 `urltest`，美国为 `selector`；应用默认选择不变。
- 保留的 `故障转移` 组实际类型仍是 `urltest`，不是顺序优先兜底，也没有接入地区组。**不承诺地区失效后自动跨区兜底。**
- 全局自动、手动和备用池仍填全部节点，地区池按名称匹配；缺地区时沿用全部节点补齐。
- 为兼容新内核，显式设置 `route.default_domain_resolver: local`，沿用现有本地 DNS。

### 更新方式

同时刷新 Sub-Store 的 **Script Operator 脚本**和模板，再更新客户端订阅；旧脚本可能把新分组填错或留空。客户端若记住旧选择，请检查 `选择代理`、地区节点/线路及应用组的当前选项。

Shadowrocket 使用独立配置时，节点订阅和 `target=shadowrocket-rules` 配置都要更新；一键 Clash 导入入口使用的是 Mihomo 模板。

## 一键导入页

导入页由 `NodeSub` 提供（`https://nodesub.528777.xyz/`），不再用 GitHub Pages：页面本身不含任何令牌，登录后由服务端签发。

- Clash / Mihomo / Shadowrocket：`clash://install-config?url=`，一键导入节点 + 分组 + 规则（小火箭兼容 clash:// 链接，已真机验证）
- sing-box：`sing-box://import-remote-profile?url=`

## 测试

需要 Node.js（支持 `structuredClone`）、Python 3 与 PyYAML；Python 仅供测试读取实际 YAML 模板，Sub-Store 运行不依赖它。

```bash
node rules/test-substore.js
git diff --check
```

测试读取真实三端模板，检查组填充、重复/冲突名称、无匹配地区、重复手动入口、默认值、规则引用及循环依赖。模板中的空节点池需经过 Sub-Store 注入后才能交给内核校验。

本次使用无凭据示例节点生成完整配置，通过 Mihomo v1.19.33 与 sing-box v1.14.4 的配置校验。Clash-Client 的临时分组版本已由用户验收；仓库保留自己的规则集，未照搬临时配置的规则和 DNS。Shadowrocket 原生配置仅做静态检查，仍需真机验证，配置校验通过不等于实际线路连通。
