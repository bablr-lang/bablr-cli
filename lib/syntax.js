/* global process Promise */

import emptyStack from '@iter-tools/imm-stack';
import cstml from '@bablr/language-en-cstml';
import verboseOutput from '@bablr/language-en-bablr-cli-verbose-output';
import { streamParse } from 'bablr/enhanceable';
import { Coroutine } from '@bablr/coroutine';
import { StreamIterable, getStreamIterator, wait } from '@bablr/agast-helpers/stream';
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
  buildBasicNodeMatcher,
  buildNodeFlags,
  buildOpenNodeMatcher,
  buildPropertyMatcher,
} from '@bablr/helpers/builders';
import { getFlagsWithGap, nodeFlags } from '@bablr/agast-helpers/builders';

let gapNodeFlags = getFlagsWithGap(nodeFlags);

function* __higlightStrategy(tags) {
  const co = new Coroutine(getStreamIterator(tags));

  let types = emptyStack;

  let currentRef;

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    if (co.done) break;

    const tag = co.value;

    if (tag.type === OpenNodeTag) {
      const tagType = tag.value.type;
      const currentType = types.value;

      types = types.push(tagType);

      if (
        tagType === Symbol.for('LiteralTag') ||
        (tagType === Symbol.for('String') && currentRef.name === 'literalValue')
      ) {
        if (tagType === Symbol.for('LiteralTag') || currentType === Symbol.for('OpenNodeTag')) {
          yield buildAnsiPushEffect('bold green');
        } else if (currentType === Symbol.for('TreeNodeMatcherOpen')) {
          yield buildAnsiPushEffect('bold orange');
        } else {
          yield buildAnsiPushEffect();
        }
      } else if (tagType === Symbol.for('Pattern')) {
        yield buildAnsiPushEffect('bold orange');
      } else if (tagType === Symbol.for('EscapeSequence')) {
        yield buildAnsiPushEffect('bold cyan');
      } else if (tagType === null && tag.value.flags.token) {
        if (currentType === Symbol.for('ReferenceTag')) {
          yield buildAnsiPushEffect('bold gray');
        } else {
          yield buildAnsiPushEffect();
        }
      } else if (tagType === Symbol.for('Identifier')) {
        if (currentType === Symbol.for('ReferenceTag')) {
          yield buildAnsiPushEffect('bold gray');
        } else if (currentType === Symbol.for('Call')) {
          yield buildAnsiPushEffect('magenta bold');
        } else {
          yield buildAnsiPushEffect();
        }
      } else if (
        tagType === Symbol.for('EnterProductionLine') ||
        tagType === Symbol.for('LeaveProductionLine')
      ) {
        yield buildAnsiPushEffect('blue bold');
      } else if (
        (currentRef?.name === 'sigilToken' &&
          (currentType === Symbol.for('ExecSpamexInstructionLine') ||
            currentType === Symbol.for('ExecCSTMLInstructionLine'))) ||
        (currentType === Symbol.for('Call') &&
          (currentRef.name === 'openToken' || currentRef.name === 'closeToken'))
      ) {
        yield buildAnsiPushEffect('magenta bold');
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
      types = types.pop();
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
    const language = options.emitEffects ? verboseOutput : cstml;
    const type = options.emitEffects ? 'Output' : 'Document';

    const tags = streamParse(
      language,
      buildEmbeddedMatcher(
        buildPropertyMatcher(
          null,
          null,
          buildBasicNodeMatcher(buildOpenNodeMatcher(buildNodeFlags(gapNodeFlags), type)),
        ),
      ),
      input,
    );

    return higlightStrategy(tags);
  } else {
    return outputInstructions;
  }
};
