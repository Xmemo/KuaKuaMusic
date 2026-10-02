# Strudel 内置播放验收

日期：2026-10-02。冻结 PRD 未修改，研究默认模型继续为 gpt-6-luna / xhigh。

## 实现

- 固定安装 core/mini/tonal/transpiler/draw 1.2.6、webaudio 1.3.0，通过 StrudelStudioAdapter 懒加载接入。
- 当前草稿播放、A/B 同速试听、停止、音量控制；试听不自动应用或保存版本。
- 原生 pianoroll、punchcard、spiral、scope、spectrum、pitchwheel，随声音/事件动态更新。画布按实际宽度和像素密度调整，支持窄屏。
- bd/sd/hh/oh/cp 为本项目编写的确定性合成鼓音，提供标准振荡器。无外部采样下载，播放教学实验，不播放原曲录音。
- 兼容历史 default/unbound 实验，不改写已保存的研究证据、来源类型和版本。新生成实验记录真实固定音源与运行时标识。
- AST 音乐表达式白名单及展开预算先于执行；播放前检查速度、固定环境与音源。后续周期发生音频错误时停止并显示原因。
- 加载期间停止会撤销待启动操作；停止断开旧音轨和尾音；离开 Studio 关闭 AudioContext、停止绘图并移除画布。
- 保留完整上游许可/源码版权声明、锁定发行包源码链接及页面版权。运行 npm run licenses:generate 可重新生成清单。

## 浏览器与音频证据

在 xin Chrome 操作已有 Queen 学习实验的 A/B 和停止，实际界面显示对应播放状态与滚动 punchcard。此验收没有把合成教学片段认定为原曲试听或原曲测量。

在独立 Chromium 使用生产构建 preview（127.0.0.1:3001）检查 AudioContext 主输出，而不是仅依靠“播放中”文字：

| 检查 | 结果 |
| --- | --- |
| A 主输出最大 RMS | 0.08681322939420796，非零 |
| B 主输出最大 RMS | 0.08334881955740966，非零 |
| A/B 速度 | 同为 110 BPM，4 拍/循环；cps=0.4583333333333333 |
| A 事件位置 | bd=0，sd=0.25，hh=0.75 周期 |
| B 事件位置 | bd=0，sd=0.25，hh=0.5 周期；仅 hh 提前一拍 |
| 停止 | 主输出 RMS=0、master gain=0，canvas 内容不再变化 |
| 加载期间停止 | 捕获“正在准备音频”状态后停止；audioStarted=false，随后可正常再播 A |
| 离开 Studio | AudioContext=closed，残留 #test-canvas 数量=0 |
| 刷新恢复 | 已保存实验代码、110 BPM 与版本恢复；刷新后没有自动播放 |
| 六种原生图 | 各自内容随播放变化，pianoroll 合成音的 RMS 亦非零 |
| 390 像素窄屏 | documentWidth=390，canvasWidth=278；按钮、音量、版权可见，无横向溢出 |
| 生产构建浏览器错误 | 空列表 |

另验证未来周期出现未提供音源时会停止并显示音频错误；fetch/宿主访问及超大重复次数在播放前被拒绝。手动草稿测试未保存到用户研究数据。

## 自动验证与边界

- npm ci 成功；npm audit：0 个已知漏洞。
- npm run verify：类型检查、35 项回归测试、生产构建通过。
- 独立浏览器检查使用真实 Web Audio 数据和真实 Strudel 调度/绘图；未将此表述为人耳主观听感验收。
- 任意 JavaScript 程序、外部音源库、录音渲染与音频文件导出不在内置播放器范围；代码仍可导出到官方编辑器。
- 当前交付为本地与 PR 分支，未合并 main 或发布 Production。

截图与机器验收文件位于本次任务 outputs 目录：kua-strudel-runtime-desktop-20261002.png、kua-strudel-runtime-mobile-20261002.png、kua-strudel-runtime-proof-20261002.json。
