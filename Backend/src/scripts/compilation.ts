import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as dotenv from "dotenv";

import { buildDAG } from './buildDAG.js';

// 获取当前文件的路径和目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execPromise = promisify(exec);

// Circom电路操作的信号包含有限域Z/pZ中的元素
// 配置dotenv路径，读取.env文件中的素数p
const __rootname = path.dirname(path.dirname(__dirname))
dotenv.config({ path: __rootname + '/.env' });
const Prime = String(process.env.P);            // 从环境变量获取素数p
const PrimeNumber = BigInt(Prime);              // 将素数p转换为BigInt类型

/**
 * 将有限域元素转换为更易读的形式
 * 如果元素值小于等于p/2，保持原值；否则转换为负数形式(x-p)
 * @param input 输入的有限域元素字符串
 * @returns 转换后的BigInt值
 */
function elementSimplification(input: string): bigint {
  let big_input = BigInt(input);
  let half = PrimeNumber / BigInt(2);
  let big_output: bigint;

  if (big_input <= half) {
    big_output = big_input;
  } else {
    big_output = big_input - PrimeNumber;
  }
  return big_output;
}

/**
 * 计算有限域元素的模逆元
 * 使用费马小定理：如果p是素数且gcd(a,p)=1，则a^(p-1) ≡ 1 (mod p)
 * 因此a^(p-2) ≡ a^(-1) (mod p)
 * @param element 输入的有限域元素字符串
 * @returns 模逆元的BigInt值
 */
function modularInverse(element: string): bigint {
  let input = BigInt(element)
  // 处理输入为 0 的情况
  if (input === BigInt(0)) {
    return BigInt(0); // 对于零，没有模逆，但我们返回 0 以避免错误
  }

  // 检查输入是否有效
  if (input < BigInt(0) || input >= PrimeNumber) {
    console.error("无效输入：x必须在[1, P-1]范围内，且P必须是素数。");
    return input;
  }

  // 计算 x^(P-2) mod P
  let exponent = PrimeNumber - BigInt(2);
  let result = BigInt(1);
  let base = input % PrimeNumber;

  // 快速幂算法
  while (exponent > BigInt(0)) {
    if (exponent % BigInt(2) === BigInt(1)) {
      result = (result * base) % PrimeNumber;
    }
    base = (base * base) % PrimeNumber;
    exponent = exponent / BigInt(2);
  }

  return elementSimplification(result.toString());
}

/**
 * 将系数转换为更易读的形式
 * 比较简化值和其逆元的绝对值，选择较小的表示形式
 * @param input 输入的系数字符串
 * @returns 更易读的系数表示形式
 */
function readable_coefficient(input: string) {
  let simplified = elementSimplification(input);
  let inversed = modularInverse(input);

  const absSimplified = simplified < 0 ? -simplified : simplified;
  const absInversed = inversed < 0 ? -inversed : inversed;

  let result: bigint = BigInt(0);
  if (absSimplified <= absInversed) {
    return simplified.toString()
  } else {
    return `1/${inversed.toString()}`
  }
}

/**
 * 拉格朗日插值函数
 * 根据给定点集合计算多项式系数
 * @param points 包含x和y坐标的点集合
 * @returns 插值多项式的系数数组
 */
function lagrangeInterpolation(points: { x: bigint, y: bigint }[]): bigint[] {
  const prime = PrimeNumber;
  const degree = points.length;

  // 创建多项式系数数组，初始化为 0
  // 注意：多项式系数的数量应该等于点的数量
  const coefficients: bigint[] = Array(degree).fill(BigInt(0));

  // 对每个点计算其拉格朗日基本多项式
  for (let i = 0; i < degree; i++) {
    const { x: xi, y: yi } = points[i];

    // 如果 y 为 0，这个点不会对多项式有贡献
    if (yi === BigInt(0)) continue;

    // 计算拉格朗日基本多项式 Li(x)
    // Li(x) = ∏(j≠i) (x - xj) / (xi - xj)
    let term: bigint[] = [BigInt(1)]; // 表示常数 1

    for (let j = 0; j < degree; j++) {
      if (i === j) continue;

      const { x: xj } = points[j];

      // 计算 (x - xj)，这等于 [-xj, 1] 表示多项式 x - xj
      const factor: bigint[] = [(-xj % prime + prime) % prime, BigInt(1)];

      // 多项式乘法：term = term * factor
      term = multiplyPolynomials(term, factor, prime);

      // 计算 (xi - xj)^(-1) mod prime
      let diff = (xi - xj) % prime;
      if (diff < 0) diff += prime;

      // 计算模逆
      let inverse = modInversePrime(diff, prime);

      // 将 term 乘以系数 (xi - xj)^(-1)
      for (let k = 0; k < term.length; k++) {
        term[k] = (term[k] * inverse) % prime;
      }
    }

    // 将 term 乘以 yi
    for (let k = 0; k < term.length; k++) {
      term[k] = (term[k] * yi) % prime;
    }

    // 将结果加到多项式系数上
    for (let k = 0; k < term.length; k++) {
      if (k < coefficients.length) {
        coefficients[k] = (coefficients[k] + term[k]) % prime;
      }
    }
  }

  return coefficients;
}

