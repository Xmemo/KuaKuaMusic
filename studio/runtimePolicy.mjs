import { parse } from "acorn";

// Strudel evaluates JavaScript. Only the musical expression language is accepted
// inside this app, so generated or edited patterns cannot read the host session,
// access the network, or execute arbitrary JavaScript. Full programs can be exported.
const functions = new Set(
  `s sound note n freq stack cat seq fastcat slowcat timecat
  fast slow rev jux juxBy every sometimes sometimesBy rarely often never always
  euclid euclidRot struct mask off ply palindrome iter iterBack range scale chord
  run irand rand sine saw cosine tri square perlin choose chooseCycles wchoose
  pure silence mini m polymeter polyrhythm superimpose add sub mul div mod
  degrade degradeBy segment stretch zoom compress linger early late gain pan
  lpf hpf bpf resonance lpq hpq vowel attack decay sustain release legato
  clip cut room delay delaytime delayfeedback speed loopAt begin end crush
  coarse orbit color size voicing transpose rootNotes arp set`.split(/\s+/),
);
const methods = new Set([
  ...functions,
  ...`fastGap repeatCycles spread when
  lastOf firstOf chunk shuffle scramble hurry inside outside swing swingBy
  cpm detune fm fmi fmhpf fmattack fmdecay fmsustain fmrelease
  distort shape lpattack lpdecay lpsustain lprelease lpenv hpenv
  velocity postgain cutoff octaves anchor offset mode dictionary
  pianoroll punchcard spiral scope spectrum pitchwheel
  _pianoroll _punchcard _spiral _scope _spectrum _pitchwheel`.split(/\s+/),
]);
const forbidden = new Set(["constructor", "prototype", "__proto__", "then"]);
export function validateStudioCode(code) {
  if (typeof code !== "string" || !code.trim() || code.length > 16000)
    throw new Error("请输入不超过 16000 字符的 Strudel 乐句。");
  const ast = parse(code, { ecmaVersion: 2022 });
  let count = 0;
  const visit = (node, locals = new Set()) => {
    if (!node || ++count > 2000)
      throw new Error("乐句过于复杂，请缩短后重试。");
    const fail = () => {
      throw new Error(
        "内置播放支持 Strudel 乐句、常量和音乐变换；此代码包含不支持的 JavaScript 操作，可导出到官方编辑器。",
      );
    };
    switch (node.type) {
      case "Program":
      case "BlockStatement": {
        const scope = new Set(locals);
        for (const statement of node.body) {
          visit(statement, scope);
          if (statement.type === "VariableDeclaration")
            for (const declaration of statement.declarations)
              scope.add(declaration.id.name);
        }
        break;
      }
      case "EmptyStatement":
        break;
      case "ExpressionStatement":
        visit(node.expression, locals);
        break;
      case "ReturnStatement":
        visit(node.argument, locals);
        break;
      case "VariableDeclaration":
        if (node.kind !== "const") fail();
        for (const declaration of node.declarations) {
          if (
            declaration.id.type !== "Identifier" ||
            forbidden.has(declaration.id.name) ||
            functions.has(declaration.id.name)
          )
            fail();
          visit(declaration.init, locals);
        }
        break;
      case "LabeledStatement":
        if (!/^S?\$[a-zA-Z0-9_]*$/.test(node.label.name)) fail();
        visit(node.body, locals);
        break;
      case "Literal":
        if (
          node.regex ||
          node.bigint ||
          !["number", "string", "boolean"].includes(typeof node.value)
        )
          fail();
        if (
          typeof node.value === "number" &&
          (!Number.isFinite(node.value) || Math.abs(node.value) > 100000)
        )
          fail();
        if (typeof node.value === "string") {
          // Bound mini-notation expansion before the runtime queries any events.
          const multipliers = [
            ...node.value.matchAll(/[*!]\s*(\d+(?:\.\d+)?)/g),
          ].map((match) => Number(match[1]));
          if (
            node.value.length > 2048 ||
            multipliers.reduce(
              (product, value) => product * Math.max(1, value),
              1,
            ) > 256
          )
            throw new Error("乐句密度过高，请减少重复次数后重试。");
          for (const match of node.value.matchAll(
            /\(\s*(\d+)\s*,\s*(\d+)|(-?\d+)\.\.(-?\d+)/g,
          ))
            if (
              match[1]
                ? Number(match[1]) > 256 || Number(match[2]) > 1024
                : Math.abs(Number(match[3]) - Number(match[4])) > 256
            )
              throw new Error("乐句密度过高，请缩短节奏或音符范围。");
        }
        break;
      case "Identifier":
        if (!locals.has(node.name) && !functions.has(node.name)) fail();
        break;
      case "CallExpression":
        if (node.optional) fail();
        if (node.callee.type === "MemberExpression") {
          const member = node.callee;
          if (
            member.computed ||
            member.optional ||
            member.property.type !== "Identifier" ||
            !methods.has(member.property.name) ||
            forbidden.has(member.property.name)
          )
            fail();
          visit(member.object, locals);
        } else if (
          node.callee.type === "Identifier" &&
          functions.has(node.callee.name)
        ) {
          // Only named Strudel functions; local callbacks cannot be invoked directly.
        } else fail();
        node.arguments.forEach((argument) => visit(argument, locals));
        break;
      case "ArrayExpression":
        node.elements.forEach((element) => visit(element, locals));
        break;
      case "ObjectExpression":
        for (const property of node.properties) {
          if (
            property.type !== "Property" ||
            property.computed ||
            property.method ||
            property.kind !== "init"
          )
            fail();
          const key = property.key.name ?? property.key.value;
          if (typeof key !== "string" || forbidden.has(key)) fail();
          visit(property.value, locals);
        }
        break;
      case "ArrowFunctionExpression": {
        if (
          node.async ||
          node.params.length > 2 ||
          node.params.some(
            (parameter) =>
              parameter.type !== "Identifier" ||
              forbidden.has(parameter.name) ||
              functions.has(parameter.name),
          )
        )
          fail();
        visit(
          node.body,
          new Set([
            ...locals,
            ...node.params.map((parameter) => parameter.name),
          ]),
        );
        break;
      }
      case "UnaryExpression":
        if (!["+", "-", "!"].includes(node.operator)) fail();
        visit(node.argument, locals);
        break;
      case "BinaryExpression":
      case "LogicalExpression":
        if (
          ![
            "+",
            "-",
            "*",
            "/",
            "%",
            "<",
            ">",
            "<=",
            ">=",
            "===",
            "!==",
            "&&",
            "||",
          ].includes(node.operator)
        )
          fail();
        visit(node.left, locals);
        visit(node.right, locals);
        break;
      case "ConditionalExpression":
        visit(node.test, locals);
        visit(node.consequent, locals);
        visit(node.alternate, locals);
        break;
      default:
        fail();
    }
  };
  visit(ast);
  boundExpansion(ast);
  return true;
}

// Conservative expansion accounting catches composed fast/ply/run and reused
// stacked constants before native visualization or scheduler queries can expand
// the pattern. Advanced dynamic density expressions remain an export use case.
function boundExpansion(ast) {
  const tooDense = () => {
    throw new Error("乐句密度过高或无法预先确定，请使用较小的固定重复次数。");
  };
  const amount = (node, scope) => {
    if (!node) return NaN;
    if (node.type === "Identifier")
      return amount(scope.get(node.name)?.node, scope);
    if (node.type === "Literal") {
      if (typeof node.value === "number") return node.value;
      if (
        typeof node.value === "string" &&
        /^[\d\s.<>[\],]+$/.test(node.value)
      ) {
        const values = node.value.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
        return Math.max(...values);
      }
    }
    if (node.type === "BinaryExpression") {
      const a = amount(node.left, scope),
        b = amount(node.right, scope);
      return (
        {
          "+": () => a + b,
          "-": () => a - b,
          "*": () => a * b,
          "/": () => a / b,
          "%": () => a % b,
        }[node.operator]?.() ?? NaN
      );
    }
    return NaN;
  };
  const cost = (node, scope = new Map()) => {
    if (!node) return 1;
    let result = 1;
    if (node.type === "Program" || node.type === "BlockStatement") {
      scope = new Map(scope);
      for (const statement of node.body) {
        if (statement.type === "VariableDeclaration") {
          for (const declaration of statement.declarations)
            scope.set(declaration.id.name, {
              node: declaration.init,
              cost: cost(declaration.init, scope),
            });
        } else result = Math.max(result, cost(statement, scope));
      }
    } else if (
      ["ExpressionStatement", "ReturnStatement", "LabeledStatement"].includes(
        node.type,
      )
    )
      result = cost(node.expression || node.argument || node.body, scope);
    else if (node.type === "Identifier")
      result = scope.get(node.name)?.cost || 1;
    else if (node.type === "Literal" && typeof node.value === "string")
      result =
        Math.max(1, node.value.length) *
        [...node.value.matchAll(/[*!]\s*(\d+(?:\.\d+)?)/g)].reduce(
          (n, match) => n * Math.max(1, Number(match[1])),
          1,
        );
    else if (node.type === "ArrowFunctionExpression") {
      const nested = new Map(scope);
      for (const parameter of node.params) nested.delete(parameter.name);
      result = cost(node.body, nested);
    } else if (node.type === "CallExpression") {
      const name = node.callee.name || node.callee.property.name;
      const args = node.arguments.map((argument) => cost(argument, scope));
      const base =
        node.callee.type === "MemberExpression"
          ? cost(node.callee.object, scope)
          : 1;
      result = base * Math.max(1, ...args);
      if (
        [
          "stack",
          "cat",
          "seq",
          "fastcat",
          "slowcat",
          "timecat",
          "polymeter",
          "polyrhythm",
        ].includes(name)
      )
        result = args.reduce((a, b) => a + b, 0);
      if (
        [
          "fast",
          "slow",
          "ply",
          "segment",
          "repeatCycles",
          "run",
          "irand",
        ].includes(name)
      ) {
        const value = amount(node.arguments[0], scope);
        if (
          !Number.isFinite(value) ||
          value <= 0 ||
          value > 256 ||
          value < 1 / 256
        )
          tooDense();
        const argumentPattern =
          node.callee.type === "Identifier" ? Math.max(1, ...args.slice(1)) : 1;
        result =
          base *
          argumentPattern *
          Math.max(1, name === "slow" ? 1 / value : value);
      }
      if (["jux", "juxBy", "superimpose", "off"].includes(name)) result *= 2;
    } else if (node.type === "ConditionalExpression")
      result = Math.max(
        cost(node.consequent, scope),
        cost(node.alternate, scope),
      );
    if (!Number.isFinite(result) || result > 4096) tooDense();
    return result;
  };
  cost(ast);
}

export function validateRuntimePlayback(playback) {
  if (
    !Number.isFinite(playback.bpm) ||
    playback.bpm < 20 ||
    playback.bpm > 300 ||
    !Number.isFinite(playback.beatsPerCycle) ||
    playback.beatsPerCycle < 0.25 ||
    playback.beatsPerCycle > 32
  )
    throw new Error("速度须为 20–300 BPM，每循环须为 0.25–32 拍。");
}
