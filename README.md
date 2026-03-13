# circomViz

- node version: v18.20.4
- pnpm version: 9.5.0

## Initial setup for Frontend
The frontend is built with **Vite + Vue3 + TypeScript + Element-Plus + Tailwind CSS**. To run the frontend, run the following command in the root directory of the project:

```shell
cd Frontend
pnpm install
pnpm run dev
```

## Initial setup for Backend

Install [circom](https://github.com/iden3/circom) before running the backend. You can download from [GitHub release page](https://github.com/iden3/circom/releases) (recommended), and make it executable by running:
```shell
chmod +x ./circom-linux-amd64
cp ./circom-linux-amd64 /usr/local/bin/circom
circom --version
```
Or build manually:
```shell
git clone https://github.com/iden3/circom.git
cargo build --release
cargo install --path circom
# install the circom binary in the directory $HOME/.cargo/bin
circom --version
```

The backend is built with **TypeScript + Fastify**. To run the backend, run the following command in the root directory of the project:
```shell
pnpm install
pnpm run build
pnpm run start
```

## Submodules
These submodules are used as a small real-world Circom corpus for parsing experiments. They cover diverse application domains, including email verification, Aadhaar-based identity proofs, JWT/OIDC social login, anonymous group membership, and anonymous voting. Together, they provide varied circuit organizations, dependency styles, and template structures for benchmarking include resolution, template extraction, and component-tree construction.

- **anon-aadhaar**: A Circom circuit implementation of the Anon Aadhaar protocol, centered around Aadhaar QR data verification, signature validation, information extraction, and nullifier generation. Its circuits README explicitly outlines the main entry point and auxiliary module structure.

- **zksync-social-login-circuit**: A circuit for validating JWT/OIDC social login credentials. The primary circuit is jwt-tx-validation.circom, which leverages a mix of local utils/* libraries, circomlib, and @zk-email/circuits dependencies.

- **zk-franchise-proof-circuit**: Vocdoni's anonymous voting census proof circuit, with the main circuit located at circuit/census.circom. It relies on Poseidon, comparators, and SMTVerifier, making it suitable for analyzing proof structures related to voting and membership.

- **semaphore**: An anonymous member proof circuit for Semaphore, whose core logic encompasses identity commitment, Merkle membership proof, and nullifier generation. It is well-suited for analyzing Circom templates characterized by clear structure but library-centric design.

- **zk-email-verify**: The core circuit library for ZK Email, primarily used for email signature verification, DKIM/RSA-related proofs, and reusable Circom tool templates. Its @zk-email/circuits component functions more as a circuit library rather than a single main entry application.

## Backend Architecture

### Directory Structure

```
Backend/src/
├── core/                      # 核心解析引擎（新增）
│   ├── project/                # 项目管理
│   │   ├── types.ts          # 项目类型定义
│   │   ├── loadProject.ts    # 项目加载器
│   │   └── pathGuard.ts     # 路径验证工具
│   ├── resolver/                # Include 解析
│   │   ├── includeResolver.ts # Include 路径解析
│   │   └── dependencyGraph.ts # 依赖图构建
│   └── parser/                 # Circom 解析器
│       ├── ast.ts            # AST 节点定义
│       ├── lexer.ts          # 词法分析器
│       ├── parser.ts         # 语法分析器
│       └── __tests__/       # 单元测试
│           ├── lexer.test.ts
│           └── parser.test.ts
├── server/                    # 服务器路由
│   └── routes/
│       └── parseCircuit.ts  # 电路解析 API
├── scripts/                   # 现有编译脚本
│   ├── compilation.ts
│   └── buildQAP.ts
├── types/                     # 类型定义
│   └── constraint.ts
├── utils/                     # 工具类（新增）
│   ├── fs.ts             # 文件系统工具
│   ├── errors.ts         # 错误处理
│   └── logger.ts         # 日志工具
├── index.ts                   # 服务器入口
└── core/index.ts              # 核心模块导出
```

### Core Modules

#### Project Module (`core/project/`)
- **Purpose**: 项目加载和路径管理
- **Components**:
  - `ProjectLoader`: 加载 Circom 项目、解析文件
  - `PathGuard`: 验证路径、解析 include 路径
  - **types.ts**: 项目配置和文件信息类型定义

#### Resolver Module (`core/resolver/`)
- **Purpose**: 解析 include 语句和构建依赖图
- **Components**:
  - `IncludeResolver`: 解析相对路径、circomlib、npm 包等
  - `DependencyGraph`: 构建文件依赖关系、检测循环依赖

#### Parser Module (`core/parser/`)
- **Purpose**: 完整的 Circom 语法解析
- **Components**:
  - **ast.ts**: 定义所有 AST 节点类型
  - **CircomLexer**: 词法分析，识别 token
  - **CircomParser**: 语法分析，构建 AST

#### Utils Module (`utils/`)
- **Purpose**: 通用工具类
- **Components**:
  - `FsUtils`: 文件系统操作
  - `ErrorCollector`: 错误收集和处理
  - `Logger`: 多级别日志记录

### Implementation Phases

**Phase 1** (基础解析) ✅:
- AST 节点定义
- 词法分析器（Lexer）
- 语法分析器（Parser）
- 项目加载器
- 路径验证工具

**Phase 2** (Include 解析) ✅:
- Include 路径解析器
- 依赖图构建器
- 文件系统工具
- 错误处理工具
- 日志工具

**Phase 3** (树展开) 🚧:
- 模板索引器
- 表达式求值器
- 组件树展开器
- API 路由

See [Backend/README.md](Backend/README.md) for detailed documentation.