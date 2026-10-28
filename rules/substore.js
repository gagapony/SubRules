const target = String($options?._req?.query?.target ?? '')
const templates = {
  mihomo: 'mihomo.yaml',
  'sing-box': 'sing-box.json',
  shadowrocket: 'shadowrocket.conf'
}

if (!Object.hasOwn(templates, target)) {
  throw new Error(`不支持的 target: ${target}`)
}

const baseUrl = String($arguments?.baseUrl ?? 'https://raw.githubusercontent.com/gagapony/SubRules/main/rules').replace(/\/+$/, '')
const collection = String($arguments?.collection ?? 'Unified')

if (!baseUrl) {
  throw new Error('缺少脚本参数 baseUrl')
}

const metadataPattern = /(剩余|流量|套餐|到期|官网|订阅|更新|traffic|expire|有效期)/i
const regionPatterns = {
  香港节点: /(香港|\bHK\b|Hong ?Kong|\bHKG\b|🇭🇰)/i,
  日本节点: /(日本|\bJP\b|Japan|Tokyo|Osaka|东京|大阪|\bNRT\b|\bHND\b|\bKIX\b|🇯🇵)/i,
  美国节点: /(美国|\bUS\b|\bUSA\b|United States|America|Los Angeles|Seattle|San Jose|New York|Dallas|Chicago|Virginia|California|洛杉矶|西雅图|圣何塞|纽约|达拉斯|芝加哥|美西|美东|🇺🇸)/i,
  德国节点: /(德国|\bDE\b|Germany|Frankfurt|法兰克福|\bFRA\b|🇩🇪)/i
}

async function fetchTemplate() {
  const response = await $substore.http.get({
    url: `${baseUrl}/${templates[target]}`,
    timeout: 15000
  })

  if (!response || response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`拉取 ${templates[target]} 失败: HTTP ${response?.statusCode ?? 'unknown'}`)
  }

  return response.body
}

function usableNames(items, key) {
  const names = items
    .map(item => String(item?.[key] ?? '').trim())
    .filter(name => name && !metadataPattern.test(name))
  const duplicate = names.find((name, index) => names.indexOf(name) !== index)

  if (duplicate) {
    throw new Error(`节点名称重复: ${duplicate}`)
  }
  if (!names.length) {
    throw new Error('统一集合没有可用节点')
  }

  return names
}

function regionalNames(names, pattern) {
  const matched = names.filter(name => pattern.test(name))
  // shortcut: 无匹配地区时使用全部节点，避免生成不可用的空策略组。
  return matched.length ? matched : names
}

function fillGroups(groups, nameKey, membersKey, names) {
  const dynamicGroups = new Set(['手动选择', '自动选择', '故障转移'])

  for (const group of groups) {
    const name = group?.[nameKey]
    if (dynamicGroups.has(name)) {
      group[membersKey] = [...names]
    } else if (regionPatterns[name]) {
      group[membersKey] = regionalNames(names, regionPatterns[name])
    }
  }
}

const template = await fetchTemplate()

if (target === 'mihomo') {
  const config = ProxyUtils.yaml.safeLoad(template)
  const produced = await produceArtifact({
    type: 'collection',
    name: collection,
    platform: 'ClashMeta',
    produceType: 'internal'
  })
  const names = usableNames(produced, 'name')
  const allowed = new Set(names)

  config.proxies = produced.filter(proxy => allowed.has(proxy.name))
  config['proxy-groups'] = config['proxy-groups'] ?? []
  fillGroups(config['proxy-groups'], 'name', 'proxies', names)
  $content = ProxyUtils.yaml.safeDump(config)
} else if (target === 'sing-box') {
  const config = JSON.parse(template)
  const produced = await produceArtifact({
    type: 'collection',
    name: collection,
    platform: 'sing-box',
    produceType: 'internal'
  })
  const names = usableNames(produced, 'tag')
  const allowed = new Set(names)
  const nodes = produced.filter(outbound => allowed.has(outbound.tag))

  config.outbounds = config.outbounds ?? []
  const reserved = new Set(config.outbounds.map(outbound => outbound.tag))
  const collision = names.find(name => reserved.has(name))
  if (collision) {
    throw new Error(`节点名称与规则出站重复: ${collision}`)
  }

  fillGroups(config.outbounds, 'tag', 'outbounds', names)
  config.outbounds.push(...nodes)
  $content = JSON.stringify(config, null, 2)
} else {
  $content = template
}

$options._res = {
  ...($options._res ?? {}),
  headers: {
    ...($options._res?.headers ?? {}),
    'profile-update-interval': 24
  }
}
