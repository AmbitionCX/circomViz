# Case 05 Bug Card：禁止国家列表索引错误

> **仅供研究者使用。** 本文件包含漏洞位置、影响和修复方式，不得提供给实验参与者。

## 漏洞位置与问题语句

漏洞位于 `aligned-code/main.circom` 第 41 行：

```circom
countryChecks[i].listedCountry[j] <== forbiddenCountriesList[i + j];
```

对应文件：[aligned-code/main.circom](aligned-code/main.circom#L41)

每个国家占三个连续元素，因此第 `i` 个国家的起始位置应为 `i * 3`。当前表达式使用 `i + j`，实际比较窗口依次从索引 0、1、2、3、4、5 开始，产生大量重叠，并没有检查位于索引 6–17 的后续完整国家项。

## 影响

- **漏洞类型**：错误索引／逻辑到约束的错误转换。
- **根本原因**：把条目编号直接当作扁平数组起始偏移。
- **违反性质**：正确分组、完整列表覆盖和排除策略。
- **安全影响**：部分禁止国家可能未被检查；重叠的三个字符窗口也可能造成非预期拒绝。

## 具体修复

修改前：

```circom
countryChecks[i].listedCountry[j] <== forbiddenCountriesList[i + j];
```

修改后：

```circom
countryChecks[i].listedCountry[j] <== forbiddenCountriesList[i * 3 + j];
```

修复测试应让护照国家分别匹配六个列表位置，确认每一项都被拒绝；同时测试与全部列表项不同的国家可以通过。
