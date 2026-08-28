# Case 02：Panther 私密资产空值标识验证

## 案例背景

Panther Protocol 面向隐私增强的链上资产交易。用户将资产表示为 Shielded Pool 中的 zAsset，并通过 zAccount 管理私密余额和交易。zAsset 采用 UTXO 模型：每个可花费输出以承诺表示，花费后则公开一个对应的 nullifier（空值标识），使系统能够阻止同一输出被重复使用。

## 代码在项目中的位置

本案例是从 Panther 的 `ZSwapV1` 交易电路提炼出的研究用对齐版本，位于私密转账输入的有效性检查环节。`PoolTransaction` 调用 `PrivateTransfer`，后者调用 `ZSwapV1`，检查成员路径摘要并验证提交的 nullifier 是否由相应花费私钥、UTXO 承诺和域参数计算得到。

案例简化了生产系统中的哈希、Merkle 路径和资产逻辑，但保留了组件层次、nullifier 数据流及预期安全语义。

## 预期功能

1. 根据 `spendPrivKey`、`commitment` 和 `domain` 确定性地计算 nullifier。
2. 要求提交的 `nullifier` 与计算结果一致。
3. 汇总并检查 UTXO 成员路径的摘要。
4. 只有上述关系同时成立时，生成代表本次私密转账的 `acceptedTag`。

## 输入信号及其语义

| 输入信号 | 形状 | 语义 |
|---|---:|---|
| `nullifier` | 标量 | 声明用于标记本次输入 UTXO 已被花费的空值标识。 |
| `spendPrivKey` | 标量 | 控制该 UTXO 的私有花费密钥。 |
| `commitment` | 标量 | 被花费 UTXO 的承诺。 |
| `membershipPath` | `[8]` | 描述该 UTXO 所在成员路径的八个字段。 |
| `domain` | 标量 | 区分不同使用场景或网络的域参数，参与 nullifier 派生。 |
| `expectedPathDigest` | 标量 | 成员路径应当匹配的预期摘要。 |

## 输出信号及其语义

| 输出信号 | 形状 | 语义 |
|---|---:|---|
| `acceptedTag` | 标量 | 由已验证的 nullifier 和路径摘要组合得到的交易标签。 |

## 必须满足的关键安全与功能性质

1. **确定性派生**：相同花费私钥、UTXO 承诺和域参数必须得到相同 nullifier。
2. **nullifier 一致性**：提交的 `nullifier` 必须等于电路内部计算出的结果。
3. **防止重复花费**：同一 UTXO 不应通过更换任意 nullifier 被表示为多次不同花费。
4. **路径绑定**：`membershipPath` 必须与 `expectedPathDigest` 一致。
5. **组合完整性**：输出标签必须同时绑定经过验证的 nullifier 与路径摘要。
6. **证明语义一致**：任何满足约束的 witness 都应表示一次符合上述关系的私密转账。

## 必要术语

- **Shielded Pool**：隐藏资产所有权和交易细节的隐私资产池。
- **zAccount / zAsset**：Panther 中的私密账户及其管理的隐私资产表示。
- **UTXO**：尚未花费的交易输出；花费后不能再次使用。
- **承诺**：隐藏 UTXO 内容、同时绑定其确定数据的密码学表示。
- **Nullifier（空值标识）**：花费 UTXO 时公布的确定性标识，用于检测重复花费而不公开原始 UTXO。
- **域参数**：将同一计算隔离到特定协议、网络或用途的附加输入。
- **Witness**：证明者为电路输入和中间信号提供的一组具体取值。
