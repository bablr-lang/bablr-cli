#! /usr/bin/env node

/* global process */

import { program } from 'commander';
import { streamParseAsync as streamParse } from 'bablr';
import { sourceFromReadStream } from '@bablr/helpers/source';
import { printTerminal } from '@bablr/agast-helpers/stream';

program
  .option('-l, --language [URL]', 'The URL of the BABLR language to parse with')
  .option('-p, --production [type]', 'The top-level type for the parse')
  .option('-f, --formatted', 'Whether to pretty-format the CSTML output')
  .parse(process.argv);

const options = program.opts();

const language = await import(options.language);

let indentAmt = 0;

for await (const token of streamParse(
  language,
  options.production,
  sourceFromReadStream(process.stdin.setEncoding('utf-8')),
)) {
  if (token.type === 'OpenNodeTag') {
    indentAmt++;
  }

  const out = options.formatted
    ? `${'  '.repeat(indentAmt)}${printTerminal(token)}\n`
    : printTerminal(token);

  if (token.type === 'CloseNodeTag') {
    indentAmt--;
  }

  process.stdout.write(out);
}
