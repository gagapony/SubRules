const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const scriptPath = path.join(__dirname, 'substore.js')

async function run({
  target,
  template,
  artifacts = {},
  file = { sourceType: 'collection', sourceName: 'Unified' }
}) {
  const script = fs.readFileSync(scriptPath, 'utf8')
  const requests = []
  const productions = []
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const execute = new AsyncFunction(
    '$content',
    '$options',
    '$file',
    '$substore',
    'ProxyUtils',
    'produceArtifact',
    `${script}\nif (typeof main === 'function') await main({})\nreturn { $content, $options }`
  )

  const result = await execute(
    '',
    { _req: { query: { target } } },
    file,
    {
      http: {
        async get({ url }) {
          requests.push(url)
          return { statusCode: 200, body: template }
        }
      }
    },
    {
      yaml: {
        safeLoad: JSON.parse,
        safeDump: value => JSON.stringify(value)
      }
    },
    async options => {
      productions.push(options)
      return structuredClone(artifacts[options.platform] ?? [])
    }
  )

  return { ...result, requests, productions }
}

async function main() {
  globalThis.main = async () => {
    throw new Error('stale global main invoked')
  }

  await assert.rejects(
    run({ target: 'mihomo', template: '{}' }),
    /不支持的 target: mihomo/
  )
  await assert.rejects(
    run({
      target: 'clash',
      template: '{}',
      file: { sourceType: 'remote', sourceName: 'https://example.test/sub' }
    }),
    /请选择订阅或组合/
  )
  await assert.rejects(
    run({
      target: 'clash',
      template: '{}',
      file: { sourceType: 'collection', sourceName: '' }
    }),
    /请选择订阅或组合/
  )

  const mihomoTemplate = JSON.stringify({
    proxies: [],
    'proxy-groups': [
      { name: '手动选择', type: 'fallback', proxies: ['手选节点', '故障转移'] },
      { name: '手选节点', type: 'select', proxies: [] },
      { name: '自动选择', type: 'url-test', proxies: [] },
      { name: '故障转移', type: 'fallback', proxies: [] },
      ...['香港', '日本', '美国', '德国'].flatMap(region => [
        { name: `${region}节点`, type: 'fallback', proxies: [`${region}自动`, '故障转移'] },
        { name: `${region}自动`, type: 'url-test', proxies: [] }
      ])
    ]
  })
  const mihomo = await run({
    target: 'clash',
    template: mihomoTemplate,
    artifacts: {
      ClashMeta: [
        { name: '香港 A', type: 'vless' },
        { name: 'US B', type: 'hysteria2' },
        { name: '剩余流量 100GB', type: 'ss' }
      ]
    }
  })
  const mihomoConfig = JSON.parse(mihomo.$content)
  assert.deepEqual(mihomo.requests, [
    'https://raw.githubusercontent.com/gagapony/SubRules/main/rules/mihomo.yaml'
  ])
  assert.deepEqual(mihomo.productions, [{
    type: 'collection',
    name: 'Unified',
    platform: 'ClashMeta',
    produceType: 'internal'
  }])
  assert.deepEqual(mihomoConfig.proxies.map(proxy => proxy.name), ['香港 A', 'US B'])
  const members = name => mihomoConfig['proxy-groups'].find(group => group.name === name).proxies
  assert.deepEqual(members('手动选择'), ['手选节点', '故障转移'])
  for (const name of ['手选节点', '自动选择', '故障转移']) {
    assert.deepEqual(members(name), ['香港 A', 'US B'])
  }
  // 地区组固定指向“本区自动 + 全局兜底”，本区自动只填匹配节点。
  for (const region of ['香港', '日本', '美国', '德国']) {
    assert.deepEqual(members(`${region}节点`), [`${region}自动`, '故障转移'])
  }
  assert.deepEqual(members('香港自动'), ['香港 A'])
  assert.deepEqual(members('美国自动'), ['US B'])
  // 本区没有匹配节点时沿用全部节点，避免空组（与原有行为一致）。
  assert.deepEqual(members('日本自动'), ['香港 A', 'US B'])
  assert.deepEqual(members('德国自动'), ['香港 A', 'US B'])

  const singBoxTemplate = JSON.stringify({
    outbounds: [
      { type: 'direct', tag: 'DIRECT' },
      { type: 'block', tag: 'REJECT' },
      { type: 'selector', tag: '手动选择', outbounds: [] },
      { type: 'urltest', tag: '自动选择', outbounds: [] },
      { type: 'urltest', tag: '香港节点', outbounds: [] },
      { type: 'urltest', tag: '日本节点', outbounds: [] },
      { type: 'urltest', tag: '美国节点', outbounds: [] },
      { type: 'urltest', tag: '德国节点', outbounds: [] }
    ]
  })
  const singBox = await run({
    target: 'singbox',
    template: singBoxTemplate,
    file: { sourceType: 'subscription', sourceName: 'NodeSub' },
    artifacts: {
      'sing-box': [
        { type: 'vless', tag: 'JP A' },
        { type: 'hysteria2', tag: '德国 B' }
      ]
    }
  })
  const singBoxConfig = JSON.parse(singBox.$content)
  assert.deepEqual(singBox.requests, [
    'https://raw.githubusercontent.com/gagapony/SubRules/main/rules/sing-box.json'
  ])
  assert.deepEqual(singBox.productions, [{
    type: 'subscription',
    name: 'NodeSub',
    platform: 'sing-box',
    produceType: 'internal'
  }])
  assert.deepEqual(singBoxConfig.outbounds.slice(-2).map(outbound => outbound.tag), ['JP A', '德国 B'])
  assert.deepEqual(singBoxConfig.outbounds.find(outbound => outbound.tag === '手动选择').outbounds, ['JP A', '德国 B'])
  assert.deepEqual(singBoxConfig.outbounds.find(outbound => outbound.tag === '日本节点').outbounds, ['JP A'])
  assert.deepEqual(singBoxConfig.outbounds.find(outbound => outbound.tag === '德国节点').outbounds, ['德国 B'])

  const shadowrocket = await run({
    target: 'shadowrocket',
    template: 'unused',
    artifacts: {
      Shadowrocket: [
        {
          name: '香港 A',
          type: 'vless',
          _subName: 'NodeSub',
          'reality-opts': {
            'public-key': 'public-key-a',
            'short-id': 'short-id-a',
            '_spider-x': '/spider-a'
          }
        },
        {
          name: '德国 B',
          type: 'hysteria2',
          fingerprint: 'sha256-b'
        },
        { name: '剩余流量 100GB', type: 'vmess' }
      ]
    }
  })
  const shadowrocketConfig = JSON.parse(shadowrocket.$content)
  assert.deepEqual(shadowrocket.requests, [])
  assert.deepEqual(shadowrocket.productions, [{
    type: 'collection',
    name: 'Unified',
    platform: 'Shadowrocket',
    produceType: 'internal'
  }])
  assert.deepEqual(shadowrocketConfig.proxies.map(proxy => proxy.name), ['香港 A', '德国 B'])
  assert.equal(shadowrocketConfig.proxies[0]._subName, undefined)
  assert.equal(shadowrocketConfig.proxies[0]['reality-opts']['_spider-x'], '/spider-a')
  assert.equal(shadowrocketConfig.proxies[1].fingerprint, 'sha256-b')
  assert.equal(shadowrocketConfig['proxy-groups'], undefined)
  assert.equal(shadowrocketConfig.rules, undefined)
  assert.equal(shadowrocket.$options._res.headers['profile-update-interval'], 24)

  const shadowrocketRulesTemplate = '[General]\nipv6 = true\n\n[Proxy Group]\n手动选择 = select,policy-regex-filter=.\n\n[Rule]\nFINAL,Final\n'
  const shadowrocketRules = await run({
    target: 'shadowrocket-rules',
    template: shadowrocketRulesTemplate
  })
  assert.deepEqual(shadowrocketRules.requests, [
    'https://raw.githubusercontent.com/gagapony/SubRules/main/rules/shadowrocket.conf'
  ])
  assert.deepEqual(shadowrocketRules.productions, [])
  assert.equal(shadowrocketRules.$content, shadowrocketRulesTemplate)
  assert.equal(shadowrocketRules.$options._res.headers['profile-update-interval'], 24)

  delete globalThis.main
  console.log('substore rules tests passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
