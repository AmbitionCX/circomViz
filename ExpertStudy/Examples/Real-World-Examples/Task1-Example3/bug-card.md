# Task1-Example3 Bug Card：Nullifier 公私钥缺少配对约束

> **仅供研究者使用。** 本文件包含漏洞位置、影响和修复方式，不得提供给实验参与者。

## 代码作用

`ZAccountRenewalV1` 使用 `zAccountUtxoInNullifierPubKey` 构造旧 note 承诺，同时使用 `zAccountUtxoInNullifierPrivKey` 计算该承诺的 nullifier。安全语义要求两者属于同一密钥对。

## 漏洞位置与缺失关系

该漏洞不是某一条错误赋值，而是 `aligned-code/main.circom` 第 57–68 行之间缺少公私钥配对约束：

```circom
zAccountUtxoInNoteHasher.nullifierPubKey <== zAccountUtxoInNullifierPubKey;
...
zAccountUtxoInNullifierHasher.privKey <== zAccountUtxoInNullifierPrivKey;
```

对应位置：[aligned-code/main.circom](aligned-code/main.circom#L57)

公钥进入 `NoteHasher`，私钥进入 `NullifierHasher`，但代码从未证明输入公钥由输入私钥派生。因此，证明者可保留同一公钥和旧承诺，同时替换不同私钥，得到不同且可分别提交的 nullifier。

## 影响

- **漏洞类型**：欠约束／缺失输入关系约束。
- **根本原因**：承诺路径和 nullifier 路径使用独立输入，却没有密钥派生检查。
- **违反性质**：密钥配对、nullifier 唯一性和旧状态单次消费。
- **安全影响**：同一 zAccount UTXO 承诺可能对应多个可接受 nullifier，从而破坏重复花费防护。

## 具体修复

生产电路应使用项目采用的 Baby Jubjub 公钥派生组件，将私钥派生结果与输入公钥逐坐标约束相等：

```circom
component nullifierPubKeyDeriver = BabyPbk();
nullifierPubKeyDeriver.in <== zAccountUtxoInNullifierPrivKey;
nullifierPubKeyDeriver.Ax === zAccountUtxoInNullifierPubKey[0];
nullifierPubKeyDeriver.Ay === zAccountUtxoInNullifierPubKey[1];
```

该代码应放在 `ZAccountRenewalV1` 中，在 `zAccountUtxoInNullifierPubKey` 和 `zAccountUtxoInNullifierPrivKey` 被用于哈希之前或附近。对齐案例若不引入完整 `BabyPbk`，也必须加入一个确定性密钥派生组件，并对两个输出坐标建立同等关系；不能仅比较其中一个坐标。

修复后应验证：合法密钥对可通过；保持公钥、承诺和其他输入不变而替换私钥时约束失败；同一旧承诺不能生成多个可接受 nullifier。
