import test from "node:test";
import assert from "node:assert/strict";
import {
  validateStudioCode,
  validateRuntimePlayback,
} from "../studio/runtimePolicy.mjs";

test("Studio accepts musical patterns, native visuals, constants and musical callbacks", () => {
  for (const code of [
    'stack(s("bd ~ ~ ~"),s("~ sd ~ ~"),s("~ ~ hh ~"))._punchcard()',
    'note("c4 e4 g4").s("sine").legato(0.5).gain(0.2)._pianoroll()',
    'const a = note("c e"); a.jux(rev).slow(2)._spiral()',
    's("hh*8").every(4, x => x.fast(2))._scope({thickness: 2})',
    '$: note("c").s("sine"); $: s("bd*4")',
  ])
    assert.equal(validateStudioCode(code), true);
});

test("Studio rejects host access and JavaScript escape paths before evaluation", () => {
  for (const code of [
    'fetch("/api/agent/session")',
    'window.localStorage.getItem("token")',
    's("bd").constructor.constructor("alert(1)")()',
    's("bd")["constructor"]("alert(1)")',
    'const x = s("bd"); x.constructor("alert(1)")',
    's("bd").gain({__proto__: note("c")})',
    'import("https://example.com/code.js")',
    "while(true){}",
    's("bd").onTrigger(x => fetch("https://example.com"))',
    "new AudioContext()",
    'note = s("bd")',
    's("bd").every(4, x => x.window.fetch("/"))',
  ])
    assert.throws(() => validateStudioCode(code));
});

test("Studio bounds pattern expansion and validates actual tempo", () => {
  assert.throws(() => validateStudioCode('s("bd*999999999")'));
  assert.throws(() => validateStudioCode('s("[hh*16]*32")'));
  assert.throws(() => validateStudioCode("run(100000).note().fast(100000)"));
  assert.throws(() => validateStudioCode('s("bd").fast(128*128)'));
  assert.throws(() => validateStudioCode('s("bd").slow(0.0000001)'));
  assert.throws(() => validateStudioCode('s("bd(100000,100000)")'));
  assert.throws(() => validateStudioCode('n("0..100000")'));
  assert.throws(() =>
    validateStudioCode(
      'const a=s("bd*32"); const b=stack(a,a,a,a); stack(b,b,b,b,b,b,b,b)',
    ),
  );
  assert.throws(() => validateRuntimePlayback({ bpm: 0, beatsPerCycle: 4 }));
  assert.throws(() => validateRuntimePlayback({ bpm: 110, beatsPerCycle: 0 }));
  assert.throws(() =>
    validateRuntimePlayback({ bpm: Infinity, beatsPerCycle: 4 }),
  );
  assert.equal(
    validateRuntimePlayback({ bpm: 110, beatsPerCycle: 4 }),
    undefined,
  );
});
