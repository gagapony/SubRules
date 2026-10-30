const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const regions = ['香港', '日本', '美国', '德国']
const readTemplate = file => fs.readFileSync(path.join(__dirname, file), 'utf8')
// Use the actual YAML template without adding a production JavaScript dependency.
const mihomoTemplate = execFileSync('python3', ['-c',
  'import json,sys,yaml; print(json.dumps(yaml.safe_load(sys.stdin.read())))'
], { input: readTemplate('mihomo.yaml'), encoding: 'utf8' })
assert(!/uuid|password/.test(mihomoTemplate), 'template must not embed node credentials')
assert.equal(JSON.parse(mihomoTemplate).proxies.length, 0, 'template proxies must stay empty')
assert(!JSON.parse(mihomoTemplate)['proxy-groups'].some(group => group.icon), 'group icons are not wanted')
assert.equal(JSON.parse(mihomoTemplate)['unified-delay'], true)
assert.equal(JSON.parse(mihomoTemplate)['tcp-concurrent'], true)

function checkGroups(groups, nameKey, membersKey, nodes = []) {
  const byName = new Map(groups.map(group => [group[nameKey], group]))
  assert.equal(byName.size, groups.length, 'duplicate group names')
  const known = new Set([...byName.keys(), ...nodes, 'DIRECT', 'REJECT', 'REJECT-DROP'])
  function visit(name, ancestors = []) {
    assert(!ancestors.includes(name), `group cycle: ${[...ancestors, name]}`)
    const group = byName.get(name)
    if (!group?.[membersKey]) return
    assert(group[membersKey].length, `empty group: ${name}`)
    if (group.default) assert(group[membersKey].includes(group.default), `invalid default: ${name}`)
    for (const child of group[membersKey]) {
      assert(known.has(child), `missing reference: ${name} -> ${child}`)
      if (byName.has(child)) visit(child, [...ancestors, name])
    }
    if (name !== '选择代理') assert(!group[membersKey].includes('手动选择'), `duplicate manual entry: ${name}`)
  }
  for (const name of byName.keys()) visit(name)
}

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
  assert.deepEqual(members('选择代理'), ['自动选择', '手动选择'])
  for (const name of ['手动选择', '自动选择', '故障转移']) {
    assert.deepEqual(members(name), ['香港 A', 'US B'])
  }
  for (const region of regions) {
    const parent = mihomoConfig['proxy-groups'].find(group => group.name === `${region}节点`)
    assert.equal(parent.type, 'fallback')
    assert.deepEqual(parent.proxies, [`${region}线路`, '故障转移'])
    assert.equal(parent.interval, 30)
    assert.equal(parent.timeout, 3000)
    assert.equal(parent.lazy, false)
    assert.equal(mihomoConfig['proxy-groups'].find(group => group.name === `${region}线路`).type, 'select')
  }
  assert.deepEqual(members('香港线路'), ['香港 A'])
  assert.deepEqual(members('美国线路'), ['US B'])
  assert.deepEqual(members('日本线路'), ['香港 A', 'US B'])
  assert.deepEqual(members('德国线路'), ['香港 A', 'US B'])
  checkGroups(mihomoConfig['proxy-groups'], 'name', 'proxies', ['香港 A', 'US B'])
  const clashTargets = new Set(['DIRECT', 'REJECT', ...mihomoConfig['proxy-groups'].map(group => group.name)])
  for (const rule of mihomoConfig.rules) {
    const parts = rule.split(',')
    assert(clashTargets.has(parts.at(-1) === 'no-resolve' ? parts.at(-2) : parts.at(-1)), `missing rule target: ${rule}`)
    if (parts[0] === 'RULE-SET') assert(Object.hasOwn(mihomoConfig['rule-providers'], parts[1]))
  }
  const twoGermanNodes = JSON.parse((await run({
    target: 'clash', template: mihomoTemplate,
    artifacts: { ClashMeta: [{ name: 'DE A' }, { name: 'DE B' }, { name: 'HK A' }] }
  })).$content)
  assert.deepEqual(twoGermanNodes['proxy-groups'].find(group => group.name === '德国线路').proxies, ['DE A', 'DE B'])
  for (const name of ['AI服务', 'Telegram', 'Spotify', 'Truth Social']) {
    assert.equal(members(name)[0], '选择代理')
  }

  for (const target of ['clash', 'singbox']) {
    const platform = target === 'clash' ? 'ClashMeta' : 'sing-box'
    const key = target === 'clash' ? 'name' : 'tag'
    const template = target === 'clash' ? mihomoTemplate : readTemplate('sing-box.json')
    await assert.rejects(run({ target, template, artifacts: { [platform]: [] } }), /没有可用节点/)
    await assert.rejects(run({ target, template, artifacts: {
      [platform]: [{ [key]: '德国线路' }, { [key]: '德国线路' }]
    } }), /节点名称重复/)
    await assert.rejects(run({ target, template, artifacts: {
      [platform]: [{ [key]: '选择代理' }]
    } }), /节点名称与规则.*重复/)
  }

  const singBoxTemplate = readTemplate('sing-box.json')
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
  assert.equal(singBoxConfig.route.default_domain_resolver, singBoxConfig.dns.final)
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
  const sbGroup = tag => singBoxConfig.outbounds.find(outbound => outbound.tag === tag)
  assert.deepEqual(sbGroup('选择代理').outbounds, ['自动选择', '手动选择'])
  for (const tag of ['自动选择', '故障转移']) {
    assert.deepEqual(sbGroup(tag).outbounds, ['JP A', '德国 B'])
    assert.equal(sbGroup(tag).type, 'urltest')
  }
  for (const region of regions) {
    assert.equal(sbGroup(`${region}节点`).type, region === '美国' ? 'selector' : 'urltest')
  }
  checkGroups(singBoxConfig.outbounds, 'tag', 'outbounds')
  const sbTargets = new Set(singBoxConfig.outbounds.map(outbound => outbound.tag))
  const ruleSets = new Set(singBoxConfig.route.rule_set.map(set => set.tag))
  assert(sbTargets.has(singBoxConfig.route.final))
  for (const rule of singBoxConfig.route.rules) {
    if (rule.outbound) assert(sbTargets.has(rule.outbound))
    for (const tag of rule.rule_set ?? []) assert(ruleSets.has(tag))
  }

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

  const shadowrocketRulesTemplate = readTemplate('shadowrocket.conf')
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

  const srGroups = shadowrocketRulesTemplate.split('[Proxy Group]\n')[1].split('\n[Rule]')[0]
    .trim().split('\n').filter(line => line && !line.startsWith('#')).map(line => {
      const [name, value] = line.split(' = ')
      const [type, ...parts] = value.split(',')
      return { name, type, parts, proxies: parts.filter(part => !part.includes('=')) }
    })
  const srGroup = name => srGroups.find(group => group.name === name)
  assert.deepEqual(srGroup('选择代理').proxies, ['自动选择', '手动选择'])
  for (const region of regions) {
    assert.equal(srGroup(`${region}线路`).type, 'select')
    assert(srGroup(`${region}线路`).parts.some(part => part.startsWith('policy-regex-filter=')))
    const parent = srGroup(`${region}节点`)
    assert.equal(parent.type, 'fallback')
    assert.deepEqual(parent.proxies, [`${region}线路`, '故障转移'])
    assert(parent.parts.includes('interval=30'))
    assert(parent.parts.includes('timeout=3'))
  }
  // Native regex leaves have no literal members until Shadowrocket expands the subscription.
  checkGroups(srGroups.map(group => ({ ...group,
    proxies: group.proxies.length ? group.proxies : ['fixture-node']
  })), 'name', 'proxies', ['fixture-node'])
  const srTargets = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', ...srGroups.map(group => group.name)])
  for (const rule of shadowrocketRulesTemplate.split('[Rule]\n')[1].trim().split('\n')) {
    const parts = rule.split(',')
    assert(srTargets.has(parts.at(-1) === 'no-resolve' ? parts.at(-2) : parts.at(-1)), `missing rule target: ${rule}`)
  }
  for (const name of ['AI服务', 'Telegram', 'Spotify', 'Truth Social']) {
    assert.equal(srGroup(name).proxies[0], '选择代理')
    const selected = srGroup(name).parts.find(part => part.startsWith('policy-select-name='))
    assert(!selected || selected === 'policy-select-name=选择代理')
  }

  delete globalThis.main
  console.log('substore rules tests passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
