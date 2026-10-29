# SubRules

自维护的 Sub-Store 多平台规则模板。

## 文件

- `rules/substore.js`：Sub-Store 文件脚本
- `rules/mihomo.yaml`：Mihomo 规则模板
- `rules/sing-box.json`：sing-box 规则模板
- `rules/test-substore.js`：脚本行为测试

## 工作方式

节点由 Sub-Store 文件界面中选中的订阅或组合生成，规则由本仓库维护。脚本不需要 Script Operator 参数，只读取请求中的三个精确 `target`：

```text
target=clash
target=singbox
target=shadowrocket
```

- Clash/Mihomo：拉取模板，注入 ClashMeta 节点并填充手动、自动、故障转移和地区策略组。
- sing-box：拉取模板，注入 sing-box outbounds 并填充对应出站组。
- Shadowrocket：使用 Sub-Store 原生 Shadowrocket 节点对象，保留 Reality 和 Hysteria2 参数，并输出包含 `proxies`、`proxy-groups`、`rules` 的 Clash YAML 节点订阅。

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
```

使用 Worker 时对应为：

```text
https://getsub.528777.xyz/gagapony?target=clash
https://getsub.528777.xyz/gagapony?target=singbox
https://getsub.528777.xyz/gagapony?target=shadowrocket
```

Shadowrocket 输出是客户端原生支持的 Clash YAML，可从普通节点订阅入口导入节点和代理组。

不要把真实 token、上游订阅地址或生成后的节点配置提交到仓库。

## 测试

```bash
node rules/test-substore.js
```
