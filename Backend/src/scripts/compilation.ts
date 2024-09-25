import * as fs from 'fs';
import * as path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const execPromise = promisify(exec);

export async function saveCode(folderName: string, fileName: string, code: string): Promise<void> {
  const folderPath = path.join(__dirname, '..', '..', 'compilations', folderName);
  try {
    await fs.promises.mkdir(folderPath, { recursive: true });
  } catch (error: any) {
    throw new Error(`Failed to create folder: ${error.message}`);
  }

  const filePath = path.join(folderPath, fileName);
  try {
    await fs.promises.writeFile(filePath, code);
  } catch (error: any) {
    throw new Error(`Failed to save file: ${error.message}`);
  }

  await compileCircomCode(folderPath, filePath).then(async (result) => {
    const { symbolFile, constraintFile } = result;
    const tree = await generateDAG(symbolFile, constraintFile);

    // Build circuitTree's json file path and save it
    const treeFileName = fileName.replace('.circom', '_tree.json');
    const outputFilePath = path.join(folderPath, treeFileName);
    await exportTreeAsJSON(tree, outputFilePath).then((circuitData) => {
      return circuitData
    })
  });
}

async function compileCircomCode(folderPath: string, filePath: string): Promise<{ symbolFile: string, constraintFile: string }> {
  const libraryPath = path.join(__dirname, '..', '..');

  try {
    const { stdout, stderr } = await execPromise(`circom -l ${libraryPath} -o ${folderPath} ${filePath} --sym --json --simplification_substitution --O2`);

    const stdoutLines = stdout.split('\n');

    let symbolFile = '';
    let constraintFile = '';

    stdoutLines.forEach(line => {
      if (line.trim().endsWith('.sym')) {
        symbolFile = line.trim().split(' ')[2];
      }
      if (line.trim().endsWith('.json')) {
        constraintFile = line.trim().split(' ')[3];
      }
    });

    if (!symbolFile || !constraintFile) {
      throw new Error('Symbol file or constraint file not found in the output.');
    }

    if (stderr) {
      throw new Error(stderr);
    }

    return { symbolFile, constraintFile };

  } catch (error: any) {
    throw new Error(`Failed to compile Circom code: ${error.message}`);
  }
}

// Defining the type of linear expression in a constraint
interface LinearExpr {
  [signalId: string]: string;
}

interface Constraint {
  0: LinearExpr;  // linA
  1: LinearExpr;  // linB
  2: LinearExpr;  // linC
}

interface Symbol {
  signal: string;
  witness: string;
  component: string;
  name: string;
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
}

// Make sure all nodes contain the children attribute, or add an empty array if there are no children.
function ensureChildren(node: TreeNode): void {
  if (!node.children) {
    node.children = [];
  } else {
    node.children.forEach(ensureChildren); // Recursive processing of child nodes
  }
}

const generateDAG = async (symbolFile: string, constraintFile: string): Promise<TreeNode> => {
  // sym format: #s, #w, #c, name
  // https://docs.circom.io/circom-language/formats/sym/

  // Read the sym file
  const symFileContent = await fs.promises.readFile(symbolFile, 'utf8');
  const symLines = symFileContent.split('\n');

  // 创建 signalId 到信号名称的映射，并确保 signalId 是字符串类型
  const signalMap: { [key: string]: string } = {};
  symLines.forEach(line => {
    const parts = line.trim().split(',');
    if (parts.length >= 4) {
      const signalId = parts[0].trim(); // 第一个是信号编号
      const signalName = parts.slice(3).join(',').trim(); // 剩余部分作为信号名
      signalMap[signalId] = signalName;
    }
    // const [signal, witness, component, name] = line.split(',');
    //  symbols.push({ signal, witness, component, name });

  });
  //console.log("symbols", symbols);

  // R1CS json format
  // https://docs.circom.io/circom-language/formats/constraints-json/

  const constraintFileContent = await fs.promises.readFile(constraintFile, 'utf8');
  const constraints: Constraint[] = JSON.parse(constraintFileContent).constraints;

  //console.log("constraints", constraints);

  const root: TreeNode = { name: 'root', children: [] };

  // 处理每一个约束，将 A * B = C 关系转换为树结构
  constraints.forEach((constraint) => {
    const linA = constraint[0];
    const linB = constraint[1];
    const linC = constraint[2];

    // 将 signalId 转换为字符串类型以匹配 signalMap
    const signalAId = String(Object.keys(linA)[0]);
    const signalBId = String(Object.keys(linB)[0]);
    const signalCId = String(Object.keys(linC)[0]);

    // 确保编号能在 signalMap 中找到对应的名称
    const nodeA = { name: signalMap[signalAId] || `unknown_A (${signalAId})` };
    const nodeB = { name: signalMap[signalBId] || `unknown_B (${signalBId})` };
    const nodeC = { name: signalMap[signalCId] || `unknown_C (${signalCId})` };

    root.children?.push({
      name: nodeC.name,
      children: [nodeA, nodeB]
    });
  });

  ensureChildren(root);
  return root;
}

const exportTreeAsJSON = async (tree: TreeNode, outputFilePath: string) => {
  let circuitData = {
    "symbols": {},
    "constraints": {},
  }

  const jsonContent = JSON.stringify(tree, null, 2);
  await fs.promises.writeFile(outputFilePath, jsonContent, 'utf8');
  console.log(`Tree saved to ${outputFilePath}`);

  return circuitData;
};