/**
 * 多项式乘法辅助函数
 * 在有限域上计算两个多项式的乘积
 * @param a 第一个多项式的系数数组
 * @param b 第二个多项式的系数数组
 * @param prime 有限域的模数
 * @returns 结果多项式的系数数组
 */
function multiplyPolynomials(a: bigint[], b: bigint[], prime: bigint): bigint[] {
  const result: bigint[] = Array(a.length + b.length - 1).fill(BigInt(0));

  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] = (result[i + j] + (a[i] * b[j])) % prime;
    }
  }

  return result;
}

/**
 * 在有限域上计算模逆
 * @param a 需要计算逆元的数
 * @param prime 有限域的模数
 * @returns 模逆元
 */
function modInversePrime(a: bigint, prime: bigint): bigint {
  return modPow(a, prime - BigInt(2), prime);
}

/**
 * 模幂运算
 * 计算 (base^exponent) mod modulus
 * @param base 底数
 * @param exponent 指数
 * @param modulus 模数
 * @returns 模幂运算结果
 */
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === BigInt(1)) return BigInt(0);

  let result = BigInt(1);
  base = base % modulus;

  while (exponent > BigInt(0)) {
    if (exponent % BigInt(2) === BigInt(1)) {
      result = (result * base) % modulus;
    }
    exponent = exponent >> BigInt(1);
    base = (base * base) % modulus;
  }

  return result;
}

/**
 * 将R1CS转换为QAP
 * 约束系统的转换过程
 * @param circuitData 包含约束和符号的电路数据
 * @returns QAP表示形式
 */
function convertR1CStoQAP(circuitData: any): any {
  const constraints = circuitData.constraints;
  const symbols = circuitData.symbols;
  const numVars = symbols.length + 1; // +1 是为了处理常数项
  const numConstraints = constraints.length;

  console.log(`处理 ${numVars} 个变量的 ${numConstraints} 个约束`);

  // 初始化 R1CS 矩阵
  const matrixA: bigint[][] = Array(numConstraints).fill(0).map(() => Array(numVars).fill(BigInt(0)));
  const matrixB: bigint[][] = Array(numConstraints).fill(0).map(() => Array(numVars).fill(BigInt(0)));
  const matrixC: bigint[][] = Array(numConstraints).fill(0).map(() => Array(numVars).fill(BigInt(0)));

  // 填充 R1CS 矩阵
  for (let i = 0; i < numConstraints; i++) {
    const constraint = constraints[i];

    // 处理 A 线性表达式
    for (let j = 0; j < constraint.lin_expr_A.length; j++) {
      const signalIndex = parseInt(constraint.lin_expr_A[j]);
      const coefficient = BigInt(constraint.coefficient_A[j].includes('/')
        ? processInverseFraction(constraint.coefficient_A[j])
        : constraint.coefficient_A[j]);

      matrixA[i][signalIndex] = coefficient;
    }

    // 处理 B 线性表达式
    for (let j = 0; j < constraint.lin_expr_B.length; j++) {
      const signalIndex = parseInt(constraint.lin_expr_B[j]);
      const coefficient = BigInt(constraint.coefficient_B[j].includes('/')
        ? processInverseFraction(constraint.coefficient_B[j])
        : constraint.coefficient_B[j]);

      matrixB[i][signalIndex] = coefficient;
    }

    // 处理 C 线性表达式
    for (let j = 0; j < constraint.lin_expr_C.length; j++) {
      const signalIndex = parseInt(constraint.lin_expr_C[j]);
      const coefficient = BigInt(constraint.coefficient_C[j].includes('/')
        ? processInverseFraction(constraint.coefficient_C[j])
        : constraint.coefficient_C[j]);

      matrixC[i][signalIndex] = coefficient;
    }
  }

  // 选择评估点
  const evaluationPoints: bigint[] = [];
  for (let i = 1; i <= numConstraints; i++) {
    evaluationPoints.push(BigInt(i));
  }

  // 构建 QAP 多项式
  const qapPolysA: bigint[][] = [];
  const qapPolysB: bigint[][] = [];
  const qapPolysC: bigint[][] = [];

  // 对每个变量创建多项式
  for (let varIndex = 0; varIndex < numVars; varIndex++) {
    const pointsA: { x: bigint, y: bigint }[] = [];
    const pointsB: { x: bigint, y: bigint }[] = [];
    const pointsC: { x: bigint, y: bigint }[] = [];

    for (let i = 0; i < numConstraints; i++) {
      pointsA.push({ x: evaluationPoints[i], y: matrixA[i][varIndex] });
      pointsB.push({ x: evaluationPoints[i], y: matrixB[i][varIndex] });
      pointsC.push({ x: evaluationPoints[i], y: matrixC[i][varIndex] });
    }

    qapPolysA.push(lagrangeInterpolation(pointsA));
    qapPolysB.push(lagrangeInterpolation(pointsB));
    qapPolysC.push(lagrangeInterpolation(pointsC));
  }

  // 构建目标多项式 Z(x)
  const zPoly = evaluationPoints.reduce((acc, x) => {
    // Z(x) = (x - 1)(x - 2)...(x - m)
    if (acc.length === 0) {
      return [BigInt(-1) * x, BigInt(1)]; // 表示 (x - point)
    }

    const result: bigint[] = Array(acc.length + 1).fill(BigInt(0));
    // (acc) * (x - point)
    for (let i = 0; i < acc.length; i++) {
      result[i] += acc[i] * BigInt(-1) * x;
      result[i + 1] += acc[i];
    }

    return result;
  }, [] as bigint[]);

  return {
    numVars,
    numConstraints,
    qapPolysA,
    qapPolysB,
    qapPolysC,
    zPoly
  };
}

