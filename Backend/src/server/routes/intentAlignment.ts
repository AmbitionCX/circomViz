import { FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs/promises';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { IncludeResolver } from '../../core/resolver/includeResolver.js';
import { ErrorCollector } from '../../utils/errors.js';
import {
  parseSymFile,
  parseConstraintsFile,
  formatConstraintWithNames,
  type SymEntry,
} from '../../core/utils/symbolParser.js';
import {
  normalizeConstraints,
  clusterSignalsByComponentPath,
  buildInterfaceSummary,
  getRepresentativeInvariants,
  summarizeInvariants,
  type NormalizedInvariant,
  type SubcomponentCluster,
  type InterfaceSummary,
} from '../../core/utils/constraintNormalizer.js';
import { callLLMStructured } from '../../core/llm/llmClient.js';
import { logger } from '../../utils/logger.js';
import type {
  AssignmentNode,
  ExpressionNode,
  TemplateDefinitionNode,
  SignalNode,
  ComponentInstantiationNode,
  ASTNode,
} from '../../core/parser/ast.js';

interface intent_alignment_request {
  repo: string;
  entry: string;
  symPath: string;
  constraintsJsonPath: string;
  constraintIndices?: number[];
  templatePath: string[];
  templateName: string;
  groupingStrategy?: string;
}

interface LLMGroupResult {
  summary: string;
  candidateSpecDSL: string;
  ambiguities: string[];
  riskNotes: string[];
}

export interface NormalizedContext {
  interfaceSummary: InterfaceSummary;
  subcomponentClusters: SubcomponentCluster[];
  invariantSummary: string;
  representativeInvariants: NormalizedInvariant[];
  totalConstraints: number;
  templateSignature: string;
  callerInfo: string;
}

interface IntentAlignmentGroup {
  groupId: string;
  sourceFile: string;
  templateName: string;
  lineRange: [number, number];
  normalizedContext: NormalizedContext;
  sourceSnippet: string;
  metadata: {
    signals: { name: string; kind: string }[];
    subcomponents: { name: string; templateName: string }[];
    parameters: string[];
    comments: string[];
  };
  llmResult: LLMGroupResult | null;
  error?: string;
}

interface intent_alignment_response {
  success: boolean;
  groups: IntentAlignmentGroup[];
  error?: string;
}

const SYSTEM_PROMPT = `You are a ZK circuit analysis expert specializing in circom circuits.
You will receive a STRUCTURED CONTEXT PACKAGE for a template — NOT raw R1CS constraints.
The package contains: interface summary (inputs/outputs, public/private, boolean flags),
subcomponent clusters (from .sym qualified names), normalized invariant patterns,
representative constraints, AST constraint statements, source code, and comments.

Your job is to reason from naming, structure, and local patterns to infer intent.
You are NOT expected to reverse-engineer from raw R1CS — the normalization has already been done for you.

Return a JSON object with EXACTLY these 4 fields:

1. "summary" (string, in Chinese): 一段自然语言摘要，描述这段代码在做什么。
   关注：这个 template 的整体目的、输入输出的语义角色、子组件的功能组合方式。
   示例格式："该模板实现了对 Aadhaar QR 码中签名完整性的验证。通过 RSA 验证子组件校验签名，
   提取年龄/性别/PIN 码字段，并使用 Poseidon 哈希计算 nullifier 和 pubkeyHash。
   revealAgeAbove18 等信号作为 disclosure toggle 控制哪些字段被公开。"

2. "candidateSpecDSL" (string, in English): 供下一层 formal conformance 使用的候选规范。
   使用结构化 DSL 格式：
   assumptions:
     - signal_name in {0,1}   // for boolean flags
     - signal_name is public/private
   post:
     - output = H(input)     // hash constraints
     - output = sel * value  // selector/gate constraints
     - nullifier = N(seed, pubkeyHash)
   invariants:
     - bool_signal is boolean
     - out = a * b
   示例：
   assumptions:
     - revealAgeAbove18 in {0,1}
     - revealGender in {0,1}
     - revealPinCode in {0,1}
     - revealState in {0,1}
   post:
     - pubkeyHash = H(pubKey)
     - nullifier = N(nullifierSeed, pubkeyHash)
     - ageAbove18 = revealAgeAbove18 * extractedAgeAbove18
     - gender = revealGender * extractedGender
   invariants:
     - [12 boolean constraints detected]
     - [multiplication patterns for selector gating]

3. "ambiguities" (string array, in Chinese): 歧义点清单 — 代码中哪些地方可能有多种解读，
   需要用户确认。例如：
   - "revealAgeAbove18 看起来是 disclosure toggle，但也可能直接存储年龄比较结果"
   - "nullifier 的计算是否包含额外 salt 不得而知"

4. "riskNotes" (string array, in Chinese): 风险提示 — 代码行为可能比命名更宽或更窄的地方。
   例如：
   - "selector gate 约束未覆盖所有可能的中间信号，可能存在未约束的自由变量"
   - "某些 private signal 可能通过侧信道被推断"

Be precise and technical. Output valid JSON only.`;

function serializeExpr(expr: ExpressionNode): string {
  if (!expr) return '';
  switch (expr.type) {
    case 'Literal': return String(expr.value);
    case 'Identifier': return expr.name;
    case 'BinaryOp': return `${serializeExpr(expr.left)} ${expr.operator} ${serializeExpr(expr.right)}`;
    case 'UnaryOp':
      if (expr.isPostfix) return `${serializeExpr(expr.operand)}${expr.operator}`;
      return `${expr.operator}(${serializeExpr(expr.operand)})`;
    case 'ArrayAccess': return `${serializeExpr(expr.array)}[${serializeExpr(expr.index)}]`;
    case 'MemberAccess': return `${serializeExpr(expr.object)}.${expr.property}`;
    case 'FunctionCall': return `${expr.function}(${expr.arguments.map(serializeExpr).join(', ')})`;
    case 'ComponentCall':
      return `${expr.template}(${expr.templateArgs.map(serializeExpr).join(', ')})`;
    case 'Ternary':
      return `${serializeExpr(expr.condition)} ? ${serializeExpr(expr.thenExpr)} : ${serializeExpr(expr.elseExpr)}`;
    case 'Tuple': return `(${expr.elements.map(serializeExpr).join(', ')})`;
    case 'ArrayLiteral': return `[${expr.elements.map(serializeExpr).join(', ')}]`;
    default: return '';
  }
}

interface TemplateContext {
  name: string;
  sourceFile: string;
  line: number;
  parameters: string[];
  signals: Array<{ name: string; kind: string }>;
  subcomponents: Array<{ name: string; templateName: string; args: string }>;
  constraintInfos: Array<{
    operator: string;
    line: number;
    rawText: string;
    signalsMentioned: string[];
  }>;
}

function extractSignalsFromExpr(expr: ExpressionNode): string[] {
  const signals = new Set<string>();
  function walk(node: ExpressionNode): void {
    if (!node) return;
    if (node.type === 'Identifier') signals.add(node.name);
    else if (node.type === 'BinaryOp') { walk(node.left); walk(node.right); }
    else if (node.type === 'Ternary') { walk(node.condition); walk(node.thenExpr); walk(node.elseExpr); }
    else if (node.type === 'UnaryOp') walk(node.operand);
    else if (node.type === 'ArrayAccess') { walk(node.array); walk(node.index); }
    else if (node.type === 'MemberAccess') walk(node.object);
    else if (node.type === 'FunctionCall') node.arguments.forEach(walk);
    else if (node.type === 'ComponentCall') { node.templateArgs.forEach(walk); node.callArgs.forEach(walk); }
    else if (node.type === 'Tuple') node.elements.forEach(walk);
    else if (node.type === 'ArrayLiteral') node.elements.forEach(walk);
  }
  walk(expr);
  return Array.from(signals);
}

function walkASTToExtractContext(
  ast: ASTNode[],
  templateContexts: TemplateContext[],
  sourceFile: string
): void {
  for (const node of ast) {
    if (node.type === 'TemplateDefinition') {
      const tpl = node as TemplateDefinitionNode;
      const ctx: TemplateContext = {
        name: tpl.name,
        sourceFile: sourceFile,
        line: tpl.line,
        parameters: tpl.parameters.map(p => p.name),
        signals: tpl.signals.map((s: SignalNode) => ({ name: s.name, kind: s.kind })),
        subcomponents: [],
        constraintInfos: [],
      };

      for (const comp of tpl.components) {
        if (comp.type === 'ComponentInstantiationNode') {
          const ci = comp as ComponentInstantiationNode;
          ctx.subcomponents.push({
            name: ci.name,
            templateName: ci.templateName,
            args: ci.arguments.map(serializeExpr).join(', '),
          });
        }
      }

      for (const stmt of tpl.statements) {
        if (stmt.type === 'Assignment') {
          const assignment = stmt as AssignmentNode;
          if (['<==', '==>', '==='].includes(assignment.operator)) {
            const leftSignals = extractSignalsFromExpr(assignment.left);
            const rightSignals = extractSignalsFromExpr(assignment.right);
            ctx.constraintInfos.push({
              operator: assignment.operator,
              line: assignment.line,
              rawText: `${serializeExpr(assignment.left)} ${assignment.operator} ${serializeExpr(assignment.right)};`,
              signalsMentioned: [...new Set([...leftSignals, ...rightSignals])],
            });
          }
        }
      }

      templateContexts.push(ctx);
    }
  }
}

async function extractCommentsNearLines(
  filePath: string,
  lineNumbers: number[],
  window: number = 5
): Promise<string[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const comments: string[] = [];
    const minLine = Math.max(0, Math.min(...lineNumbers) - window);
    const maxLine = Math.min(lines.length - 1, Math.max(...lineNumbers) + window);

    for (let i = minLine; i <= maxLine; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//')) {
        comments.push(`L${i + 1}: ${trimmed}`);
      } else if (trimmed.includes('//')) {
        const commentPart = trimmed.split('//')[1]?.trim();
        if (commentPart) comments.push(`L${i + 1}: // ${commentPart}`);
      }
    }
    return comments;
  } catch {
    return [];
  }
}

