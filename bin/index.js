#! /usr/bin/env node

/* global process */

import { program } from 'commander';
import { streamParse, Context } from 'bablr';
import { embeddedSourceFrom, readFromStream, stripTrailingNewline } from '@bablr/helpers/source';
import { debugEnhancers } from '@bablr/helpers/enhancers';
import colorSupport from 'color-support';
import { evaluateIO } from '@bablr/io-vm-node';
import { generateCSTML } from '../lib/syntax.js';
import {
  buildBasicNodeMatcher,
  buildOpenNodeMatcher,
  buildPropertyMatcher,
} from '@bablr/helpers/builders';
import { evaluateReturnAsync } from '@bablr/agast-helpers/tree';
import { buildEmbeddedMatcher } from '@bablr/agast-vm-helpers/builders';
import { o } from '@bablr/helpers/grammar';

program
  .name('bablr')
  .option('-l, --language [URL]', 'The URL of the top BABLR language')
  .option('-p, --production [type]', 'The name of the top production type')
  .option('-f, --format', 'Pretty-format CSTML output', true)
  .option('-g, --has-gap', 'Sets hasGap flag on root matcher')
  .option('-r, --fragment', 'Sets fragment flag on root matcher')
  .option('-t --token', 'Sets token flag on root matcher')
  .option('-o --cover', 'Sets cover flag on root matcher')
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

const matcher = buildEmbeddedMatcher(
  buildPropertyMatcher(
    null,
    buildBasicNodeMatcher(
      buildOpenNodeMatcher(
        {
          hasGap: options.hasGap,
          fragment: options.fragment,
          token: options.token,
          cover: options.cover,
        },
        language.canonicalURL,
        options.production,
      ),
    ),
  ),
);

const logStderr = (...args) => {
  process.stderr.write(args.join(' ') + '\n');
};

const enhancers = options.verbose ? { ...debugEnhancers, agast: null } : {};

const ctx = Context.from(language, enhancers.bablrProduction);

const rawStream = process.stdin.setEncoding('utf-8');

const output = evaluateIO(() =>
  generateCSTML(
    streamParse(
      ctx,
      matcher,
      options.embedded
        ? embeddedSourceFrom(readFromStream(rawStream))
        : stripTrailingNewline(readFromStream(rawStream)),
      o({}),
      { enhancers, emitEffects: true },
    ),
    {
      ctx,
      color: options.color,
      format: options.format,
      emitEffects: true,
    },
  ),
);

await evaluateReturnAsync(output);
