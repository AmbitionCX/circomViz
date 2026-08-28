# Case 06 Bug Card：最后一个区域槽位未被检查

> **仅供研究者使用。** 本文件包含漏洞位置和修复方式，不得提供给实验参与者。

## 漏洞位置与问题语句

`allowedZoneIds` 有六个槽位，但 `ZoneIdInclusionProver` 只创建五组比较组件，并只遍历 `0..4`：

```circom
component offsetMatches[5];
component equalityChecks[5];
...
for (var i = 0; i < 5; i++) {
```

对应位置：[aligned-code/main.circom](aligned-code/main.circom#L28)

当 `zoneOffset = 5` 时，没有任何比较被激活。第 45 行只要求激活数量为布尔值，`0` 也满足，因此区域许可检查可以完全跳过。

## 影响

- **漏洞类型**：欠约束／循环边界错误。
- **根本原因**：六槽位输入与五次循环不一致，并允许零个活动检查。
- **违反性质**：全槽位支持、位置有效性和禁止空检查。
- **安全影响**：证明者可选择未覆盖位置，绕过 `zoneId` 与许可列表的相等检查。

## 具体修复

将组件数组和循环扩展到六项，并明确要求恰好命中一个位置：

```circom
component offsetMatches[6];
component equalityChecks[6];
signal activeChecks[7];
activeChecks[0] <== 0;

for (var i = 0; i < 6; i++) {
    // 保持原有 IsEqual 和 ForceEqualIfEnabled 连线
    activeChecks[i + 1] <== activeChecks[i] + offsetMatches[i].out;
}

activeChecks[6] === 1;
```

最后一个等式同时拒绝超出 `0..5` 的 offset。修复测试应逐一覆盖六个合法位置，并确认 `zoneOffset = 6` 或其他列表外值不能满足约束。
