# Case 04 Bug Card：右移结果未受约束

> **仅供研究者使用。** 本文件包含漏洞位置、利用机制和修复方式，不得提供给实验参与者。

## 漏洞位置与问题语句

漏洞位于 `aligned-code/main.circom` 第 31 行：

```circom
signal shiftedFirstByte <-- (pointAsBytes[0] >> 1);
```

对应文件：[aligned-code/main.circom](aligned-code/main.circom#L31)

`<--` 不生成 R1CS 约束，因此 `shiftedFirstByte` 没有被绑定到 `pointAsBytes[0] >> 1`。下一行又将它直接传给 `length`，随后消息长度参与 `overrideTag` 和最终授权标签。证明者可以选择任意长度，而无需符合编码点首字节。

## 影响

- **漏洞类型**：欠约束／assigned but unconstrained。
- **根本原因**：直接以 witness-only 运算实现位移。
- **违反性质**：长度确定性、编码一致性和授权标签绑定。
- **安全影响**：电路可能接受与输入编码不一致的消息长度和提取语义。

## 具体修复

不能只把 `<--` 机械替换为 `<==`；应使用受约束的右移组件。典型实现是将首字节分解为 8 个布尔位，丢弃最低位，再把其余 7 位重组：

```circom
component shifted = RShift1(8);
shifted.in <== pointAsBytes[0];
shiftedFirstByte <== shifted.out;
```

`RShift1(8)` 内部应使用 `Num2Bits(8)` 约束输入字节，并使用 `Bits2Num(7)` 重组移位结果。修复后，改变 `length` 而不改变首字节必须导致约束失败，同时还应覆盖首字节为 `0`、`1`、偶数和奇数的边界测试。
