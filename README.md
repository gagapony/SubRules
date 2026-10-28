# SubRules

自维护的 Sub-Store 多平台规则模板。

## 文件

- `rules/substore.js`：Sub-Store 文件脚本
- `rules/mihomo.yaml`：Mihomo 规则模板
- `rules/sing-box.json`：sing-box 规则模板
- `rules/shadowrocket.conf`：Shadowrocket 规则配置
- `rules/test-substore.js`：脚本行为测试

## 工作方式

节点由 Sub-Store 集合生成，规则由本仓库维护。脚本只接受三个精确参数：

```text
target=mihomo
target=singbox
target=shadowrocket
```

- Mihomo：拉取模板，注入 ClashMeta 节点并填充手动、自动、故障转移和地区策略组。
- sing-box：拉取模板，注入 sing-box outbounds 并填充对应出站组。
- Shadowrocket：返回独立规则配置；节点继续使用 Sub-Store 原生 Shadowrocket 集合订阅。

## Sub-Store 设置

1. 创建集合 `Unified`，加入需要合并的订阅。
2. 创建一个 `mihomoConfig` 文件，使用非空本地基础内容：

```yaml
proxies: []
```

3. 添加 Script Operator，使用脚本链接：

```text
https://raw.githubusercontent.com/gagapony/SubRules/main/rules/substore.js
```

4. Script Operator 参数只需设置集合名；不设置时默认也是 `Unified`：

```json
{
  "collection": "Unified"
}
```

可选参数 `baseUrl` 用于测试 fork 或固定 commit，默认值为：

```text
https://raw.githubusercontent.com/gagapony/SubRules/main/rules
```

## 文件分享链接

```text
/share/file/Subscription?token=YOUR_FILE_TOKEN&target=mihomo
/share/file/Subscription?token=YOUR_FILE_TOKEN&target=singbox
/share/file/Subscription?token=YOUR_FILE_TOKEN&target=shadowrocket
```

Shadowrocket 节点订阅使用集合分享链接：

```text
/share/col/Unified/Shadowrocket?token=YOUR_COLLECTION_TOKEN
```

不要把真实 token、上游订阅地址或生成后的节点配置提交到仓库。

## 测试

```bash
node rules/test-substore.js
```