async function extractSourceSnippet(filePath: string, startLine: number, endLine: number): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length - 1, endLine - 1);
    return lines.slice(start, end + 1)
      .map((line, idx) => `${start + idx + 1}: ${line}`)
      .join('\n');
  } catch {
    return `// Could not read ${filePath}`;
  }
}

interface ConstraintGrouping {
  groupId: string;
  sourceFile: string;
  templateName: string;
  lineRange: [number, number];
  templateContext: TemplateContext;
}

function buildTemplateGroups(templateContexts: TemplateContext[], targetTemplateName: string): ConstraintGrouping[] {
  const groups: ConstraintGrouping[] = [];
  for (const ctx of templateContexts) {
    if (ctx.name !== targetTemplateName) continue;
    const startLine = ctx.constraintInfos.length > 0
      ? Math.min(...ctx.constraintInfos.map(c => c.line))
      : ctx.line;
    const endLine = ctx.constraintInfos.length > 0
      ? Math.max(...ctx.constraintInfos.map(c => c.line))
      : ctx.line;
    groups.push({
      groupId: `${ctx.name}@${ctx.sourceFile}`,
      sourceFile: ctx.sourceFile,
      templateName: ctx.name,
      lineRange: [startLine, endLine],
      templateContext: ctx,
    });
  }
  return groups;
}

