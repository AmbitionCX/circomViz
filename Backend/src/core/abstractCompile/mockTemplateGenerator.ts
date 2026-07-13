import type { TemplateInterface, SignalPort } from './interfaceExtractor.js';

export interface MockTemplateOptions {
  mockPrefix: string;
}

export interface MockTemplateResult {
  templateName: string;
  source: string;
  isValidator: boolean;
}

function formatArrayDecl(port: SignalPort): string {
  if (!port.isArray || port.arraySizes.length === 0) return '';
  return port.arraySizes.map((s) => `[${s}]`).join('');
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
    return `${this.prefix}${originalName}_Mock`;
  }

  generate(iface: TemplateInterface): MockTemplateResult {
    const name = this.mockName(iface.templateName);
    const params = iface.parameters.map((p) => {
      const arr = p.isArray ? '[]' : '';
      return `${p.name}${arr}`;
    }).join(', ');

    const lines: string[] = [];
    lines.push(`template ${name}(${params}) {`);

    for (const inp of iface.inputs) {
      lines.push(`    signal input ${inp.name}${formatArrayDecl(inp)};`);
    }
    for (const out of iface.outputs) {
      lines.push(`    signal output ${out.name}${formatArrayDecl(out)};`);
    }

    const isValidator = iface.outputs.length === 0;

    if (!isValidator) {
      lines.push('');
      for (const out of iface.outputs) {
        const mockIn = formatMockInputName(out.name);
        lines.push(`    signal input ${mockIn}${formatArrayDecl(out)};`);
      }
      lines.push('');
      for (const out of iface.outputs) {
        const mockIn = formatMockInputName(out.name);
        if (out.isArray) {
          const len = out.arraySizes[0];
          lines.push(`    for (var __i = 0; __i < ${len}; __i++) {`);
          lines.push(`        ${out.name}[__i] <== ${mockIn}[__i];`);
          lines.push(`    }`);
        } else {
          lines.push(`    ${out.name} <== ${mockIn};`);
        }
      }
    }

    lines.push('}');

    return {
      templateName: name,
      source: lines.join('\n'),
      isValidator,
    };
  }

  mockInputName(outputName: string): string {
    return formatMockInputName(outputName);
  }
}

export { formatMockInputName, formatArrayDecl };