/**
 * 处理形如 "1/x" 的分数字符串
 * @param fraction 分数字符串
 * @returns 处理后的值字符串
 */
function processInverseFraction(fraction: string): string {
  if (!fraction.includes('/')) return fraction;

  const denominator = BigInt(fraction.split('/')[1]);
  // 处理分母为 0 的情况
  if (denominator === BigInt(0)) {
    console.error("除数不能为零");
    return "0"; // 返回 0 以避免错误
  }
  return modInversePrime(denominator, PrimeNumber).toString();
}

/**
 * 递归地将对象中的所有 BigInt 转换为字符串
 * @param obj 包含BigInt的对象
 * @returns 转换后的对象，所有BigInt变为字符串
 */
function serializeBigInts(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInts(item));
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        result[key] = serializeBigInts(obj[key]);
      }
    }
    return result;
  }

  return obj;
}

/**
 * 保存Circom代码并编译
 * @param folderName 目标文件夹名
 * @param fileName 文件名
 * @param code Circom代码内容
 * @returns 编译结果和电路数据
 */
export async function saveCode(folderName: string, fileName: string, code: string): Promise<any> {
  const folderPath = path.join(__dirname, '..', '..', 'compilations', folderName);
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
  } catch (error: any) {
    throw new Error(`创建文件夹失败: ${error.message}`);
  }

  const filePath = path.join(folderPath, fileName);
  try {
    await fs.promises.writeFile(filePath, code);
  } catch (error: any) {
    throw new Error(`保存文件失败: ${error.message}`);
  }

  return await compileCircomCode(folderPath, filePath).then(async (result) => {
    const { symbolFilePath, constraintFilePath, substitutionFilePath } = result;

    let circuitData = {
      "symbols": {},
      "constraints": {},
      "substitutions": {},
      "r1cs": {},
      "qap": {}
    };

    // 构建符号表
    const symbolFile = fs.readFileSync(symbolFilePath, 'utf-8');
    const symbol_lines = symbolFile.split('\n');
    const symbols: any[] = [];

    symbol_lines.forEach((line) => {
      const fields = line.split(',');

      // 符号文件格式
      // https://docs.circom.io/circom-language/formats/sym/
      // 信号编号0表示常数1
      if (fields.length >= 2) {
        const obj: any = {};
        fields.forEach((symbol_field, symbol_index) => {
          switch (symbol_index) {
            case 0:
              obj['symbol_id'] = symbol_field.trim();
              break;
            case 1:
              break;
            case 2:
              obj['component'] = symbol_field.trim();
              break;
            case 3:
              obj['name'] = symbol_field.trim();
              break;
            default:
              console.log('符号文件中有冗余列');
          }
        });
        symbols.push(obj);
      }
    });
    circuitData.symbols = symbols;

    // 构建约束
    const constraintFile = fs.readFileSync(constraintFilePath, 'utf-8');
    const constraintJSON = JSON.parse(constraintFile);
    const constraints: any[] = [];

    // JSON约束格式
    // https://docs.circom.io/circom-language/formats/constraints-json/
    for (const constraintList of constraintJSON.constraints) {
      // 遍历所有约束
      let obj = {
        coefficient_A: [] as string[],
        lin_expr_A: [] as string[],
        coefficient_B: [] as string[],
        lin_expr_B: [] as string[],
        coefficient_C: [] as string[],
        lin_expr_C: [] as string[],
      };

      for (const linear_expresion of constraintList) {
        // 遍历每个约束的线性表达式
        let linear_expresion_index = constraintList.indexOf(linear_expresion);
        let keys: string[] = [];
        let values: string[] = [];

        for (const [key, value] of Object.entries(linear_expresion)) {
          keys.push(key);
          values.push(readable_coefficient(String(value)))
        }

        switch (linear_expresion_index) {
          case 0:
            obj.lin_expr_A.push(...keys);
            obj.coefficient_A.push(...values);
            break;
          case 1:
            obj.lin_expr_B.push(...keys);
            obj.coefficient_B.push(...values);
            break;
          case 2:
            obj.lin_expr_C.push(...keys);
            obj.coefficient_C.push(...values);
            break;
          default:
            console.log('约束解析溢出');
        }
      }
      constraints.push(obj);
    };
    circuitData.constraints = constraints;
    console.log(circuitData.constraints);

    // 构建替换
    const substitutionFile = fs.readFileSync(substitutionFilePath, 'utf-8');
    const substitutions = JSON.parse(substitutionFile);

    // 替换格式
    // 遍历整个json文件，对值应用readable_coefficient函数
    const format_sub: any = {};
    for (const sub_key in substitutions) {
      if (substitutions.hasOwnProperty(sub_key)) {
        const innerObj = substitutions[sub_key];
        format_sub[sub_key] = {};

        for (const innerKey in innerObj) {
          if (innerObj.hasOwnProperty(innerKey)) {
            const innerValue = readable_coefficient(String(innerObj[innerKey]))
            format_sub[sub_key][innerKey] = innerValue.toString();
          }
        }
      }
    }
    // 使用格式化后的 substitutions
    circuitData.substitutions = format_sub;

    // 转换 R1CS 到 QAP
    const qapData = convertR1CStoQAP(circuitData);

    // 将 qapData 中的 BigInt 转换为字符串后再赋值给 circuitData.qap
    const serializedQap = JSON.parse(JSON.stringify(qapData, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
    circuitData.qap = serializedQap;

    // 保存 QAP 数据到文件
    const qapFilePath = path.join(folderPath, `${path.basename(filePath, '.circom')}_qap.json`);
    await fs.promises.writeFile(qapFilePath, JSON.stringify(serializedQap, null, 2));
    console.log(`QAP 数据已保存到: ${qapFilePath}`);

    // 确保返回的数据中包含QAP数据
    return buildDAG(circuitData);
  });
}

/**
 * 编译Circom代码
 * @param folderPath 编译输出文件夹路径
 * @param filePath 源文件路径
 * @returns 包含编译生成的文件路径的对象
 */
async function compileCircomCode(folderPath: string, filePath: string): Promise<{ symbolFilePath: string, constraintFilePath: string, substitutionFilePath: string }> {
  const libraryPath = path.join(__dirname, '..', '..');

  try {
    const { stdout, stderr } = await execPromise(`circom -l ${libraryPath} -o ${folderPath} ${filePath} --sym --json --simplification_substitution --O2`);
    const stdoutLines = stdout.split('\n');

    let symbolFilePath = '';
    let constraintFilePath = '';
    let substitutionFilePath = '';

    stdoutLines.forEach(line => {
      if (line.trim().endsWith('.sym')) {
        symbolFilePath = line.trim().split(' ')[2];
      }
      if (line.trim().endsWith('constraints.json')) {
        constraintFilePath = line.trim().split(' ')[3];
      }
      if (line.trim().endsWith('substitutions.json')) {
        substitutionFilePath = line.trim().split(' ')[2];
      }
    });

    if (!symbolFilePath || !constraintFilePath) {
      throw new Error('在输出中未找到符号文件或约束文件。');
    }
    if (stderr) {
      throw new Error(stderr);
    }
    return { symbolFilePath, constraintFilePath, substitutionFilePath };
  } catch (error: any) {
    throw new Error(`编译Circom代码失败: ${error.message}`);
  }
}