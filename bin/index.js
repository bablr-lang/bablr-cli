#! /usr/bin/env node

/* global process */

import { program } from 'commander';
import { streamParse, Context, AgastContext } from 'bablr';
import { embeddedSourceFrom, readFromStream, stripTrailingNewline } from '@bablr/helpers/source';
import { debugEnhancers } from '@bablr/helpers/enhancers';
import colorSupport from 'color-support';
import { evaluateIO } from '@bablr/io-vm-node';
import { createPrintCSTMLStrategy } from '../lib/syntax.js';
import { buildFullyQualifiedSpamMatcher } from '@bablr/agast-vm-helpers';

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
    (programOpts.color.toLowerCase() === 'auto' && colorSupport.hasBasic) ||
    programOpts.color.toLowerCase() === 'always',
};

const language = await import(options.language);

const matcher = buildFullyQualifiedSpamMatcher({}, language.canonicalURL, options.production);

const logStderr = (...args) => {
  process.stderr.write(args.join(' ') + '\n');
};

const enhancers = options.verbose ? { ...debugEnhancers, agast: null } : {};

const ctx = Context.from(AgastContext.create(), language, enhancers.bablrProduction);

const rawStream = process.stdin.setEncoding('utf-8');

await evaluateIO(
  createPrintCSTMLStrategy(
    streamParse(
      ctx,
      matcher,
      options.embedded
        ? embeddedSourceFrom(readFromStream(rawStream))
        : stripTrailingNewline(readFromStream(rawStream)),
      {},
      { enhancers, emitEffects: true },
    ),
    {
      ctx,
      emitEffects: !!options.verbose,
      color: options.color,
      format: options.format,
    },
  ),
);
