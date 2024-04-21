#! /usr/bin/env node

/* global process */

import { program } from 'commander';
import { streamParse } from 'bablr';
import { sourceFromReadStream } from '@bablr/helpers/source';
import { buildDebugEnhancers } from '@bablr/helpers/enhancers';
import { printTerminal } from '@bablr/agast-helpers/stream';

program
  .option('-l, --language [URL]', 'The URL of the BABLR language to parse with')
  .option('-p, --production [type]', 'The top-level type for the parse')
  .option('-f, --formatted', 'Whether to pretty-format the CSTML output')
  .option('-v, --verbose', 'Whether to print debug logging to stderr during parsing')
  .parse(process.argv);

const options = program.opts();

const language = await import(options.language);

let indentAmt = 0;

const logStderr = (...args) => {
  process.stderr.write(args.join(' ') + '\n');
};

const enhancers = options.verbose ? { ...buildDebugEnhancers(logStderr), emitStrategy: null } : {};

for await (const token of streamParse(
  language,
  options.production,
  sourceFromReadStream(process.stdin.setEncoding('utf-8')),
  {},
  enhancers,
)) {
  if (token.type === 'OpenNodeTag') {
    indentAmt++;
  }

  const offset =
    token.type === 'Null' ? 2 : ['Literal', 'Gap', 'Reference'].includes(token.type) ? 1 : 0;

  const out = options.formatted
    ? `${'  '.repeat(indentAmt + offset)}${printTerminal(token)}`
    : printTerminal(token);

  if (token.type === 'CloseNodeTag') {
    indentAmt--;
  }

  process.stdout.write(out + '\n');
}
