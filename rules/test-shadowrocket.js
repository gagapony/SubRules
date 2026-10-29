const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const config = fs.readFileSync(path.join(__dirname, 'shadowrocket.conf'), 'utf8')
const section = config.split('[Proxy Group]')[1].split('[Rule]')[0]
const groups = new Map(section.split('\n').filter(line => line && !line.startsWith('#')).map(line => {
  const [name, value] = line.split(/\s+=\s+/)
  const [type, ...items] = value.split(',')
  return [name, { type, members: items.filter(item => !item.includes('=')), items }]
}))
function expectGroup(name, type, members) {
  assert.equal(groups.get(name)?.type, type, name)
  assert.deepEqual(groups.get(name).members, members, name)
}
assert(!groups.has('首选代理'))
expectGroup('选择代理', 'select', ['自动选择', '故障转移', '香港节点', '日本节点', '美国节点', '德国节点', '手动选择', 'DIRECT'])
expectGroup('手动选择', 'fallback', ['手选节点', '故障转移'])
expectGroup('手选节点', 'select', [])
expectGroup('自动选择', 'url-test', [])
expectGroup('故障转移', 'fallback', [])
for (const region of ['香港', '日本', '美国', '德国']) {
  expectGroup(`${region}节点`, 'fallback', [`${region}自动`, '故障转移'])
  expectGroup(`${region}自动`, 'url-test', [])
}
for (const name of ['手选节点', '自动选择', '故障转移', '香港自动', '日本自动', '美国自动', '德国自动']) {
  assert(groups.get(name).items.some(item => item.startsWith('policy-regex-filter=')), name)
}

function visit(name, ancestors = []) {
  assert(!ancestors.includes(name), `cycle: ${[...ancestors, name].join(' -> ')}`)
  const group = groups.get(name)
  assert(group, `unknown group: ${name}`)
  for (const member of group.members) {
    if (!['DIRECT', 'REJECT', 'REJECT-DROP'].includes(member)) visit(member, [...ancestors, name])
  }
  if (['fallback', 'url-test'].includes(group.type)) {
    for (const option of ['url=https://cp.cloudflare.com', 'interval=60', 'timeout=5']) {
      assert(group.items.includes(option), `${name}: missing ${option}`)
    }
    assert(!group.members.includes('DIRECT'), `${name}: automatic direct fallback`)
  }
}
for (const name of groups.keys()) visit(name)

// Business selectors must only expose protected roots or explicit direct/reject actions.
const safeTargets = new Set(['选择代理', '香港节点', '日本节点', '美国节点', '德国节点', '手动选择', 'DIRECT', 'REJECT', 'REJECT-DROP'])
const rules = config.split('[Rule]')[1].trim().split('\n').filter(line => line && !line.startsWith('#'))
for (const line of rules) {
  const fields = line.split(',')
  const target = fields.at(-1) === 'no-resolve' ? fields.at(-2) : fields.at(-1)
  if (['DIRECT', 'REJECT', 'REJECT-DROP'].includes(target)) continue
  assert.equal(groups.get(target)?.type, 'select', target)
  if (target === '选择代理') continue
  for (const member of groups.get(target).members) assert(safeTargets.has(member), `${target}: unsafe root ${member}`)
}
for (const name of ['AI服务', 'Telegram']) assert(groups.get(name).items.includes('policy-select-name=美国节点'))
assert(groups.get('Spotify').items.includes('policy-select-name=DIRECT'))
expectGroup('Final', 'select', ['选择代理', 'DIRECT'])
expectGroup('搜狗输入法', 'select', ['DIRECT', 'REJECT'])
expectGroup('广告拦截', 'select', ['REJECT', 'REJECT-DROP', 'DIRECT'])
console.log('Shadowrocket configuration checks passed (not a client runtime test)')
