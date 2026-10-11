// @ts-check
const ts = require('typescript');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');

// These suites test pure TypeScript rules and palettes, without native modules.
module.exports = {
  /**
   * @param {string} source
   * @param {string} filename
   * @param {{configString: string, instrument: boolean}} options
   */
  getCacheKey(source, filename, options) {
    return createHash('sha256')
      .update(ts.version)
      .update(readFileSync(__filename))
      .update(options.configString)
      .update(String(options.instrument))
      .update(filename)
      .update(source)
      .digest('hex');
  },
  /**
   * @param {string} source
   * @param {string} filename
   */
  process(source, filename) {
    const output = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        sourceMap: true,
        inlineSources: true,
      },
    });
    const map = JSON.parse(output.sourceMapText || '{}');
    map.sources = [filename];
    map.file = filename;
    return {
      code: output.outputText,
      map,
    };
  },
};
