# Backend Server

CircomViz 后端服务器，负责 Circom 电路的解析、编译和分析。

## 目录结构

```
Backend/
├── src/
│   ├── core/                    # 核心解析引擎
│   │   ├── project/            # 项目管理
│   │   │   ├── types.ts       # 项目类型定义
│   │   │   ├── loadProject.ts # 项目加载器
│   │   │   └── pathGuard.ts  # 路径验证工具
│   │   ├── resolver/            # Include 解析
│   │   │   ├── includeResolver.ts   # Include 路径解析
│   │   │   └── dependencyGraph.ts  # 依赖图构建
│   │   └── parser/             # Circom 解析器
│   │       ├── ast.ts        # AST 节点定义
│   │       ├── lexer.ts      # 词法分析器
│   │       ├── parser.ts     # 语法分析器
│   │       └── __tests__/   # 单元测试
│   │           ├── lexer.test.ts
│   │           └── parser.test.ts
│   ├── server/                  # 服务器路由
│   │   └── routes/
│   │       └── parseCircuit.ts # 电路解析 API
│   ├── scripts/                 # 现有编译脚本
│   │   ├── compilation.ts
│   │   └── buildQAP.ts
│   ├── types/                  # 类型定义
│   │   └── constraint.ts
│   ├── utils/                  # 工具类
│   │   ├── fs.ts         # 文件系统工具
│   │   ├── errors.ts     # 错误处理
│   │   └── logger.ts     # 日志工具
│   ├── index.ts                # 服务器入口
│   └── core/index.ts           # 核心模块导出
├── circomlib/               # Circom 标准库
├── compilations/            # 编译输出目录
├── dist/                    # 编译输出
├── .env                     # 环境变量
├── package.json             # 依赖配置
└── tsconfig.json           # TypeScript 配置
```

## 核心模块说明

### Project 模块（`core/project/`）

负责项目加载和路径管理：

- **types.ts**: 定义项目配置、文件信息等类型
- **loadProject.ts**: `ProjectLoader` 类，加载 Circom 项目、解析文件
- **pathGuard.ts**: `PathGuard` 类，验证路径、解析各种 include 路径

### Resolver 模块（`core/resolver/`）

负责解析 include 语句和构建依赖图：

- **includeResolver.ts**: `IncludeResolver` 类，解析各种类型的 include 路径
  - 相对路径：`./local.circom`
  - circomlib：`circomlib/circuits/bitify.circom`
  - npm 包：`@zk-email/zk-regex-circom/circuits/...`
  - 绝对路径
  
- **dependencyGraph.ts**: `DependencyGraph` 类，构建文件依赖关系图
  - 检测循环依赖
  - 拓扑排序
  - 统计依赖深度

### Parser 模块（`core/parser/`）

完整的 Circom 语法解析器：

- **ast.ts**: 定义所有 AST 节点类型
  - 顶级节点：Pragma, Include, TemplateDefinition, FunctionDefinition
  - 语句节点：Assignment, IfStatement, ForLoop, Assert
  - 表达式节点：Literal, Identifier, BinaryOp, FunctionCall 等
  
- **lexer.ts**: `CircomLexer` 类，词法分析
  - 识别 token：关键字、标识符、数字、运算符等
  - 跳过注释和空白字符
  - 行号追踪
  
- **parser.ts**: `CircomParser` 类，语法分析
  - 解析 template 定义
  - 解析 component 实例化
  - 解析 signal 和 variable 声明
  - 解析表达式（支持运算符优先级）

## Utils 模块（`utils/`）

通用工具类：

- **fs.ts**: `FsUtils` 类，文件系统操作
  - 安全的文件读取
  - 目录复制
  - 文件列表
  
- **errors.ts**: 错误处理
  - `ErrorCollector`: 收集解析错误和警告
  - `CircomParseError`: 自定义错误类型
  
- **logger.ts**: `Logger` 类，日志工具
  - 多级别日志（DEBUG, INFO, WARN, ERROR）
  - 上下文标记

## 编译流程

现有的编译流程（`scripts/`）：

1. **compilation.ts**: 调用 circom 编译器
   - 解析 `.sym` 文件
   - 解析 `constraints.json` 文件
   - 解析 `substitutions.json` 文件

2. **buildQAP.ts**: R1CS 转 QAP
   - 拉格朗日插值
   - 构建多项式

## 新功能：电路解析

新增的解析功能（`core/`）：

1. **加载项目**: 根据 `repo + entry` 加载项目
2. **解析源码**: 词法分析 → 语法分析 → AST
3. **解析 include**: 递归解析所有 include 文件
4. **构建依赖图**: 分析文件依赖关系
5. **展开组件树**: 从入口组件递归展开（阶段 3）

## API 接口

### 现有 API

- `POST /generateCircuit`: 编译 Circom 代码
  - 请求：`{ code: string }`
  - 响应：电路数据、QAP 数据

### 计划 API（阶段 3）

- `POST /parseCircuit`: 解析 Circom 项目结构
  - 请求：`{ repo: string, entry: string, rootComponent?: string }`
  - 响应：模板树、文件列表、错误信息

## 开发指南

### 运行开发服务器

```bash
cd Backend
pnpm install
pnpm run build
pnpm run start
```

### 运行测试

```bash
cd Backend
npx jest src/core/parser/__tests__/lexer.test.ts
npx jest src/core/parser/__tests__/parser.test.ts
```

### 添加新功能

1. 在相应模块中添加代码
2. 在 `__tests__/` 中添加单元测试
3. 运行测试确保功能正确
4. 更新此 README 文档

## 依赖说明

- **Fastify**: Web 服务器框架
- **@fastify/cors**: CORS 支持
- **dotenv**: 环境变量管理
- **circom**: Circom 编译器（需要单独安装）
- **circomlib**: Circom 标准库（git submodule）

## 环境变量

`.env` 文件配置：

```env
P=21888242871839275222246405745257275088548364400416034343698204186575808495617
```

- `P`: BN128 曲线的素数

## 注意事项

1. **模块化设计**: 每个模块职责单一，便于维护和测试
2. **TypeScript 严格模式**: 所有文件必须通过类型检查
3. **错误处理**: 使用 `ErrorCollector` 统一收集错误
4. **日志记录**: 使用 `Logger` 进行调试和信息输出
5. **路径处理**: 始终使用 `PathGuard` 处理路径，确保跨平台兼容
