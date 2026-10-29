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
      { name: '手动选择', proxies: [] },
      { name: '自动选择', proxies: [] },
      { name: '香港节点', proxies: [] },
      { name: '日本节点', proxies: [] },
      { name: '美国节点', proxies: [] },
      { name: '德国节点', proxies: [] }
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
  assert.deepEqual(mihomoConfig['proxy-groups'][0].proxies, ['香港 A', 'US B'])
  assert.deepEqual(mihomoConfig['proxy-groups'][2].proxies, ['香港 A'])
  assert.deepEqual(mihomoConfig['proxy-groups'][4].proxies, ['US B'])

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
    template: mihomoTemplate,
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
  assert.deepEqual(shadowrocket.requests, [
    'https://raw.githubusercontent.com/gagapony/SubRules/main/rules/mihomo.yaml'
  ])
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
  assert.deepEqual(shadowrocketConfig['proxy-groups'][0].proxies, ['香港 A', '德国 B'])
  assert.equal(shadowrocket.$options._res.headers['profile-update-interval'], 24)

  delete globalThis.main
  console.log('substore rules tests passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
