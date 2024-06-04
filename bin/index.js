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
import { pipeline } from 'node:stream/promises';
import { generateCSTML, generateColorfulCSTML } from '../lib/syntax.js';

program
  .option('-l, --language [URL]', 'The URL of the BABLR language to parse with')
  .option('-p, --production [type]', 'The top-level type for the parse')
  .option('-f, --format', 'Pretty-format CSTML output')
  .option('-F, --no-format', 'Produce machine-readable CSTML output')
  .option('-v, --verbose', 'Prints debugging information to stderr')
  .option('-c, --color', 'Force colored output', true)
  .option('-C, --no-color', 'Do not color output')
  .option('-e, --embedded', 'Requires quoted input but enables gap parsing')
  .parse(process.argv);

const options = program.opts();

const enableAnsi = colorSupport.hasBasic && options.color;

const language = await import(options.language);

const logStderr = (...args) => {
  process.stderr.write(args.join(' ') + '\n');
};

const enhancers = options.verbose ? { ...buildDebugEnhancers(logStderr), agastStrategy: null } : {};

const rawStream = process.stdin.setEncoding('utf-8');

const generateCSTML_ = enableAnsi ? generateColorfulCSTML : generateCSTML;

pipeline(
  generateCSTML_(
    streamParse(
      language,
      options.production,
      options.embedded
        ? embeddedSourceFromReadStream(rawStream)
        : stripTrailingNewline(sourceFromReadStream(rawStream)),
      {},
      enhancers,
    ),
  ),
  process.stdout,
);
