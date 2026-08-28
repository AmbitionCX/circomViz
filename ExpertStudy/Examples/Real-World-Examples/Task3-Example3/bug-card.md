# Task3-Example3 Bug Card：一个密文段使用了错误的中间结果

> **仅供研究者使用。** 本文件包含漏洞位置和修复方式，不得提供给实验参与者。

## 漏洞位置与问题语句

漏洞位于 `aligned-code/main.circom` 第 55–57 行。索引 `j == 3` 时，代码将只加入共享密钥的中间点写入密文：

```circom
if (j == 3) {
    encryptedMessage[j][0] <== drv_mGrY[j].xout;
    encryptedMessage[j][1] <== drv_mGrY[j].yout;
}
```

对应位置：[aligned-code/main.circom](aligned-code/main.circom#L55)

其他五个段均使用 `drv_mGrY_final[j]`，后者在中间点上继续加入了 `hidingPoint`。索引 3 的分支遗漏该步骤，导致同一密文数组内部的数据构造规则不一致。

## 影响

- **漏洞类型**：错误数据依赖／错误中间变量。
- **根本原因**：密文输出引用 `drv_mGrY`，而不是完成隐藏点相加后的 `drv_mGrY_final`。
- **违反性质**：统一处理、完整隐藏和密文摘要语义。
- **安全影响**：一个消息段未包含预期隐藏点，削弱不同记录或接收方之间的不可关联性保证。

## 具体修复

移除特殊分支，让所有索引都使用最终点，或将两条赋值改为：

```circom
encryptedMessage[j][0] <== drv_mGrY_final[j].xout;
encryptedMessage[j][1] <== drv_mGrY_final[j].yout;
```

修复测试应逐项确认六个 `encryptedMessage[j]` 都依赖 `hidingPoint`，并比较每个索引的数据流结构是否一致。
