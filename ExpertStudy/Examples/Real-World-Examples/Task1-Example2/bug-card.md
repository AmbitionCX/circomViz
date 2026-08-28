# Case 02 Bug Card：Nullifier 验证可被关闭

> **仅供研究者使用。** 本文件包含漏洞位置、利用条件和修复方式，不得提供给实验参与者。

## 代码作用

`ZSwapV1` 根据花费私钥、UTXO 承诺和域参数计算 nullifier，再使用 `ForceEqualIfEnabled` 要求计算结果等于输入的 `zAccountUtxoInNullifier`。该关系用于保证同一 UTXO 只能产生预期的 nullifier，从而支持重复花费检测。

## 漏洞位置与问题语句

漏洞位于 `aligned-code/main.circom` 第 59 行：

```circom
zAccountUtxoInNullifierHasherProver.enabled <== zAccountUtxoInSpendPrivKey;
```

对应文件：[aligned-code/main.circom](aligned-code/main.circom#L59)

`ForceEqualIfEnabled` 的核心约束是：

```circom
(in[0] - in[1]) * enabled === 0;
```

当 `zAccountUtxoInSpendPrivKey = 0` 时，`enabled` 同样为 `0`，上述等式恒成立，输入 nullifier 不再需要等于内部计算结果。零值又是调用者能够提供的字段元素，因此秘密输入被错误地同时用作安全检查的开关。

## 影响

- **漏洞类型**：欠约束。
- **根本原因**：将业务数据 `zAccountUtxoInSpendPrivKey` 直接连接到验证组件的 `enabled`。
- **违反性质**：nullifier 一致性和重复花费防护。
- **安全影响**：证明者可在零花费密钥路径下选择任意 nullifier，使同一 UTXO 对应多个不同的花费标识。

## 具体修复

该检查在 `ZSwapV1` 中必须始终启用。修改前：

```circom
zAccountUtxoInNullifierHasherProver.enabled <== zAccountUtxoInSpendPrivKey;
```

修改后：

```circom
zAccountUtxoInNullifierHasherProver.enabled <== 1;
```

修复后应验证：正确 nullifier 可以满足约束；保持其他输入不变并修改 nullifier 时无法满足约束；`spendPrivKey = 0` 时检查仍不会被跳过。
