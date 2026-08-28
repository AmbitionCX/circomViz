# Task4-Example3 Bug Card：比较器输入缺少位宽约束

> **仅供研究者使用。** 本文件包含漏洞位置和修复方式，不得提供给实验参与者。

## 漏洞位置与问题语句

漏洞集中在 `aligned-code/main.circom` 第 30–36 行：

```circom
component lowerBound = LessThan(BITS);
lowerBound.in[0] <== 0;
lowerBound.in[1] <== in + max_abs_value + 1;

component upperBound = LessThan(BITS);
upperBound.in[0] <== in + max_abs_value;
upperBound.in[1] <== 2 * max_abs_value + 1;
```

对应位置：[aligned-code/main.circom](aligned-code/main.circom#L30)

`LessThan(N)` 的正确性依赖两个输入都处于 `N` 位无符号整数域。当前 `RangeProof` 没有约束 `in` 和 `max_abs_value` 的范围，因此派生表达式可能超出 8 位并在有限域中产生非预期比较结果，使范围检查返回错误的真值。

## 影响

- **漏洞类型**：欠约束／不安全复用比较组件。
- **根本原因**：调用者未满足 `LessThan` 的输入位宽前提。
- **违反性质**：比较域有效性、阈值正确性和禁止有限域绕回。
- **安全影响**：超出预期范围的位置值可能通过本应失败的范围证明。

## 具体修复

对当前 `RangeProof(8)` 的表达式，不仅要限制两个原始输入，还要限制实际传入比较器的派生操作数。可在模板中加入：

```circom
component inBits = Num2Bits(BITS);
inBits.in <== in;

component maxBits = Num2Bits(BITS - 1);
maxBits.in <== max_abs_value;

component lowerRightBits = Num2Bits(BITS);
lowerRightBits.in <== in + max_abs_value + 1;

component upperRightBits = Num2Bits(BITS);
upperRightBits.in <== 2 * max_abs_value + 1;
```

`lowerRightBits` 同时保证 `in + max_abs_value` 不会超过比较器左操作数的范围；`upperRightBits` 约束上界表达式。然后保留原有两个 `LessThan(BITS)` 检查。若协议需要更大的坐标或半径，应增加 `BITS`，而不是省略输入范围约束。修复测试应覆盖位宽边界、最大合法阈值、刚好越界的输入，以及原漏洞使用的超范围反例。
