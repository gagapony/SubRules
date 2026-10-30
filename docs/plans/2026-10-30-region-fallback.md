# Regional Fallback Implementation Plan

**Goal:** Publish the approved regional manual-selection / shared-fallback structure without changing routing rules or committing generated credentials.

**Architecture:** Mihomo and Shadowrocket use `地区节点 = fallback [地区线路, 故障转移]`; each regional line is a manual selector. Global automatic/manual/backup pools contain subscription nodes, never regional parents. Official sing-box has no ordered fallback: only simplify its entry points and preserve its existing regional outbound types.

**Tech Stack:** Sub-Store JavaScript, Mihomo YAML, Shadowrocket INI, sing-box JSON, Node assertions, Python/PyYAML for reading the real YAML template in tests.

## 1. Regression tests
- Update `rules/test-substore.js` to read the actual templates.
- Assert regional parent membership, manual regional leaves, populated global pools, missing-region behavior, reference/default validity and no cycles.
- Cover sing-box's unchanged regional types and Shadowrocket's native group structure.
- Run `node rules/test-substore.js`; confirm failure against the old structure.

## 2. Templates and generator
- Update `rules/mihomo.yaml` and `rules/shadowrocket.conf` to the approved structure; remove duplicate manual entries from application groups.
- Simplify only the entry points in `rules/sing-box.json`; keep regional types and application defaults.
- Update `rules/substore.js` to populate global pools and target-specific regional leaves, never overwrite Mihomo regional parents.
- Preserve all rule sections, DNS configuration and node conversion behavior.

## 3. Verification and publication
- Run the regression suite and validate generated fixture configurations with available native cores.
- Compare rule sections against the previous commit; inspect the complete diff for credentials and unintended changes.
- Update `README.md` with platform differences, client update steps, test prerequisites and verification limits.
- Commit and push to `main`; do not include the external lab or temporary subscription files.

## Verification results
- Regression suite passed against the real templates; it failed before the group changes as expected.
- Generated dummy-node configs passed Mihomo v1.19.33 and sing-box v1.14.4 native checks.
- Native sing-box validation found the same missing-default-resolver error in the previous commit. Added `route.default_domain_resolver: local` (the existing DNS final) and a regression assertion; validation then passed without compatibility flags.
- Compared Mihomo non-group fields, Shadowrocket General/Rule sections and sing-box routing rules with the previous commit: unchanged. Regional types and application defaults in sing-box are unchanged.
- Shadowrocket still needs device validation; native configuration checks do not establish real network failover.
