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

- Clash/Mihomo：拉取模板，注入 ClashMeta 节点并填充手动、自动和地区策略组。
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

443 报 `TLS handshake timeout`（常见于国内移动网络对 443/SNI 的干扰）时，换备用入口 `:8443`，路径与 token 不变：

```text
https://nodesub.528777.xyz:8443/<token>?target=clash
```

- 部署：本机 `NodeSub`（`docker compose up -d`），clover 反代 `nodesub.528777.xyz → http://127.0.0.1:16610`，复用泛域名证书。备用入口是 `Clover/data/config.yaml` 里另一条 `reverse_proxy`（`listen: :8443`，同一泛域名证书），改完 `docker restart clover`。
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
| 香港 / 日本 / 美国 / 德国节点 | `url-test`：仅本地区节点，300 秒间隔、容差 100 ms，不跨区兜底 |

例如 `Netflix → 德国节点`，只在德国节点之间自动选最快的一台。德国节点全部失效时该应用直接连不上，不会偷偷切到香港等不支持解锁的地区——这正是要的行为。

- 地区组是 `url-test` 而不是 `fallback`：不需要“备用区”，只在区内换节点，且容差 100 ms 避免来回抖动。
- 不再有 `地区线路` 和共享 `故障转移` 组（2026-10-30 起移除）；要手动指定单台节点，用 `选择代理 → 手动选择`。
- 2026-10-30 起模板整体与手机验证过的临时配置同步：DNS（fake-ip、IPv6 关闭、prefer-h3）、s­niffer、TUN（默认关闭，`stack: gvisor`；旧模板的 `mips` 不是合法值，会导致 `invalid tun stack`）、38 条规则与 12 个规则集（仅 jsdelivr / skk.moe 源）、GLOBAL 组随仓库模板下发；另加回 `unified-delay` 与 `tcp-concurrent`，策略组不带图标。sing-box 与 Shadowrocket 原生配置不包含该基线，另行维护。
- Sub-Store 在某地区没有匹配节点时仍使用全部节点填充该地区组，避免空组；此时地区名不保证实际出口地区。Shadowrocket 原生配置使用正则动态匹配，不做这一补齐，请检查订阅节点名称与地区匹配情况。

### sing-box 的差异

官方 sing-box 没有与 Mihomo 等价的顺序优先 `fallback` 出站。本次同步为地区组统一 `urltest`：

- 香港、日本、美国、德国都是 `urltest`，只在区内选，不跨区兜底；原先美国组的 `selector` 已改为 `urltest`。
- 共享 `故障转移` 组已删除。**不提供地区失效后的自动跨区兜底。**
- 全局自动、手动池仍填全部节点，地区池按名称匹配；缺地区时沿用全部节点补齐。
- 为兼容新内核，显式设置 `route.default_domain_resolver: local`，沿用现有本地 DNS。

### 更新方式

同时刷新 Sub-Store 的 **Script Operator 脚本**和模板，再更新客户端订阅；旧脚本可能把新分组填错或留空。客户端若记住旧选择，请检查 `选择代理`、`地区节点` 及应用组的当前选项。

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
