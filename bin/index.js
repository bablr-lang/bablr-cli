#! /usr/bin/env node

/* global process */

import { program } from 'commander';
import { streamParse } from 'bablr';
import {
  embeddedSourceFromReadStream,
  sourceFromReadStream,
  stripTrailingNewline,
} from '@bablr/helpers/source';
import { buildDebugEnhancers } from '@bablr/helpers/enhancers';
import colorSupport from 'color-support';
import { generateCSTML } from '../lib/syntax.js';
import { writeLinesToWritableStream } from '../lib/utils/node.js';

program
  .option('-l, --language [URL]', 'The URL of the BABLR language to parse with')
  .option('-p, --production [type]', 'The top-level type for the parse')
  .option('-F, --no-format', 'Produce machine-readable CSTML output')
  .option('-f, --format', 'Pretty-format CSTML output')
  .option('-v, --verbose', 'Prints debugging information to stderr')
  .option('-c, --color', 'Force colored output', true)
  .option('-C, --no-color', 'Do not color output')
  .option('-e, --embedded', 'Requires quoted input but enables gap parsing')
  .parse(process.argv);

const programOpts = program.opts();
const options = { ...programOpts, color: colorSupport.hasBasic && programOpts.color };

const language = await import(options.language);

const logStderr = (...args) => {
  process.stderr.write(args.join(' ') + '\n');
};

if (options.verbose && options.color) {
  // ANSI formatting escapes don't keep separate spanning stacks for stdin and sterr
  // this means you NEED a parser that ingests a combination of log and output if you
  // want to be able to highlight the complete output without breakage
  // It can be built, but I haven't yet
  throw new Error('Unsupported combination of options: verbose and color');
}

const enhancers = options.verbose ? { ...buildDebugEnhancers(logStderr), agastStrategy: null } : {};

const rawStream = process.stdin.setEncoding('utf-8');

await writeLinesToWritableStream(
  generateCSTML(
    streamParse(
      language,
      options.production,
      options.embedded
        ? embeddedSourceFromReadStream(rawStream)
        : stripTrailingNewline(sourceFromReadStream(rawStream)),
      {},
      enhancers,
    ),
    options,
  ),
  process.stdout,
);
