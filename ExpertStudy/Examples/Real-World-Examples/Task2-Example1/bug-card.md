# Case 03 Bug Card：ArrayXOR 输出仅被赋值而未受约束

> **仅供研究者使用。** 本文件包含漏洞位置和修复方式，不得提供给实验参与者。

## 漏洞位置与问题语句

漏洞位于 `aligned-code/main.circom` 第 21 行：

```circom
out[i] <-- a[i] ^ b[i];
```

对应文件：[aligned-code/main.circom](aligned-code/main.circom#L21)

`<--` 只告诉 witness 生成器如何计算 `out[i]`，不会把该等式加入 R1CS。`HashToField` 随后把 `xorBytes.out[i]` 用于列混合和消息摘要，因此恶意证明者可以为这些输出选择任意值，并改变最终 `root`，而不必遵循预期 XOR 关系。

## 影响

- **漏洞类型**：欠约束／assigned but unconstrained。
- **根本原因**：把确定性计算写成 witness-only 赋值。
- **违反性质**：逐项 XOR、完整消息绑定和输出确定性。
- **安全影响**：证明中的消息域元素和签名根不再可靠地对应输入消息与掩码。

## 具体修复

按照上游修复，将 witness-only 赋值改成约束赋值：

```circom
out[i] <== a[i] ^ b[i];
```

若 `a[i]` 和 `b[i]` 的预期域是单比特，还应显式加入布尔约束；若它们表示多比特字节，则应先进行位分解、逐位 XOR，再重组输出。修复验证应覆盖正常 XOR 结果，以及人为修改任一 `out[i]` 后约束失败的情况。
