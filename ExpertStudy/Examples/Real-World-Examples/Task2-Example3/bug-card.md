# Task2-Example3 Bug Card：解码长度输出从未赋值或约束

> **仅供研究者使用。** 本文件包含漏洞位置和修复方式，不得提供给实验参与者。

## 漏洞位置与缺失语句

漏洞位于 `aligned-code/main.circom` 的 `Base64DecodedLength` 模板第 15–32 行。模板声明了：

```circom
signal output decoded_len;
```

但模板结束前没有任何语句为 `decoded_len` 赋值或建立约束。虽然 `q`、`remainder` 及其比特关系受到检查，这些内部结果从未连接到输出。调用者随后在第 67 行把自由的 `decoded_len` 用于 `PayloadCommitment`。

对应位置：[aligned-code/main.circom](aligned-code/main.circom#L15)

## 影响

- **漏洞类型**：欠约束／未约束输出。
- **根本原因**：计算了商和余数，却遗漏输出赋值。
- **违反性质**：解码长度确定性、载荷长度绑定和账户承诺一致性。
- **安全影响**：证明者可选择任意解码长度，从而使最终账户承诺不再可靠地对应编码载荷。

## 具体修复

在 `Base64DecodedLength` 返回前，把经过约束的商连接到输出：

```circom
decoded_len <== q;
```

对于完整 Base64URL 实现，应使用协议规定的 `3 * encoded_len / 4` 关系并正确处理无填充编码；对齐案例采用了简化长度关系，因此直接返回其已约束的 `q`。修复后应验证同一 `encodedPayloadLength` 只能得到一个 `decoded_len`，且尝试修改该输出时约束失败。
