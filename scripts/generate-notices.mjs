import fs from "node:fs";
import path from "node:path";
const root = new URL("../", import.meta.url).pathname;
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
const packages = Object.entries(lock.packages)
  .filter(([directory]) => directory)
  .sort(([a], [b]) => a.localeCompare(b));
let table =
  "# 第三方软件声明\n\n清单由 package-lock.json 生成。各依赖保留原有版权和许可。歌曲资料、录音、研究引用不因此取得再分发许可。\n\n";
table +=
  "Strudel 已按固定版本安装。应用采用 AGPL-3.0-or-later，页面提供运行版本对应的项目源码与许可入口。完整已提供的依赖许可、源码版权声明见 [BUNDLED_LICENSES.txt](/BUNDLED_LICENSES.txt)。默认打击乐由本项目合成，不使用外部采样库。\n\n";
table += "## Strudel 对应源码\n\n";
for (const [directory, pkg] of packages.filter(
  ([name]) =>
    name.startsWith("node_modules/@strudel/") ||
    ["node_modules/superdough", "node_modules/supradough"].includes(name),
)) {
  const name = directory.slice("node_modules/".length);
  table += `- ${name} ${pkg.version}: [上游源码与发行包](${pkg.resolved})（包含源码、README 和许可）；[Strudel 源码仓库](https://codeberg.org/uzu/strudel)。\n`;
}
table += "\n| 包 | 锁定版本 | 许可 | 用途 |\n| --- | --- | --- | --- |\n";
const notices = [
  "KuaKuaMusic third-party notices. Generated from the locked installed packages.\nProject-authored software: AGPL-3.0-or-later; see LICENSE.\n",
];
for (const [directory, pkg] of packages) {
  const name = directory.slice(directory.lastIndexOf("node_modules/") + 13);
  table += `| ${name} | ${pkg.version} | ${pkg.license || "未声明"} | ${pkg.dev ? "开发/构建" : "运行时"} |\n`;
  if (pkg.dev || !fs.existsSync(path.join(root, directory))) continue;
  const absolute = path.join(root, directory),
    files = fs.readdirSync(absolute);
  const metadata = JSON.parse(
    fs.readFileSync(path.join(absolute, "package.json"), "utf8"),
  );
  let entry = `${name} ${pkg.version}\nDeclared license: ${pkg.license}\nSource: ${pkg.resolved}\n`;
  if (metadata.author)
    entry += `Upstream author metadata: ${typeof metadata.author === "string" ? metadata.author : JSON.stringify(metadata.author)}\n`;
  const headers = new Set();
  for (const file of files.filter((file) => /\.(mjs|js|ts)$/.test(file))) {
    const content = fs
      .readFileSync(path.join(absolute, file), "utf8")
      .slice(0, 5000);
    for (const line of content
      .split("\n")
      .filter((line) => /Copyright.*(?:\d{4}|\(c\))/i.test(line)))
      headers.add(line.trim());
  }
  entry += [...headers].join("\n") + "\n";
  const licenseFiles = files.filter((file) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(file),
  );
  for (const file of licenseFiles)
    if (fs.statSync(path.join(absolute, file)).isFile())
      entry += `\n--- ${file} ---\n${fs.readFileSync(path.join(absolute, file), "utf8")}\n`;
  if (!licenseFiles.length) {
    const fallback = name.startsWith("@tonaljs/")
      ? "tonal-MIT.txt"
      : name === "boolbase"
        ? "boolbase-ISC.txt"
        : null;
    if (fallback)
      entry += fs.readFileSync(
        path.join(root, "licenses/upstream", fallback),
        "utf8",
      );
    else {
      const readme = files.find((file) => /^readme\.md$/i.test(file));
      const text = readme
        ? fs.readFileSync(path.join(absolute, readme), "utf8")
        : "";
      const section = text.search(/^##? License/im);
      if (section >= 0) entry += text.slice(section);
      else if (["MIT", "ISC"].includes(pkg.license)) {
        const template = fs.readFileSync(
          path.join(
            root,
            "licenses/upstream",
            pkg.license === "MIT" ? "tonal-MIT.txt" : "boolbase-ISC.txt",
          ),
          "utf8",
        );
        entry +=
          "The upstream package declares this SPDX license in package.json and supplies no separate license file. Standard license terms follow; original author metadata is preserved above.\n" +
          template.replace(/^Copyright[^\n]*\n/gm, "");
      } else throw new Error(`Missing upstream license text for ${name}`);
    }
  }
  notices.push(entry);
}
fs.writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), table);
fs.writeFileSync(
  path.join(root, "BUNDLED_LICENSES.txt"),
  notices.join("\n\n========================================\n\n"),
);
console.log(
  `Recorded ${packages.length} locked packages and ${notices.length - 1} installed runtime package notices.`,
);
