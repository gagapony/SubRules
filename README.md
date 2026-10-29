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

## 文件分享链接

```text
/share/file/Subscription?token=YOUR_FILE_TOKEN&target=clash
/share/file/Subscription?token=YOUR_FILE_TOKEN&target=singbox
/share/file/Subscription?token=YOUR_FILE_TOKEN&target=shadowrocket
/share/file/Subscription?token=YOUR_FILE_TOKEN&target=shadowrocket-rules
```

使用 Worker 时对应为：

```text
https://getsub.528777.xyz/gagapony?target=clash
https://getsub.528777.xyz/gagapony?target=singbox
https://getsub.528777.xyz/gagapony?target=shadowrocket
https://getsub.528777.xyz/gagapony?target=shadowrocket-rules
```

Shadowrocket 中分别导入：

1. `target=shadowrocket` 从普通节点“订阅”入口添加。
2. `target=shadowrocket-rules` 从“配置文件”入口下载并选为当前配置。

不要把真实 token、上游订阅地址或生成后的节点配置提交到仓库。

## Shadowrocket 故障兜底

- 只调整根策略组；AI、Telegram、Spotify 等业务组以及“选择代理”、Final 的选项、默认值和分流规则保持原样。
- 香港、日本、美国、德国地区入口：`本地区自动 → 故障转移`。地区内部使用 URL 测速，全局故障转移直接筛选订阅节点，不反向引用业务组。
- 手动选择：`手选节点 → 故障转移`。在新增的“手选节点”入口指定实际节点；业务组继续选择“手动选择”，即可在该节点不可用时兜底。
- 自动选择：直接在全部候选节点中测速选择；故障转移：直接在全部候选节点中按顺序选可用节点。两者不互相引用，全部候选不可用时也没有额外可用节点可兜底。
- AI 和 Telegram 默认仍选择“美国节点”，美国不可用后可进入全地区兜底池，不再单独限制为美国、日本、德国；不保证 AI 解锁。
- Spotify 默认仍为 DIRECT。业务组明确选择 DIRECT 时不经过代理兜底；国内直连及广告拦截不变。所有自动故障切换组均不包含 DIRECT。
- 仅修改 Shadowrocket；Mihomo、sing-box 模板不受影响。

更新远程配置后需重新启用它（仅更新节点订阅不够），并检查旧的手动选择是否仍被客户端保留。配置发布到 GitHub 后，远程导入才能取得新版。

健康检查使用 `https://cp.cloudflare.com`，间隔 60 秒、超时 5 秒；它检查一般连通性，不保证目标服务可访问，也不保证失败请求自动重试。跨区会改变出口 IP，可能影响登录及地区解锁。全部候选不可用时不配置自动直连兜底。

静态测试不执行 Shadowrocket 内核。上线前在设备上验证：首选节点超时、地区全部超时、地区无匹配节点、全部候选超时及节点恢复；确认嵌套组能切换，空组不会意外直连，手选节点不可用时能够兜底。

## 一键导入页

`docs/index.html` 是静态导入页，用 GitHub Pages 托管（Settings → Pages → Deploy from a branch → `main` → `/docs`），地址为 `https://gagapony.github.io/SubRules/`。页面通过客户端 URL scheme 一键导入：

- Clash / Mihomo / Shadowrocket：`clash://install-config?url=`，同一订阅地址，一键导入节点 + 分组 + 规则（小火箭兼容 clash:// 链接，已真机验证）
- sing-box：`sing-box://import-remote-profile?url=`

## 测试

```bash
node rules/test-substore.js
node rules/test-shadowrocket.js
```
