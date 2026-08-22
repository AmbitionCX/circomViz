# 一、研究问题

- Bug Localization Study：受控、对照、定量为主，回答“CircomVis 是否帮助专家更准确、更高效地定位并解释 bug？”
    
- Real-World Bug Investigation：开放、探索、定性为主，回答“CircomVis 在真实规模和真实语境下如何支持专家形成诊断证据？”

### RQ1：定位与诊断效果

> Does CircomVis improve experts’ accuracy and efficiency in locating and diagnosing Circom bugs compared with a conventional debugging workflow?

### RQ2：视觉调试过程

> How do hierarchy navigation, coordinated source–constraint views, and provenance tracing affect experts’ debugging processes?

### RQ3：真实环境适用性

> How does CircomVis support evidence-based diagnosis in realistic hierarchical Circom projects?

---

# 二、Phase 0：培训

## 视频内容

建议视频只介绍界面和交互，不演示正式实验中的四类 bug：

1. 系统要解决的问题；
2. template hierarchy 和 component selection；
3. Source Semantics Graph；
4. Constraint Enforcement View；
5. source–constraint provenance；
6. partial compilation；
7. scope comparison 和 property checking；
8. 如何提交最终诊断。

## 动手练习

给一个非常简单的练习问题：

> Select the component that contributes to the final output and trace one source-level operation to its generated constraint.

练习不计时、不计分。研究人员只回答界面操作问题，不提供调试策略。

最后设置两个 comprehension checks：

- Which view represents source-level computation?
- How can you trace a source node to its generated constraint?

回答正确后进入正式实验。

---

# 三、Bug Localization Study

## 3.1 参与者

8名具有 Circom/ZK circuit 经验的专家可以开展 mixed-method expert study，但统计能力有限。因此论文中应以：

- descriptive statistics；
- paired effect sizes；
- qualitative process evidence；

为主，不要把显著性检验作为主要结论。

建议记录：

- Circom 使用年限；
- 是否开发过生产级 circuit；
- 是否参与过 ZK security audit；
- 熟悉的工具（平时都是如何 debug 的）；
- 对 R1CS 的熟悉程度；
- 是否见过实验案例的原始漏洞。

如果专家见过某个真实漏洞，应更换其任务案例。

## 3.2 四种任务类型

四种 error type 最好分别对应一项系统设计：

|Task|Error type 示例|主要验证的设计|
|---|---|---|
|T1|深层 component 错连|hierarchy navigation|
|T2|`<--` 或遗漏等式导致 missing constraint|coordinated views、provenance|
|T3|重复实例中的 index/constant anomaly|scope comparison|
|T4|Boolean/range enforcement 缺失|constraint view、property checking|

每种类型准备两个 matched examples：A和B。因此共有8个案例，但每位专家只完成4个案例，每种类型一个。

案例可以来自 0xPARC ZK Bug Tracker 和 zkBugs，但经过简化后应称为：

> simplified stimuli derived from documented real-world vulnerabilities

而不能直接称为 real-world cases。

## 3.3 Matched examples 的匹配

同一错误类型的A/B案例尽量控制：

- source lines of code；
- template hierarchy depth；
- component 数量；
- constraint 数量；
- bug 所在层级；
- intent description 长度；
- 正确定位所需的跨层次数；
- Source/Constraint Graph 的视觉复杂度。

每个案例必须有：

- property-verified clean version；
- vulnerable version；
- ground-truth component；
- ground-truth source statement；
- 对应 constraint evidence；
- root-cause explanation；
- 可行修复。

建议由两名未参与系统实现的 Circom 专家预先验证难度和 ground truth。

---

# 四、实验条件

## Baseline

“传统方式”必须标准化，不能让每位专家自由选择完全不同的环境。建议提供：

- VS Code 或统一代码编辑器；
- Circom source files；
- compiler output；
- `--inspect`；
- `.sym`；
- R1CS information；
- 允许使用的命令和工具列表。

是否允许 Circomspect，应根据 formative interview 中的真实工作流决定。一旦决定，所有参与者必须一致。

两种条件都应获得完全相同的：

- intent description；
- source code；
- compiler version；
- optimization setting；
- time limit（10min）；
- task prompt。

唯一不同是 CircomVis condition 可以使用其视觉视图、partial compilation 和集成检查。

## CircomVis

提供完整系统，包括：

- hierarchy navigation；
- Source Semantics Graph；
- Constraint Enforcement View；
- provenance links；
- scope comparison；
- partial compilation；
- formal property checking。

因此实验比较的是：

> CircomVis as an integrated visual debugging system versus the conventional workflow.

