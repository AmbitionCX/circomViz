# Case 01 Bug Card：所有权签名验证被关闭

> **仅供研究者使用。** 本文件包含漏洞位置、根本原因和修复方式，不得提供给实验参与者，也不得打包进参与者使用的 ExpertStudy 前端或案例材料。

## 项目与代码作用

Zkopru 是一个面向以太坊的隐私型 Layer 2 协议。系统使用 UTXO/note 表示可花费资产，并通过承诺隐藏 note 的具体内容。用户花费 note 时，需要证明该 note 与系统中的承诺一致，同时证明本次操作得到了 note 所有者的授权。

Task1-Example1 是从 Zkopru 所有权证明逻辑提炼出的对齐案例。代码通过以下组件完成一次转账授权：

1. `RollupEntry` 接收所有者公钥、签名、note 秘密值、交易上下文和预期承诺。
2. `TransferAuthorization` 调用 `OwnershipProof`，并检查计算出的 `ownerCommitment` 是否等于 `expectedCommitment`。
3. `OwnershipProof` 根据 `noteSecret` 和 `context` 构造消息，然后调用 `EdDSAPoseidonVerifier` 验证所有者签名。
4. 签名有效且承诺匹配时，结果经 `authorizationValid` 和 `transferApproved` 传递到主输出 `accepted`。

## 漏洞位置

漏洞位于 `aligned-code/main.circom` 的 `OwnershipProof` 模板中，第 57 行：

```circom
eddsa.enabled <== 0;
```

对应文件：[aligned-code/main.circom](aligned-code/main.circom#L57)

上游脆弱版本的对应语句位于 `original-code/packages/circuits/lib/ownership_proof.circom` 第 10 行，同样将验证开关设置为 `0`：

```circom
eddsa.enabled <== 0;
```

## 根本原因

`EdDSAPoseidonVerifier` 使用 `enabled` 控制签名检查：

```circom
(responseDigest - expectedDigest) * enabled === 0;
```

预期情况下，`enabled = 1`，该约束等价于：

```text
responseDigest = expectedDigest
```

这要求 `signatureR8` 和 `signatureS` 表示的签名响应与 `ownerKey`、消息 `M` 相匹配。

当前代码却令 `enabled = 0`，因此约束退化为：

```text
(responseDigest - expectedDigest) × 0 = 0
```

无论签名数据是否正确，这个等式都恒成立。与此同时，验证器将 `verified` 赋值为 `1`：

```circom
verified <== 1;
```

该结果随后沿以下路径传递：

```text
verified
  → authorizationValid
  → transferApproved
  → accepted
```

因此，`expectedCommitment` 的一致性仍然受到检查，但所有者签名不再构成有效约束。证明者可以提交不匹配或不存在的签名，电路仍可能输出 `accepted = 1`。

## 漏洞分类与影响

- **漏洞类型**：欠约束（under-constrained circuit）。
- **根本原因**：错误地关闭了可复用签名验证组件。
- **违反性质**：所有权授权、签名与消息绑定、接受结果与签名有效性一致。
- **安全影响**：生成的证明不能保证转账确实得到了对应所有者私钥的授权，破坏电路的 soundness。

## 具体修复

将 `OwnershipProof` 中的验证开关从常量 `0` 改为常量 `1`。

修改前：

```circom
eddsa.enabled <== 0;
```

修改后：

```circom
eddsa.enabled <== 1;
```

修复后的相关代码应为：

```circom
component eddsa = EdDSAPoseidonVerifier();
eddsa.A[0] <== ownerKey[0];
eddsa.A[1] <== ownerKey[1];
eddsa.R8[0] <== signatureR8[0];
eddsa.R8[1] <== signatureR8[1];
eddsa.S <== signatureS;
eddsa.M <== message;
eddsa.enabled <== 1;

authorizationValid <== eddsa.verified;
```

对于这个对齐案例，不需要修改 `verified <== 1`。启用验证后，只有签名等式成立的 witness 才能满足约束；`verified` 表示约束检查成功后的授权结果。

## 修复验证要点

修复后至少应检查以下两类 witness：

1. **有效签名**：签名、所有者公钥、消息和承诺相互匹配，电路可以满足约束并输出 `accepted = 1`。
2. **无效签名**：只修改 `signatureR8` 或 `signatureS`，保持其他输入不变，电路应无法满足签名约束。

还应重新生成 `main.r1cs`、`main_constraints.json`、`main.sym` 和 `main_substitutions.json`，确认签名相关信号重新进入有效约束，并重新运行编译器 `--inspect` 与 Circomspect 检查。
