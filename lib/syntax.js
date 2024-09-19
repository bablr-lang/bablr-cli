/* global process Promise */

import emptyStack from '@iter-tools/imm-stack';
import * as cstml from '@bablr/language-en-cstml';
import * as verboseOutput from '@bablr/language-en-bablr-cli-verbose-output';
import { streamParse, Context, AgastContext } from 'bablr/enhanceable';
import { Coroutine } from '@bablr/coroutine';
import { StreamIterable, getStreamIterator, generateAllOutput } from '@bablr/agast-helpers/stream';
import {
  generatePrettyCSTMLStrategy,
  generateCSTMLStrategy as generatePlainCSTMLStrategy,
} from '@bablr/helpers/stream';
import {
  buildWriteEffect,
  buildAnsiPushEffect,
  buildAnsiPopEffect,
} from '@bablr/agast-helpers/builders';
import { buildFullyQualifiedSpamMatcher } from '@bablr/agast-vm-helpers';
import { OpenNodeTag, CloseNodeTag, ReferenceTag, LiteralTag } from '@bablr/agast-helpers/symbols';

function* __higlightStrategy(context, tokens) {
  const co = new Coroutine(getStreamIterator(tokens));

  let types = emptyStack;

  let currentRef;

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.done) break;

    const tag = co.value;

    if (tag.type === OpenNodeTag) {
      const tagType = tag.value.type;
      const currentType = types.value;

      types = types.push(tagType);

      if (
        tagType === Symbol.for('LiteralTag') ||
        (tagType === Symbol.for('String') && currentRef.name === 'intrinsicValue')
      ) {
        if (tagType === Symbol.for('LiteralTag') || currentType === Symbol.for('OpenNodeTag')) {
          yield buildAnsiPushEffect('bold green');
        } else if (currentType === Symbol.for('OpenNodeMatcher')) {
          yield buildAnsiPushEffect('bold orange');
        } else {
          yield buildAnsiPushEffect();
        }
      } else if (
        tagType === Symbol.for('Pattern') &&
        tag.value.language !== 'https://bablr.org/languages/core/en/spamex'
      ) {
        yield buildAnsiPushEffect('bold orange');
      } else if (tagType === Symbol.for('EscapeSequence')) {
        yield buildAnsiPushEffect('bold cyan');
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
        (currentType === Symbol.for('Tuple') &&
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

    if (tag.type === CloseNodeTag) {
      types = types.pop();
      yield buildAnsiPopEffect();
    }

    if (tag.type === LiteralTag) {
      yield buildWriteEffect(tag.value);
    } else if (tag.type === OpenNodeTag && tag.value.intrinsicValue) {
      yield buildWriteEffect(tag.value.intrinsicValue);
      yield buildAnsiPopEffect();
    }

    co.advance();
  }
}

export const higlightStrategy = (context, tokens) => {
  return new StreamIterable(__higlightStrategy(context, tokens));
};

export const createPrintCSTMLStrategy =
  (tokens, options = {}) =>
  () => {
    const strategyOptions = {
      ctx: options.ctx,
      emitEffects: options.emitEffects,
    };
    const outputInstructions = options.format
      ? generatePrettyCSTMLStrategy(tokens, strategyOptions)
      : generatePlainCSTMLStrategy(tokens, strategyOptions);

    if (options.color) {
      const input = generateAllOutput(outputInstructions);

      const language = options.emitEffects ? verboseOutput : cstml;
      const type = options.emitEffects ? 'Output' : 'Document';

      const context = Context.from(AgastContext.create(), language);

      const tokens = streamParse(
        context,
        buildFullyQualifiedSpamMatcher({}, language.canonicalURL, type),
        input,
      );

      return higlightStrategy(context, tokens);
    } else {
      return outputInstructions;
    }
  };