它不能单独证明某个 visual encoding 的因果效果；各视觉设计的作用需要通过日志和访谈解释。

---

# 五、平衡实验设计

## 5.1 Task order

标准 Latin square：

|Experts|Task order|
|---|---|
|E1, E2|T1 → T2 → T3 → T4|
|E3, E4|T2 → T3 → T4 → T1|
|E5, E6|T3 → T4 → T1 → T2|
|E7, E8|T4 → T1 → T2 → T3|

这样每种 task 都在每个顺序位置出现两次。

## 5.2 Example 与 condition 分配

下面是一套完全平衡的分配。`BL` 表示 baseline，`CV` 表示 CircomVis。

|Expert|T1|T2|T3|T4|
|---|---|---|---|---|
|E1|A–BL|A–CV|B–BL|B–CV|
|E2|B–CV|B–BL|A–CV|A–BL|
|E3|A–CV|A–BL|B–CV|B–BL|
|E4|B–BL|B–CV|A–BL|A–CV|
|E5|A–BL|B–CV|A–CV|B–BL|
|E6|B–CV|A–BL|B–BL|A–CV|
|E7|A–CV|B–BL|B–CV|A–BL|
|E8|B–BL|A–CV|A–BL|B–CV|

这套设计保证：

- 每位专家完成2个 baseline 和2个 CircomVis；
    
- 每种 error type 被8名专家检查；
    
- 每个 example 被4名专家检查；
    
- 每个 example 分别有2次 baseline 和2次 CircomVis；
    
- 每位专家不会看到同一 error type 的两个版本。
    

---

# 六、任务说明

可以明确告诉参与者：

> Each circuit contains one defect that makes the implementation or its enforced constraints inconsistent with the stated intent.

这样研究测量的是 bug localization and diagnosis，而不是 bug detection。

不要告诉他们：

- error type；
- buggy template；
- source line；
- 是否属于 underconstraint/overconstraint；
- 来源于哪个公开漏洞。

每个任务提供标准化 intent card：

1. circuit 的功能；
2. 输入和输出的语义；
3. 应满足的关键性质；
4. 需要提交的答案。

统一任务：

> Locate the defective component and identify the root cause. Explain how the implementation or generated constraints violate the stated intent, and provide supporting source- or constraint-level evidence.

---

# 七、定量指标

您提出的四个指标可以保留，但它们属于 secondary process metrics。还需要两个主要结果指标。

## 7.1 Primary outcome metrics

### 1. Diagnosis correctness

推荐0–4分 rubric：

|分数|结果|
|--:|---|
|0|未发现或定位错误|
|1|找到大致相关模块|
|2|找到正确 template/component|
|3|找到具体错误 statement/constraint|
|4|正确解释 root cause 以及它如何违反 intent|

由两名独立评审者根据 ground truth 盲评，并报告 inter-rater agreement。

同时可以从中得到两个二元指标：

- Component localization success；
- Complete diagnosis success，即得分为4。

### 2. Time to correct diagnosis

从任务开始到参与者提交完整且正确诊断的时间。

如果超时：

- 标记为 unsuccessful/timeout；
- 不要简单地把12分钟作为普通完成时间混入平均值；
- 分别报告 success rate 和成功任务的中位时间。

## 7.2 Secondary process metrics

### Time to first correct component

建议定义为：

> Time from task onset to the participant’s first explicit identification of the ground-truth component as suspicious.

不能仅用“第一次点击该 component”，因为参与者可能只是偶然经过。需要参与者点击 “Mark as suspicious”，或在 think-aloud 中明确指出。

### Number of false leads

定义为：

> The number of unique non-ground-truth components explicitly investigated or marked as possible root causes before the correct diagnosis.

不要把所有短暂点击都计算为 false lead。

### Navigation count

建议改名为：

> Cross-scope transition count

定义为从一个 template/component scope 切换到另一个 scope 的次数。Baseline 中的文件/template 切换与 CircomVis 中的 hierarchy transition 使用同一语义定义。

这个指标不一定“越少越好”。较多导航可能代表积极探索，因此应结合准确率和 false leads 解释。

### Provenance-trace success

不要只做 binary，可以使用0–2分：

|分数|定义|
|--:|---|
|0|未提供 source–constraint correspondence|
|1|找到相关 source 和 constraint，但映射或解释不完整|
|2|正确追踪 source node 到相关 constraint，并解释其诊断意义|

并不是所有 bug 都对应单一 constraint，因此每个案例应预先定义可接受的 provenance evidence。

## 7.3 Confidence

每个任务结束后询问：

> How confident are you that your diagnosis identifies the root cause?  
> 1 = not confident at all; 7 = completely confident.

