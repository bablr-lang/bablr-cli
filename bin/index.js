#! /usr/bin/env node

/* global process */
import '@bablr/record';
import { program } from 'commander';
import { buildModule } from 'bablr/enhanceable';
import { embeddedSourceFrom, readFromStream, stripTrailingNewline } from '@bablr/helpers/source';
import { debugEnhancers } from '@bablr/helpers/enhancers';
import { resolve } from 'node:path';
import colorSupport from 'color-support';
import { evaluate } from '@bablr/io-vm';
import { writeOutput, style } from '../lib/syntax.js';
import { evaluateReturn } from '@bablr/agast-helpers/tree';
import { printIdentifier } from '@bablr/agast-helpers/print';
import { o, m } from '@bablr/helpers/grammar';
import { freezeRecord } from '@bablr/agast-helpers/object';
import { hoist, transformStream, transformStreams } from '@bablr/agast-helpers/stream';
import { readFile, decodeUTF8 } from '@bablr/fs';

program
  .name('bablr')
  .requiredOption('-l, --language [URL]', 'The URL of the top BABLR language')
  .option('-p, --production [name]', 'Shorthand: sets the named node matcher as root matcher')
  .option('-m, --matcher [matcher]', 'Sets the root matcher')
  .option('-s, --shift', 'Allows shifting')
  .option('-S, --no-shift', 'Disallows shifting')
  .option('-h, --hoist', 'Hoists content out of covers, emitting only nodes', true)
  .option('-H, --no-hoist', 'Emits regular nodes and cover nodes')
  .option('-f, --file <file>', 'Reads input from a file')
  .option('-i, --interactive', 'Reads input from standard in')
  .option('-c, --compact', 'Output CSTML on one line without spaces')
  .option('-v, --verbose', 'Prints debugging information to stderr')
  .option(
    '--color [WHEN]',
    'When to use ANSI escape colors \n  WHEN: "auto" | "always" | "never"',
    'auto',
  )
  .option('-e, --embedded', 'Requires quoted input but enables gap parsing')
  .parse(process.argv);

let programOpts = program.opts();

if (programOpts.color && !['auto', 'always', 'never'].includes(programOpts.color.toLowerCase())) {
  throw new Error('invalid value for --color');
}

let options = {
  ...programOpts,
  color:
    (programOpts.color.toLowerCase() === 'auto' && colorSupport.hasBasic) ||
    programOpts.color.toLowerCase() === 'always',
};

if (options.file && options.interactive) {
  throw new Error('--file and --interactive are exclusive options');
} else if (!options.file && !options.interactive && process.stdin.isTTY) {
  throw new Error('No input given');
}

let { default: language } = await import(
  './'.includes(options.language[0]) ? resolve(options.language) : options.language
);

let parsedMatcher = null;

if (options.matcher) {
  try {
    parsedMatcher = m({ raw: [options.matcher] });
  } catch (e) {
    throw new Error('Matcher given but could not be parsed', { cause: e });
  }
}

let matcher = parsedMatcher
  ? parsedMatcher
  : options.production
  ? m`<{printIdentifier(options.production)} />`
  : language.defaultMatcher;

if (!matcher) {
  throw new Error('No matcher given with -m or -p, and no default matcher given by language');
}

let logStderr = (...args) => {
  process.stderr.write(args.join(' ') + '\n');
};

let enhancers = freezeRecord(options.verbose ? { ...debugEnhancers, agast: null } : {});

let { streamParse } = buildModule(enhancers);

let rawStream = process.stdin.setEncoding('utf-8');

Error.stackTraceLimit = 20;

let input = options.file
  ? decodeUTF8(readFile(options.file))
  : stripTrailingNewline(readFromStream(rawStream));

await evaluateReturn(
  evaluate(() => {
    let tags = streamParse(
      language,
      matcher,
      options.embedded ? embeddedSourceFrom(input) : input,
      o({}),
      freezeRecord({
        enhancers,
        emitEffects: !!options.verbose,
        holdShiftedNodes: !options.shift,
        // holdUndefinedAttributes: !options.gaps,
        tree: false,
      }),
    );

    if (options.hoist) {
      tags = hoist(tags);
    }

    let printed = transformStream(tags, 1, (tags) =>
      writeOutput(
        tags,
        freezeRecord({
          compact: options.compact,
          indent: '  ',
        }),
      ),
    );

    if (options.color) {
      printed = transformStreams(printed, (tags) => style(tags));
    }

    return printed;
  }),
);
