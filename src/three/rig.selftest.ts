// Run: node --experimental-strip-types src/three/rig.selftest.ts
// Guards the signature rigs: unique part keys, finite geometry, feet on the floor.
import assert from "node:assert/strict";
import { buildParts, SIGNATURE_NAMES, hasSignature, type PartSpec } from "./rig.ts";

function checkParts(label: string, parts: PartSpec[]) {
  assert.ok(parts.length > 0, `${label}: no parts`);
  const keys = new Set(parts.map((p) => p.key));
  assert.equal(keys.size, parts.length, `${label}: duplicate part keys`);
  for (const p of parts) {
    const nums = [...p.geom.args, ...p.position, ...(p.rotation ?? [])];
    for (const n of nums) {
      assert.ok(Number.isFinite(n), `${label}/${p.key}: non-finite ${n}`);
    }
    assert.ok(p.position[1] > -0.5, `${label}/${p.key}: buried below the floor`);
  }
}

for (const name of SIGNATURE_NAMES) {
  assert.ok(hasSignature(name.toUpperCase()), `${name}: name lookup is case sensitive`);
  for (const scale of [0.55, 1, 1.7]) {
    checkParts(`${name}@${scale}`, buildParts("other", scale, name));
  }
}

// unknown bots still fall through to the generic weapon_class rig
assert.ok(!hasSignature("Some Rookie Bot"));
checkParts("fallback", buildParts("horizontal_spinner", 1, "Some Rookie Bot"));

console.log(`rig selftest ok — ${SIGNATURE_NAMES.length} signature bots: ${SIGNATURE_NAMES.join(", ")}`);
