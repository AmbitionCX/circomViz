# Case 08 Bug Card：日期余数缺少十进制范围约束

> **仅供研究者使用。** 本文件包含漏洞位置和修复方式，不得提供给实验参与者。

## 漏洞位置与问题语句

漏洞位于 `aligned-code/main.circom` 第 23–33 行。三个字段都通过 witness-only 除法和取余得到数字，例如：

```circom
signal dayDecimals <-- day \ 10;
signal dayRest <-- day % 10;
dayDecimals * 10 + dayRest === day;
```

对应位置：[aligned-code/main.circom](aligned-code/main.circom#L23)

重构等式本身没有把 `dayRest`、`monthRest` 和 `yearRest` 限制在 `0..9`。例如 `day = 4` 时，`dayDecimals = 1`、`dayRest = -6` 仍满足字段等式，却产生不同编码。有限域中的负数以模素数值表示，因此这种替代 witness 可以进入后续承诺。

## 影响

- **漏洞类型**：欠约束／缺失范围约束。
- **根本原因**：代数重构没有保证商和余数构成规范十进制数字。
- **违反性质**：规范分解、数字范围和编码唯一性。
- **安全影响**：同一日期输入可以对应多个可接受编码和不同的下游承诺。

## 具体修复

至少应为三个余数加入非负且小于 10 的范围检查。可使用 `Num2Bits(4)` 和 `LessThan(4)`：

```circom
component dayRestBits = Num2Bits(4);
dayRestBits.in <== dayRest;
component dayRestLt10 = LessThan(4);
dayRestLt10.in[0] <== dayRest;
dayRestLt10.in[1] <== 10;
dayRestLt10.out === 1;
```

对 `monthRest` 和 `yearRest` 应加入相同检查。对于本对齐案例的独立、加固实现，还应约束 `dayDecimals`、`monthDecimals` 和 `yearDecimals` 也是 `0..9`，或者直接将三个输入约束到两位十进制域，以保证分解唯一。

修复测试应覆盖个位数、两位数、`0`、`9`、`10`、`99`，并确认负余数或大于等于 10 的余数无法满足约束。
