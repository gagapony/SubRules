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

  const shadowrocketTemplate = '[General]\nipv6 = true\n\n[Proxy Group]\n选择代理 = select,DIRECT\n\n[Rule]\nFINAL,Final\n'
  const shadowrocket = await run({
    target: 'shadowrocket',
    template: shadowrocketTemplate,
    artifacts: {
      Loon: [
        '香港 A=vless,hk.example.com,443,uuid-a,transport=tcp,over-tls=true,udp=true',
        '德国 B=Hysteria2,de.example.com,443,password-b,tls-name=de.example.com,udp=true',
        '剩余流量 100GB=vmess,info.example.com,443,aes-128-gcm,uuid-c,transport=ws'
      ]
    }
  })
  assert.deepEqual(shadowrocket.requests, [
    'https://raw.githubusercontent.com/gagapony/SubRules/main/rules/shadowrocket.conf'
  ])
  assert.deepEqual(shadowrocket.productions, [{
    type: 'collection',
    name: 'Unified',
    platform: 'Loon',
    produceType: 'internal'
  }])
  assert.match(shadowrocket.$content, /\[Proxy\]\n香港 A=vless/)
  assert.match(shadowrocket.$content, /德国 B=Hysteria2/)
  assert.doesNotMatch(shadowrocket.$content, /剩余流量/)
  assert.ok(shadowrocket.$content.indexOf('[Proxy]') < shadowrocket.$content.indexOf('[Proxy Group]'))
  assert.equal(shadowrocket.$options._res.headers['profile-update-interval'], 24)

  delete globalThis.main
  console.log('substore rules tests passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