应结合 correctness 分析，而不是单独报告平均信心：

- correct and confident；
- correct but uncertain；
- incorrect but overconfident。

还可以增加一个单项 mental effort：

> How mentally demanding was this task?  
> 1 = not demanding at all; 7 = extremely demanding.

如果希望使用有正式来源的工作负荷量表，可以采用 NASA-TLX，但每个小任务都填写完整 NASA-TLX 会打断实验。更实用的是每任务一个 mental-demand item，全部任务结束后再填写完整量表。[NASA-TLX 原始资料](https://ntrs.nasa.gov/api/citations/20000021487/downloads/20000021487.pdf)

---

# 八、交互与数据记录

两种条件都应记录：

- screen recording；
- audio/think-aloud；
- timestamped interaction logs；
- opened files/components；
- hierarchy transitions；
- source/constraint selections；
- provenance operations；
- partial compilation operations；
- suspicious-component marks；
- final diagnosis；
- task timeout。

需要提前编写 coding manual，明确：

- 什么算一次 false lead；
- 什么算进入 component；
- 什么算明确怀疑；
- 什么算 provenance success；
- 什么时间点算完成诊断。

抽取部分录像由第二名编码者独立编码，以验证一致性。

---

# 九、任务后的问卷和访谈

## 每个任务结束后

只填写：

1. diagnosis confidence；
2. mental demand；
3. 一句话说明主要证据。

控制在1分钟以内。

## 全部任务结束后：SUS

SUS 应在所有 CircomVis 任务结束后填写一次，而不是每个 task group 后重复填写。SUS 是10个题目的整体可用性量表，生成0–100的综合分数；单题不应分别解释。[Brooke, SUS](https://rickvanderzwet.nl/trac/personal/export/71/liacs/hci/docs/SUS-questionaire.pdf)

由于只有8名专家，建议报告：

- median；
- interquartile range；
- individual scores。

不要仅根据某个阈值宣布“系统可用”。

## Contribution-specific questionnaire

SUS 不能测量你的 visual design contribution，因此还需要5–7个自定义7点 Likert items。必须明确称为 study-specific items，而不是 validated scale。

例如：

1. The hierarchy view helped me narrow the search scope.
2. The coordinated views helped me distinguish source-level computation from constraint-level enforcement.
3. The provenance links helped me justify my diagnosis.
4. Scope comparison helped me identify anomalous components.
5. Partial compilation made large circuits easier to inspect.
6. The property checks helped me connect the stated intent with enforced constraints.
7. The visual representations increased my confidence in the diagnosis.

## Semi-structured interview

建议15–20分钟：

1. Which task was the most difficult, and why?
2. How did you decide where to inspect first?
3. At what point did you move from source-level reasoning to constraint-level reasoning?
4. Which visual evidence changed or confirmed your hypothesis?
5. Did provenance tracing help you explain the root cause rather than merely locate it?
6. Was partial compilation understandable and trustworthy?
7. Did any visual representation mislead you?
8. What could the conventional workflow do better?
9. Which CircomVis feature would be most valuable in your actual workflow?
10. What would prevent you from using it in production?

访谈转录后采用 thematic analysis。报告时可以参考 COREQ 中与研究者身份、访谈过程、编码和结果报告有关的项目，提高定性研究透明度。[COREQ reporting guideline](https://www.equator-network.org/reporting-guidelines/coreq/)

---

# 十、Bug Localization Study 的时间安排

|阶段|时间|
|---|--:|
|Consent 和研究说明|5 min|
|Background questionnaire|5 min|
|Baseline environment introduction|3 min|
|5分钟培训视频|5 min|
|Hands-on practice + comprehension check|5 min|
|4个正式任务|40–48 min|
|每任务短问卷|4 min|
|SUS + contribution-specific questionnaire|7 min|
|Semi-structured interview|15–20 min|
|合计|84–97 min|

建议安排一次5分钟休息，避免最后两个任务出现疲劳效应。

---

# 十一、统计分析

8名专家规模较小，因此以 participant 为分析单位，不能把32次任务记录当作32个独立参与者。

建议报告：

- 每位专家在 BL/CV 下的平均 diagnosis score；
- 每位专家在 BL/CV 下的 success rate；
- paired median difference；
- paired effect size；
- bootstrap confidence interval；
- exact permutation test 或 Wilcoxon signed-rank test，作为辅助分析；
- 按 error type 的描述性结果；
- interaction logs 与 think-aloud 的解释性证据。

不要过度强调 (p)-value。该研究更接近 Lam 等人所区分的“user performance evaluation + visual analysis and reasoning evaluation”的结合。[Lam et al., TVCG](https://petra.isenberg.cc/publications/papers/Lam_2012_ESI.pdf)

---

# 十二、Real-World Bug Investigation

这个阶段应当与受控实验明显不同：不再把代码简化成单一 toy bug，也不要求严格比较 baseline。

## 12.1 目标

主要研究：

- 专家如何在真实层级结构中形成和修正 debugging hypotheses；
- 是否能够利用 partial compilation 控制分析范围；
- 是否能够构造完整的 source–constraint evidence chain；
- 哪些真实工作流和代码结构超出系统当前支持范围。

## 12.2 案例选择

建议选择两个真实 Circom 项目，每个由4名专家检查。

案例应满足：

- 具有公开源码；
- 漏洞可复现；
- 有 audit report、修复 commit 或 PoC；
- 保留原始 hierarchical structure；
- 不把核心逻辑简化成 toy example；
- 规模足以体现 partial compilation；
- 属于 CircomVis 支持范围；
- 参与者没有事先见过；
- 文件名、目录名、注释中没有泄露答案。

可以移除构建依赖和无关文件，但不要改变 bug 的根因。建议称为：

> minimally packaged real-world cases

## 12.3 参与者与安排

可以使用同一批8名专家，但最好安排为第二次独立 session，间隔几天，避免第一阶段过长。

分配方式：

- E1–E4：Real Case A；
- E5–E8：Real Case B。

如果担心每个案例只有4人，也可以让8人都检查同一个案例，但会降低真实案例覆盖面。对于探索性实验，我更推荐两个案例。

## 12.4 任务提示

向专家提供：

- 项目背景；
- security/function requirement；
- 输入输出语义；
- 可用文档。

但不提供：

- bug 类型；
- bug 位置；
- 审计报告；
- 修复 commit；
- 漏洞名称。

任务：

> Investigate whether the circuit implementation and its enforced constraints are consistent with the stated requirement. Report any defect you identify, its location, supporting source- and constraint-level evidence, and its possible consequence.

与受控实验不同，可以不明确告诉参与者一定有 bug。也可以准备 vulnerable/patched 两个版本，在参与者间随机分配，从而观察 false-positive behavior，但不要让同一专家同时看到两版。

## 12.5 实验流程

|阶段|时间|
|---|--:|
|系统与案例背景回顾|5 min|
|阅读 requirement 和项目结构|5–10 min|
|Open-ended investigation|30–40 min|
|Structured diagnosis report|5–10 min|
|Post-task interview|15 min|
|合计|60–80 min|

探索阶段采用 concurrent think-aloud，但其完成时间不能与非 think-aloud 的 Phase 1 直接比较，因为 verbalization 本身会影响速度。

## 12.6 Structured diagnosis report

要求专家提交：

1. Bug present / no confirmed bug；
2. Suspicious template/component；
3. Source statement；
4. Violated intended property；
5. Relevant constraint evidence；
6. Potential security or functional consequence；
7. Confidence；
8. Possible repair，可选。

## 12.7 结果指标

定量结果只作描述性报告：

- correct root-cause identification；
- correct component localization；
- time to evidence-backed diagnosis；
- evidence completeness score；
- number of hypotheses generated；
- number of hypothesis revisions；
- number and depth of partial scopes inspected；
- provenance usage；
- confidence。

重点应放在定性结果：

- 专家如何缩小 scope；
- 如何在双视图间转换；
- 什么证据促使其确认或放弃假设；
- partial compilation 是否保持了足够上下文；
- 系统在哪些真实结构上失效；
- 专家是否信任约束级证据。

---

# 十三、最终论文中的 Evaluation 结构

```latex
\section{Evaluation}

\subsection{Case Studies}
% Authors demonstrate complete debugging workflows.

\subsection{Controlled Expert Study}
\subsubsection{Participants and Apparatus}
\subsubsection{Study Design and Tasks}
\subsubsection{Measures}
\subsubsection{Quantitative Results}
\subsubsection{Debugging Strategies and Expert Feedback}

\subsection{Exploratory Real-World Investigation}
\subsubsection{Cases and Procedure}
\subsubsection{Evidence-based Diagnoses}
\subsubsection{Observed Workflows and Limitations}

\subsection{Interview with the Circom Development Team}
```

最终，这两个实验形成了很完整的证据链：

- 受控实验说明 CircomVis 是否改善定位和诊断；
- 交互日志说明哪些视觉机制改变了 debugging process；
- 真实案例说明系统能否进入实际 Circom debugging workflow；
- iden3 interview 进一步验证领域问题、设计合理性和生态价值。

这是比单纯做一个“专家觉得系统好不好用”的 usability study 更符合 TVCG visual debugging 论文定位的设计。

