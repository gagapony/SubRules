const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const scriptPath = path.join(__dirname, 'substore.js')

async function run({ target, template, artifacts = {}, scriptArguments }) {
  const script = fs.readFileSync(scriptPath, 'utf8')
  const requests = []
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const execute = new AsyncFunction(
    '$content',
    '$options',
    '$arguments',
    '$substore',
    'ProxyUtils',
    'produceArtifact',
    `${script}\nreturn { $content, $options }`
  )

  const result = await execute(
    '',
    { _req: { query: { target } } },
    scriptArguments ?? { baseUrl: 'https://example.test/rules', collection: 'Unified' },
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
    async ({ platform }) => structuredClone(artifacts[platform] ?? [])
  )

  return { ...result, requests }
}

async function main() {
  await assert.rejects(
    run({ target: 'sing-box', template: '{}' }),
    /不支持的 target: sing-box/
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
    target: 'mihomo',
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
  assert.deepEqual(mihomo.requests, ['https://example.test/rules/mihomo.yaml'])
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
    artifacts: {
      'sing-box': [
        { type: 'vless', tag: 'JP A' },
        { type: 'hysteria2', tag: '德国 B' }
      ]
    }
  })
  const singBoxConfig = JSON.parse(singBox.$content)
  assert.deepEqual(singBox.requests, ['https://example.test/rules/sing-box.json'])
  assert.deepEqual(singBoxConfig.outbounds.slice(-2).map(outbound => outbound.tag), ['JP A', '德国 B'])
  assert.deepEqual(singBoxConfig.outbounds.find(outbound => outbound.tag === '手动选择').outbounds, ['JP A', '德国 B'])
  assert.deepEqual(singBoxConfig.outbounds.find(outbound => outbound.tag === '日本节点').outbounds, ['JP A'])
  assert.deepEqual(singBoxConfig.outbounds.find(outbound => outbound.tag === '德国节点').outbounds, ['德国 B'])

  const shadowrocket = await run({
    target: 'shadowrocket',
    template: '[General]\nipv6 = true\n'
  })
  assert.deepEqual(shadowrocket.requests, ['https://example.test/rules/shadowrocket.conf'])
  assert.equal(shadowrocket.$content, '[General]\nipv6 = true\n')
  assert.equal(shadowrocket.$options._res.headers['profile-update-interval'], 24)

  const defaultRepository = await run({
    target: 'shadowrocket',
    template: '[General]\n',
    scriptArguments: { collection: 'Unified' }
  })
  assert.deepEqual(defaultRepository.requests, [
    'https://raw.githubusercontent.com/gagapony/SubRules/main/rules/shadowrocket.conf'
  ])

  console.log('substore rules tests passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
