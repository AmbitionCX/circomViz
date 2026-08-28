# Case 07 Bug Card：Merkle 路径方向缺少布尔约束

> **仅供研究者使用。** 本文件包含漏洞位置和修复方式，不得提供给实验参与者。

## 漏洞位置与缺失约束

`BinaryMerkleRoot` 在 `aligned-code/main.circom` 第 38 行把 `indices[i]` 直接用作多路选择器：

```circom
selectors[i].selector <== indices[i];
```

对应位置：[aligned-code/main.circom](aligned-code/main.circom#L38)

但代码没有要求 `indices[i]` 为 `0` 或 `1`。`MultiMux1` 使用线性插值排列节点；当 selector 是其他域元素时，输出不再表示“左/右交换”，而是任意线性组合。证明者可借此构造并不存在的父节点序列，使伪造路径得到目标根。

## 影响

- **漏洞类型**：欠约束／缺失布尔约束。
- **根本原因**：把路径方向当作布尔选择器使用，却未限制其取值域。
- **违反性质**：方向位有效性和 Merkle 成员语义。
- **安全影响**：可能为任意叶子构造虚假的注册表成员证明，绕过依赖该根的身份或证书检查。

## 具体修复

在每个方向位被选择器使用前加入布尔约束：

```circom
for (var i = 0; i < DEPTH; i++) {
    indices[i] * (indices[i] - 1) === 0;

    selectors[i] = MultiMux1();
    selectors[i].left <== nodes[i];
    selectors[i].right <== siblings[i];
    selectors[i].selector <== indices[i];
    // 后续哈希保持不变
}
```

也可以把同一布尔约束放进 `MultiMux1`，但必须保证该组件的所有用途都确实要求布尔 selector。修复测试应覆盖全 0、全 1、混合路径，以及任一方向值为 `2` 或其他非布尔值时约束失败。