function buildStructuredPrompt(
  ctx: NormalizedContext,
  templateContext: TemplateContext,
  sourceSnippet: string,
  comments: string[],
): string {
  const parts: string[] = [];

  parts.push('=== STRUCTURED CONTEXT PACKAGE ===');
  parts.push('');

  parts.push('## 1. Template Signature');
  parts.push(ctx.templateSignature);
  parts.push('');

  if (ctx.callerInfo) {
    parts.push('## 2. Caller Info');
    parts.push(ctx.callerInfo);
    parts.push('');
  }

  parts.push('## 3. Interface Summary');
  const iface = ctx.interfaceSummary;
  const inputs = templateContext.signals.filter(s => s.kind === 'input');
  const outputs = templateContext.signals.filter(s => s.kind === 'output');
  parts.push(`Inputs: ${inputs.map(s => s.name).join(', ') || '(none)'}`);
  parts.push(`Outputs: ${outputs.map(s => s.name).join(', ') || '(none)'}`);
  parts.push(`Public signals (${iface.publicSignals.length}): ${iface.publicSignals.join(', ') || '(none)'}`);
  parts.push(`Private signals (${iface.privateSignals.length}): ${iface.privateSignals.join(', ') || '(none)'}`);
  if (iface.likelyBooleanFlags.length > 0) {
    parts.push(`Likely boolean flags: ${iface.likelyBooleanFlags.join(', ')}`);
  }
  if (iface.likelyCommitments.length > 0) {
    parts.push(`Likely commitments/nullifiers: ${iface.likelyCommitments.join(', ')}`);
  }
  if (iface.likelyHashes.length > 0) {
    parts.push(`Likely hash/digest outputs: ${iface.likelyHashes.join(', ')}`);
  }
  parts.push('');

  parts.push('## 4. Subcomponent Clusters (from .sym qualified names)');
  for (const cluster of ctx.subcomponentClusters) {
    const sigCount = cluster.signals.length;
    const pubCount = cluster.publicSignals.length;
    const privCount = cluster.privateSignals.length;
    parts.push(`  ${cluster.prefix}: ${sigCount} signals (${pubCount} pub, ${privCount} priv)`);
  }
  parts.push('');

  parts.push('## 5. Normalized Invariant Summary');
  parts.push(ctx.invariantSummary);
  parts.push('');

  parts.push('## 6. Representative Constraints (by pattern)');
  for (const inv of ctx.representativeInvariants) {
    parts.push(`  [${inv.kind}] ${inv.description}`);
  }
  parts.push('');

  parts.push('## 7. AST Constraint Statements');
  for (const ci of templateContext.constraintInfos) {
    parts.push(`  L${ci.line}: ${ci.rawText}`);
  }
  if (templateContext.subcomponents.length > 0) {
    parts.push('## 8. Subcomponent Instantiations');
    for (const sc of templateContext.subcomponents) {
      parts.push(`  ${sc.name}: ${sc.templateName}(${sc.args})`);
    }
  }
  parts.push('');

  parts.push('## 9. Source Code');
  parts.push('```');
  parts.push(sourceSnippet);
  parts.push('```');
  parts.push('');

  if (comments.length > 0) {
    parts.push('## 10. Comments');
    for (const c of comments) {
      parts.push(`  ${c}`);
    }
    parts.push('');
  }

  parts.push('=== END CONTEXT PACKAGE ===');
  return parts.join('\n');
}

