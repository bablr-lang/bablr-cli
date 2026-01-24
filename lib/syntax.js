/* global process Promise */

import emptyStack from '@iter-tools/imm-stack';
import cstml from '@bablr/language-en-cstml';
import verboseOutput from '@bablr/language-en-bablr-cli-verbose-output';
import { streamParse } from 'bablr';
import { Coroutine } from '@bablr/coroutine';
import { StreamIterable, getStreamIterator, hoistTrivia, wait } from '@bablr/agast-helpers/stream';
import {
  generateAllOutput,
  writeCSTMLStrategy,
  writePrettyCSTMLStrategy,
} from '@bablr/agast-vm-helpers/stream';
import {
  buildWriteEffect,
  buildAnsiPushEffect,
  buildAnsiPopEffect,
  buildEmbeddedMatcher,
} from '@bablr/agast-vm-helpers/builders';
import { OpenNodeTag, CloseNodeTag, ReferenceTag, LiteralTag } from '@bablr/agast-helpers/symbols';
import {
  buildTreeNodeMatcher,
  buildNodeFlags,
  buildTreeNodeMatcherOpen,
  buildPropertyMatcher,
  buildBoundNodeMatcher,
} from '@bablr/helpers/builders';
import { getFlagsWithGap, nodeFlags } from '@bablr/agast-helpers/builders';
import { o } from '@bablr/helpers/grammar';

let gapNodeFlags = getFlagsWithGap(nodeFlags);

function* __higlightStrategy(tags) {
  const co = new Coroutine(getStreamIterator(tags));

  let names = emptyStack;

  let currentRef;

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    if (co.done) break;

    const tag = co.value;

    if (tag.type === OpenNodeTag) {
      const tagName = tag.value.name;
      const currentName = names.value;

      names = names.push(tagName);

      if (tagName === Symbol.for('Alternative')) {
        yield buildAnsiPushEffect('reset');
      } else if (
        tagName === Symbol.for('Character') ||
        (currentName === Symbol.for('Pattern') &&
          ['openToken', 'closeToken', 'flags'].includes(currentRef?.name)) ||
        (tagName === Symbol.for('String') && currentName === Symbol.for('TreeNodeMatcherOpen'))
      ) {
        yield buildAnsiPushEffect('bold orange');
      } else if (
        tagName === Symbol.for('LiteralTag') ||
        (tagName === Symbol.for('String') && currentRef.name === 'literalValue')
      ) {
        if (tagName === Symbol.for('LiteralTag') || currentName === Symbol.for('OpenNodeTag')) {
          yield buildAnsiPushEffect('bold green');
        } else {
          yield buildAnsiPushEffect();
        }
      } else if (tagName === Symbol.for('EscapeSequence')) {
        yield buildAnsiPushEffect('bold cyan');
      } else if (tagName === Symbol.for('Identifier')) {
        if (
          currentName === Symbol.for('ReferenceTag') ||
          currentName === Symbol.for('ReferenceMatcher')
        ) {
          yield buildAnsiPushEffect('bold gray');
        } else if (currentName === Symbol.for('Call')) {
          yield buildAnsiPushEffect('magenta bold');
        } else {
          yield buildAnsiPushEffect();
        }
      } else if (
        tagName === Symbol.for('EnterProductionLine') ||
        tagName === Symbol.for('LeaveProductionLine')
      ) {
        yield buildAnsiPushEffect('blue bold');
      } else if (
        (currentRef?.name === 'sigilToken' && currentName === Symbol.for('ExecInstructionLine')) ||
        (currentName === Symbol.for('Call') &&
          (currentRef.name === 'openToken' || currentRef.name === 'closeToken'))
      ) {
        yield buildAnsiPushEffect('magenta bold');
      } else if (tagName === null && tag.value.flags.token) {
        if (
          currentName === Symbol.for('ReferenceTag') ||
          currentName === Symbol.for('ReferenceMatcher') ||
          currentName === Symbol.for('ReferenceFlags')
        ) {
          yield buildAnsiPushEffect('bold gray');
        } else {
          yield buildAnsiPushEffect();
        }
      } else {
        yield buildAnsiPushEffect();
      }
    }

    if (tag.type === ReferenceTag) {
      currentRef = tag.value;
    }

    if (tag.type === LiteralTag) {
      yield buildWriteEffect(tag.value);
    } else if (tag.type === OpenNodeTag && tag.value.literalValue) {
      yield buildWriteEffect(tag.value.literalValue);
    }

    yield tag;

    if (tag.type === CloseNodeTag || (tag.type === OpenNodeTag && tag.value.selfClosing)) {
      names = names.pop();
      yield buildAnsiPopEffect();
    }

    co.advance();
  }
}

export const higlightStrategy = (tags) => {
  return new StreamIterable(__higlightStrategy(tags));
};

export const generateCSTML = (tags, options = {}) => {
  const outputInstructions = options.format
    ? writePrettyCSTMLStrategy(tags)
    : writeCSTMLStrategy(tags);

  if (options.color) {
    const input = generateAllOutput(outputInstructions);
    const language = options.verbose ? verboseOutput : cstml;
    const name = options.verbose ? 'Output' : 'Document';

    const tags = streamParse(
      language,
      buildEmbeddedMatcher(
        buildPropertyMatcher(
          null,
          buildBoundNodeMatcher(
            [],
            buildTreeNodeMatcher(
              buildTreeNodeMatcherOpen(buildNodeFlags(gapNodeFlags), null, name),
            ),
          ),
        ),
      ),
      input,
      o({}),
      { tree: false },
    );

    return higlightStrategy(hoistTrivia(tags));
  } else {
    return outputInstructions;
  }
};
