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
  .option('-l, --language [URL]', 'The URL of the top BABLR language')
  .option('-p, --production [type]', 'The name of the top production type')
  .option('-f, --format', 'Pretty-format CSTML output', true)
  .option('-F, --no-format')
  .option('-v, --verbose', 'Prints debugging information to stderr')
  .option(
    '-c, --color [WHEN]',
    'When to use ANSI escape colors \n  WHEN: "auto" | "always" | "never"',
    'auto',
  )
  .option('-e, --embedded', 'Requires quoted input but enables gap parsing')
  .parse(process.argv);

const programOpts = program.opts();

if (programOpts.color && !['auto', 'always', 'never'].includes(programOpts.color.toLowerCase())) {
  throw new Error('invalid value for --color');
}

const options = {
  ...programOpts,
  color:
    (programOpts.color.toLowerCase() === 'auto' && colorSupport.hasBasic && !programOpts.verbose) ||
    programOpts.color.toLowerCase() === 'always',
};

const language = await import(options.language);

const logStderr = (...args) => {
  process.stderr.write(args.join(' ') + '\n');
};

if (options.verbose && options.color) {
  throw new Error('TODO support this in a better way than turning off color');
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
