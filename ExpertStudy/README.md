# CircomVis Expert Study Guide

独立的 Vue 3 + TypeScript + Element Plus 单页应用，用于引导 CircomVis controlled expert study、按专家配置实验顺序，并将填写结果导出为 Markdown。应用不连接后端，数据只保存在当前浏览器的 `localStorage` 中。

## 环境与启动

使用仓库约定的 Node `v24.19.0` 和 pnpm `11.22.0`：

```bash
cd ExpertStudy
pnpm install
pnpm run dev
```

构建静态产物：

```bash
pnpm run build
pnpm run preview
```

构建结果位于 `ExpertStudy/dist/`，可以部署到任意静态站点。也可使用 `?expert=E1` 预选专家编号，但实际 session 仍需研究人员点击确认创建。

## 正式实验前必须配置

1. 在 `src/config/tasks.ts` 中用最终的 participant-visible intent cards 替换占位说明。此文件不得出现 ground truth、bug 类型、正确位置、审计报告或评分答案。
2. 用经过所在机构伦理审查的正式文本替换 `ConsentStep.vue` 中的 consent 草案，并更新 `src/config/study.ts` 的 `CONSENT_VERSION`。
3. 核对 `src/config/experts.ts` 的 E1–E8 顺序和 A/B、BL/CV 分配。
4. 在正式设备上验证 Markdown 下载、中文字符、刷新恢复以及浏览器的下载权限。
5. Ground truth 与评分 rubric 必须存放在不向参与者发布的研究人员文档中。

## Session 流程

研究人员设置 → 欢迎 → Consent → 专业背景 → 环境说明 → 培训 → 练习 → 理解检查 → 四个正式任务（中途休息）→ SUS → 设计反馈 → 访谈 → 检查与导出 → 完成。

正式任务点击“开始任务”后计时；提交时记录耗时并锁定该任务。理解检查必须全部正确。Consent、背景信息、任务回答和问卷存在必填门槛，参与者不能通过进度条跳页。

## 数据保存与回收

- 每次修改会自动写入当前浏览器的 `localStorage`，刷新页面后自动恢复。
- 最终文件名格式为 `circomvis-expert-study-E1-YYYYMMDD-HHmm.md`。
- 下载结果后，研究人员必须检查文件并将其转移到获批的安全研究数据目录。
- “清除本机数据并结束”会永久移除浏览器中的当前 session，操作前有二次确认。
- 本应用不提供集中上传、跨设备恢复或服务端审计。如需远程无人值守收集，必须增加经过安全评审的服务端存储。

## 研究边界

本应用只负责研究引导、最终诊断、短问卷、SUS、设计反馈和访谈要点。屏幕录制、think-aloud 音频、CircomVis 交互日志、false leads、cross-scope transitions 与 provenance 操作需要由实验环境和研究人员另行记录。