export async function intentAlignmentHandler(
  request: FastifyRequest<{ Body: intent_alignment_request }>,
  reply: FastifyReply
) {
  try {
    const {
      repo,
      entry,
      symPath,
      constraintsJsonPath,
      constraintIndices,
      templatePath,
      templateName,
    } = request.body;

    logger.info(`Running intent alignment: repo=${repo}, entry=${entry}, template=${templateName}`);
    console.log(`[IntentAlign] Starting: repo=${repo}, entry=${entry}, template=${templateName}`);

    const errorCollector = new ErrorCollector();
    const projectLoader = new ProjectLoader();
    const includeResolver = new IncludeResolver(errorCollector);

    console.log(`[IntentAlign] Loading project...`);
    const loadResult = await projectLoader.loadProject({
      repoName: repo,
      entryPath: entry,
      rootComponent: 'main',
      basePath: '',
    });
    console.log(`[IntentAlign] Project loaded: repoPath=${loadResult.repoPath || 'null'}, error=${loadResult.error || 'none'}`);

    if (loadResult.error) {
      return reply.code(400).send({
        success: false,
        groups: [],
        error: `Failed to load project: ${loadResult.error}`,
      });
    }

    const entryFile = loadResult.entryFile;
    const repoPath = loadResult.repoPath || '';

    if (repoPath) {
      includeResolver.setCurrentRepoPath(repoPath);
    }
    includeResolver.setCurrentFile(entryFile.path);

    const templateContexts: TemplateContext[] = [];
    const filesToProcess = [entryFile];
    const processedPaths = new Set<string>();

    console.log(`[IntentAlign] Parsing project files...`);
    while (filesToProcess.length > 0) {
      const currentFile = filesToProcess.shift()!;
      const normalizedPath = currentFile.path.replace(/\\/g, '/');

      if (processedPaths.has(normalizedPath)) continue;
      processedPaths.add(normalizedPath);

      try {
        // console.log(`[IntentAlign] Parsing: ${normalizedPath}`);
        const parsedFile = await projectLoader.parseFile(currentFile.path);
        walkASTToExtractContext(parsedFile.ast, templateContexts, normalizedPath);
        // console.log(`[IntentAlign]   ${parsedFile.templates.length} templates, ${parsedFile.includes.length} includes`);

        for (const include of parsedFile.includes) {
          includeResolver.setCurrentFile(normalizedPath);
          const resolvedPath = await includeResolver.resolveInclude(include);
          if (resolvedPath) {
            const normalizedIncludePath = resolvedPath.replace(/\\/g, '/');
            if (!processedPaths.has(normalizedIncludePath)) {
              try {
                const content = await fs.readFile(resolvedPath, 'utf-8');
                filesToProcess.push({ path: resolvedPath, content, relativePath: include.path });
              } catch {
                logger.warn(`Cannot read included file: ${normalizedIncludePath}`);
              }
            }
          }
        }
      } catch (error: any) {
        logger.warn(`Failed to parse file ${normalizedPath}: ${error.message}`);
      }
    }

    console.log(`[IntentAlign] Parsed ${processedPaths.size} files, ${templateContexts.length} templates`);

    console.log(`[IntentAlign] Reading .sym: ${symPath}`);
    const symEntries = await parseSymFile(symPath);
    console.log(`[IntentAlign] ${symEntries.length} symbol entries`);

    console.log(`[IntentAlign] Reading constraints: ${constraintsJsonPath}`);
    let constraints = await parseConstraintsFile(constraintsJsonPath);

    if (constraintIndices && constraintIndices.length > 0) {
      const indexSet = new Set(constraintIndices);
      const originalLen = constraints.length;
      constraints = constraints.filter((_, i) => indexSet.has(i));
      console.log(`[IntentAlign] Filtered constraints: ${constraints.length}/${originalLen} (slice scope)`);
    }

    console.log(`[IntentAlign] ${constraints.length} constraints`);

    console.log(`[IntentAlign] Normalizing constraints...`);
    const { invariants, indexToName } = normalizeConstraints(constraints, symEntries);
    console.log(`[IntentAlign] Normalization complete`);

    console.log(`[IntentAlign] Clustering signals by component path...`);
    const clusters = clusterSignalsByComponentPath(symEntries, constraints);
    console.log(`[IntentAlign] ${clusters.length} subcomponent clusters:`, clusters.map(c => `${c.prefix} (${c.signals.length} sigs)`));

    const representativeInvariants = getRepresentativeInvariants(invariants, 3);
    const invariantSummary = summarizeInvariants(invariants);
    console.log(`[IntentAlign] Invariant summary:\n${invariantSummary}`);

    const templateGroups = buildTemplateGroups(templateContexts, templateName);
    console.log(`[IntentAlign] Filtered to ${templateGroups.length} group(s) for selected template: ${templateName}`);

    const groups: IntentAlignmentGroup[] = [];

    for (let gi = 0; gi < templateGroups.length; gi++) {
      const grouping = templateGroups[gi];
      const tplCtx = grouping.templateContext;
      console.log(`[IntentAlign] --- Group ${gi + 1}/${templateGroups.length}: ${tplCtx.name} (${grouping.sourceFile}) ---`);

      console.log(`[IntentAlign]   Building interface summary...`);
      const interfaceSummary = buildInterfaceSummary(symEntries, tplCtx.signals, invariants);
      interfaceSummary.templateName = tplCtx.name;

      const relevantClusters = clusters.filter(c =>
        c.prefix === `main.${tplCtx.name}` ||
        c.prefix.startsWith(`main.${tplCtx.name}.`)
      );

      const inputs = tplCtx.signals.filter(s => s.kind === 'input').map(s => s.name);
      const outputs = tplCtx.signals.filter(s => s.kind === 'output').map(s => s.name);
      const params = tplCtx.parameters.join(', ');

      const templateSignature = `template ${tplCtx.name}(${params}) { input ${inputs.join(', ')}; output ${outputs.join(', ')}; }`;
      const callerInfo = templatePath.length > 0
        ? `Called from: ${templatePath.join(' -> ')} -> ${tplCtx.name}`
        : '';

      const normalizedContext: NormalizedContext = {
        interfaceSummary,
        subcomponentClusters: relevantClusters,
        invariantSummary,
        representativeInvariants,
        totalConstraints: constraints.length,
        templateSignature,
        callerInfo,
      };

      const sourceSnippet = await extractSourceSnippet(
        grouping.sourceFile,
        grouping.lineRange[0],
        grouping.lineRange[1]
      );
      const constraintLines = tplCtx.constraintInfos.map(c => c.line);
      const comments = await extractCommentsNearLines(grouping.sourceFile, constraintLines);

      console.log(`[IntentAlign]   Building structured prompt...`);
      const userPrompt = buildStructuredPrompt(normalizedContext, tplCtx, sourceSnippet, comments);
      console.log(`[IntentAlign]   Prompt length: ${userPrompt.length} chars`);

      console.log(`[IntentAlign]   Calling LLM...`);
      const llmStart = Date.now();
      const llmResult = await callLLMStructured<{
        summary: string;
        candidateSpecDSL: string;
        ambiguities: string[];
        riskNotes: string[];
      }>(SYSTEM_PROMPT, userPrompt);
      console.log(`[IntentAlign]   LLM done in ${Date.now() - llmStart}ms, success=${llmResult.success}`);

      const group: IntentAlignmentGroup = {
        groupId: grouping.groupId,
        sourceFile: grouping.sourceFile,
        templateName: grouping.templateName,
        lineRange: grouping.lineRange,
        normalizedContext,
        sourceSnippet,
        metadata: {
          signals: tplCtx.signals,
          subcomponents: tplCtx.subcomponents.map(sc => ({
            name: sc.name,
            templateName: sc.templateName,
          })),
          parameters: tplCtx.parameters,
          comments,
        },
        llmResult: null,
      };

      if (llmResult.success) {
        group.llmResult = {
          summary: llmResult.data.summary || '',
          candidateSpecDSL: llmResult.data.candidateSpecDSL || '',
          ambiguities: Array.isArray(llmResult.data.ambiguities) ? llmResult.data.ambiguities : [],
          riskNotes: Array.isArray(llmResult.data.riskNotes) ? llmResult.data.riskNotes : [],
        };
        console.log(`[IntentAlign]   summary="${(llmResult.data.summary || '').substring(0, 100)}..."`);
      } else {
        group.error = llmResult.error;
        console.error(`[IntentAlign]   LLM error: ${llmResult.error}`);
      }

      groups.push(group);
    }

    logger.info(`Intent alignment completed: ${groups.length} groups`);
    reply.send({ success: true, groups } as intent_alignment_response);
  } catch (error: any) {
    logger.error(`Error running intent alignment: ${error.message}`);
    reply.code(500).send({
      success: false,
      groups: [],
      error: error.message,
    });
  }
}
