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

## 故障兜底

每个根策略组都带一层兜底，结构只有两种：

| 组 | 结构 |
|---|---|
| 香港 / 日本 / 美国 / 德国节点 | `本地区自动 → 故障转移` |
| 手动选择 | `手选节点 → 故障转移` |

- 本地区自动（`香港自动` 等）按地区正则填入本地区节点，用 url-test 选最快可用的。
- 手选节点是实际选节点的入口；业务组继续选“手动选择”即可享受兜底。
- 兜底一律指向已有的“故障转移”（fallback，全部节点中取第一个可用的），不新增层级。
- 某地区没有任何匹配节点时，本地区自动填入全部节点，避免空组。
- 业务分流规则、默认选项（AI 与 Telegram 默认美国、Spotify 默认 DIRECT）均未改动。
- 自动兜底组都不含 DIRECT，全部候选不可用时不自动直连。

实测注意：地区自动组全部测速失败时会直接落到“故障转移”，可能选到较远地区的节点，这是兜底生效的正常结果。

## 一键导入页

`docs/index.html` 是静态导入页，用 GitHub Pages 托管（Settings → Pages → Deploy from a branch → `main` → `/docs`），地址为 `https://gagapony.github.io/SubRules/`。页面通过客户端 URL scheme 一键导入：

- Clash / Mihomo / Shadowrocket：`clash://install-config?url=`，同一订阅地址，一键导入节点 + 分组 + 规则（小火箭兼容 clash:// 链接，已真机验证）
- sing-box：`sing-box://import-remote-profile?url=`

## 测试

```bash
node rules/test-substore.js
```
