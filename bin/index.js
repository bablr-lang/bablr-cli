#! /usr/bin/env node

/* global process */

import { spam as m } from '@bablr/boot';
import { program } from 'commander';
import { buildModule } from 'bablr/enhanceable';
import { embeddedSourceFrom, readFromStream, stripTrailingNewline } from '@bablr/helpers/source';
import { debugEnhancers } from '@bablr/helpers/enhancers';
import colorSupport from 'color-support';
import { evaluateIO } from '@bablr/io-vm-node';
import { generateCSTML } from '../lib/syntax.js';
import { buildIdentifier } from '@bablr/helpers/builders';
import { evaluateReturnAsync } from '@bablr/agast-helpers/tree';
import { o } from '@bablr/helpers/grammar';

program
  .name('bablr')
  .option('-l, --language [URL]', 'The URL of the top BABLR language')
  .option('-p, --production [name]', 'Shorthand: sets the named node matcher as root matcher')
  .option('-m, --matcher [matcher]', 'Sets the root matcher')
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

const { default: language } = await import(options.language);

const matcher = options.matcher
  ? m({ raw: [options.matcher] })
  : options.production
  ? m`<${buildIdentifier(options.production)} />`
  : language.defaultMatcher;

const logStderr = (...args) => {
  process.stderr.write(args.join(' ') + '\n');
};

const enhancers = options.verbose ? { ...debugEnhancers, agast: null } : {};

let { streamParse } = buildModule(enhancers);

const rawStream = process.stdin.setEncoding('utf-8');

Error.stackTraceLimit = 20;

const output = evaluateIO(() =>
  generateCSTML(
    streamParse(
      language,
      matcher,
      options.embedded
        ? embeddedSourceFrom(readFromStream(rawStream))
        : stripTrailingNewline(readFromStream(rawStream)),
      o({}),
      {
        enhancers,
        emitEffects: true,
        holdShiftedNodes: !options.gaps,
        holdUndefinedAttributes: !options.gaps,
      },
    ),
    {
      color: options.color,
      format: options.format,
      verbose: options.verbose,
    },
  ),
);

await evaluateReturnAsync(output);
