import type { TemplateInterface, SignalPort } from './interfaceExtractor.js';

export interface MockTemplateOptions {
  mockPrefix: string;
}

export interface MockOutputBinding {
  outputName: string;
  mockInputName: string;
  port: SignalPort;
}

export interface MockTemplateResult {
  templateName: string;
  source: string;
  isValidator: boolean;
  outputBindings: MockOutputBinding[];
}

function formatArrayDecl(port: SignalPort): string {
  if (!port.isArray || port.arraySizes.length === 0) return '';
  return port.arraySizes.map((size) => `[${size}]`).join('');
}

function formatMockInputName(outputName: string): string {
  return `__mock_${outputName}`;
}

export class MockTemplateGenerator {
  private prefix: string;

  constructor(opts: Partial<MockTemplateOptions> = {}) {
    this.prefix = opts.mockPrefix ?? '';
  }

  mockName(originalName: string): string {
    return `${this.prefix}${originalName}_mocked`;
  }

  generate(iface: TemplateInterface): MockTemplateResult {
    const name = this.mockName(iface.templateName);
    const params = iface.parameters.map((parameter) => {
      const array = parameter.isArray ? '[]' : '';
      return `${parameter.name}${array}`;
    }).join(', ');
    const occupiedNames = new Set([...iface.inputs, ...iface.outputs].map((port) => port.name));
    const outputBindings: MockOutputBinding[] = iface.outputs.map((output) => {
      const base = formatMockInputName(output.name);
      let mockInputName = base;
      let counter = 1;
      while (occupiedNames.has(mockInputName)) mockInputName = `${base}_${counter++}`;
      occupiedNames.add(mockInputName);
      return { outputName: output.name, mockInputName, port: output };
    });

    const lines: string[] = [`template ${name}(${params}) {`];
    for (const variable of iface.variables ?? []) lines.push(`    var ${variable.name} = ${variable.value};`);
    if (iface.variables?.length) lines.push('');
    for (const input of iface.inputs) lines.push(`    signal input ${input.name}${formatArrayDecl(input)};`);
    for (const output of iface.outputs) lines.push(`    signal output ${output.name}${formatArrayDecl(output)};`);

    const isValidator = iface.outputs.length === 0;
    if (!isValidator) {
      lines.push('');
      for (const binding of outputBindings) {
        lines.push(`    signal input ${binding.mockInputName}${formatArrayDecl(binding.port)};`);
      }
      lines.push('');
      for (const binding of outputBindings) {
        const output = binding.port;
        if (!output.isArray || output.arraySizes.length === 0) {
          lines.push(`    ${output.name} <== ${binding.mockInputName};`);
          continue;
        }
        const loopVariables = output.arraySizes.map((_, index) => `__mock_${output.name}_i${index}`);
        output.arraySizes.forEach((size, index) => {
          lines.push(`    ${'    '.repeat(index)}for (var ${loopVariables[index]} = 0; ${loopVariables[index]} < ${size}; ${loopVariables[index]}++) {`);
        });
        const indexes = loopVariables.map((variable) => `[${variable}]`).join('');
        lines.push(`    ${'    '.repeat(loopVariables.length)}${output.name}${indexes} <== ${binding.mockInputName}${indexes};`);
        for (let index = loopVariables.length - 1; index >= 0; index--) lines.push(`    ${'    '.repeat(index)}}`);
      }
    }

    lines.push('}');
    return { templateName: name, source: lines.join('\n'), isValidator, outputBindings };
  }

  mockInputName(outputName: string): string {
    return formatMockInputName(outputName);
  }
}

export { formatMockInputName, formatArrayDecl };
