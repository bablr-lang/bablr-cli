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

    const token = co.value;

    if (token.type === 'OpenNodeTag') {
      const tagType = token.value.type;
      const currentType = types.value;

      types = types.push(tagType);

      if (tagType === 'Literal' || (tagType === 'String' && currentRef.name === 'intrinsicValue')) {
        if (tagType === 'Literal' || currentType === 'OpenNodeTag') {
          yield buildAnsiPushEffect('bold green');
        } else if (currentType === 'NodeMatcher') {
          yield buildAnsiPushEffect('bold orange');
        } else {
          yield buildAnsiPushEffect();
        }
      } else if (tagType === 'Pattern') {
        yield buildAnsiPushEffect('bold orange');
      } else if (tagType === 'EscapeSequence') {
        yield buildAnsiPushEffect('bold cyan');
      } else if (tagType === 'Identifier') {
        if (currentType === 'Reference') {
          yield buildAnsiPushEffect('bold gray');
        } else if (currentType === 'Call') {
          yield buildAnsiPushEffect('magenta bold');
        } else {
          yield buildAnsiPushEffect();
        }
      } else if (tagType === 'EnterProductionLine' || tagType === 'LeaveProductionLine') {
        yield buildAnsiPushEffect('blue bold');
      } else if (
        (currentRef?.name === 'sigilToken' &&
          (currentType === 'ExecSpamexInstructionLine' ||
            currentType === 'ExecCSTMLInstructionLine')) ||
        (currentType === 'Tuple' &&
          (currentRef.name === 'openToken' || currentRef.name === 'closeToken'))
      ) {
        yield buildAnsiPushEffect('magenta bold');
      } else {
        yield buildAnsiPushEffect();
      }
    }

    if (token.type === 'Reference') {
      currentRef = token.value;
    }

    if (token.type === 'CloseNodeTag') {
      types = types.pop();
      yield buildAnsiPopEffect();
    }

    if (token.type === 'Literal') {
      yield buildWriteEffect(token.value);
    } else if (token.type === 'OpenNodeTag' && token.value.intrinsicValue) {
      yield buildWriteEffect(token.value.intrinsicValue);
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
