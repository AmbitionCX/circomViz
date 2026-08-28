# Task1-Example3：Panther zAccount 更新与 Nullifier 生成

## 案例背景

Panther Protocol 使用 Shielded Pool、zAccount 和 zAsset 支持隐私增强的资产活动。zAccount 可视为用户在特定隐私区域中的私密账本；其状态以 UTXO 承诺表示。更新旧 zAccount UTXO 时，系统需要生成 nullifier 标记旧状态已被消费，并产生绑定新上下文的新承诺。

## 代码在项目中的位置

本案例是从 Panther 的 `ZAccountRenewalV1` 电路提炼出的研究用对齐版本，位于 zAccount 状态更新流程。`RenewalTransaction` 调用更新组件，检查旧承诺、生成并验证旧状态的 nullifier，再把交易上下文加入新的承诺。

案例简化了生产代码中的密钥派生、Poseidon 哈希、资产字段和 Merkle 证明，但保留了公私钥、承诺、nullifier 与更新上下文之间的预期关系。

## 预期功能

1. 根据 nullifier 公钥、余额、代币标识和 nonce 重建旧 zAccount 承诺。
2. 确认该承诺等于 `oldCommitment`。
3. 使用与该公钥配对的 nullifier 私钥、旧承诺和域参数计算唯一 nullifier。
4. 确认计算结果等于输入的 `nullifier`。
5. 将旧承诺与当前上下文组合为新的 zAccount 承诺。

## 输入信号及其语义

| 输入信号 | 形状 | 语义 |
|---|---:|---|
| `nullifierPubKey` | `[2]` | 写入旧 zAccount 承诺的 nullifier 公钥坐标。 |
| `nullifierPrivKey` | 标量 | 应与 `nullifierPubKey` 配对的 nullifier 私钥。 |
| `balance` | 标量 | 旧 zAccount 状态中的余额。 |
| `tokenId` | 标量 | 余额对应的资产或代币标识。 |
| `nonce` | 标量 | 区分账户状态版本的计数值。 |
| `domain` | 标量 | 隔离 nullifier 使用场景的域参数。 |
| `context` | `[8]` | 本次更新的八个上下文字段。 |
| `oldCommitment` | 标量 | 应与旧账户字段匹配的既有承诺。 |
| `nullifier` | 标量 | 声明用于消费旧账户状态的 nullifier。 |

## 输出信号及其语义

| 输出信号 | 形状 | 语义 |
|---|---:|---|
| `newCommitment` | 标量 | 绑定旧承诺和本次上下文的更新后承诺。 |
| `spentNullifier` | 标量 | 经验证、用于标记旧状态已消费的 nullifier。 |

## 必须满足的关键安全与功能性质

1. **密钥配对**：`nullifierPubKey` 必须由对应的 `nullifierPrivKey` 派生。
2. **旧状态绑定**：余额、代币标识、nonce 和 nullifier 公钥必须重建出 `oldCommitment`。
3. **唯一消费标识**：同一旧承诺及其合法 nullifier 密钥关系应产生确定的 nullifier。
4. **nullifier 一致性**：输入 `nullifier` 必须等于内部计算结果。
5. **更新绑定**：`newCommitment` 必须同时绑定旧承诺和完整更新上下文。
6. **单次消费语义**：不能通过替换不相关密钥为同一旧状态生成多个可接受 nullifier。

## 必要术语

- **zAccount**：Panther 中用于组织私密状态、交易和合规信息的账户结构。
- **UTXO 承诺**：对尚未消费账户状态的隐藏表示。
- **Nullifier**：消费旧状态时产生的唯一标识，用于阻止该状态再次被使用。
- **公私钥配对**：公钥必须由相应私钥按照指定密钥派生规则得到。
- **Nonce**：区分不同账户状态或操作的计数值。
- **域参数**：用于隔离不同网络、协议或用途下相同计算的附加输入。
- **Witness**：证明者提交给电路的私有输入与中间信号取值。
