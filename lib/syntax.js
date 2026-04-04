/* global process Promise */

import emptyStack from '@iter-tools/imm-stack';
import { Coroutine } from '@bablr/coroutine';
import {
  StreamIterable,
  getStreamIterator,
  hoistTrivia,
  prettyGroupTags,
  wait,
} from '@bablr/agast-helpers/stream';
import {
  buildAnsiPushEffect,
  buildAnsiPopEffect,
  buildWriteEffect,
} from '@bablr/agast-vm-helpers/builders';
import {
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  LiteralTag,
  NullTag,
  GapTag,
} from '@bablr/agast-helpers/symbols';
import { getEmbeddedObject } from '@bablr/agast-vm-helpers/deembed';
import { buildGapTag, buildToken, streamFromTree } from '@bablr/agast-helpers/tree';
import { isString } from '@bablr/agast-helpers/object';

function* __writePrettyCSTMLStrategy(tags, options) {
  let { indent = '  ', emitEffects = false, inline: inlineOption = true } = options;

  if (!tags) {
    yield buildGapTag();
    return;
  }

  let co = new Coroutine(getStreamIterator(prettyGroupTags(hoistTrivia(tags))));
  // let co = new Coroutine(getStreamIterator(prettyGroupTags(tags)));
  let indentLevel = 0;
  let first = true;
  let inline = false;
  let ref = null;

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }
    if (co.done) break;

    let tag = co.value;

    if (tag.type === 'Effect') {
      let effect = tag.value;
      if (emitEffects && effect.verb === 'write') {
        let writeEffect = getEmbeddedObject(effect.value);

        yield buildToken(null, '\n');
        yield buildWriteEffect(
          (first ? '' : '\n') + writeEffect.text,
          getEmbeddedObject(writeEffect.options),
        );

        inline = false;
        first = false;
      } else {
        yield tag;
      }
      continue;
    }

    inline =
      inlineOption &&
      inline &&
      ref &&
      (tag.type === NullTag ||
        tag.type === GapTag ||
        (tag.type === OpenNodeTag && tag.value.selfClosing));

    if (!first && !inline) {
      yield buildToken(null, '\n');
    }

    if (tag.type === CloseNodeTag) {
      ref = null;
      if (indentLevel === 0) {
        throw new Error('imbalanced tag stack');
      }

      indentLevel--;
    }

    yield buildToken(null, inline ? ' ' : indent.repeat(indentLevel));

    yield tag;

    if (tag.type === ReferenceTag) {
      inline = true;
      ref = tag;
    }

    if (tag.type === OpenNodeTag && !tag.value.selfClosing) {
      indentLevel++;
    }

    first = false;
  }

  yield buildToken(null, '\n');
}

export const writePrettyCSTMLStrategy = (tags, options = {}) => {
  return new StreamIterable(__writePrettyCSTMLStrategy(tags, options));
};

function* __writeCSTMLStrategy(tags, options) {
  let { indent = '' } = options;

  if (!tags) {
    yield buildGapTag();
    return;
  }

  let prevTag = null;

  let co = new Coroutine(getStreamIterator(tags));
  let indentLevel = 0;
  let first = true;

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }
    if (co.done) break;

    let tag = co.value;

    if (tag.type === ReferenceTag && prevTag.type === NullTag) {
      yield buildToken(null, ' ');
    }

    if (tag.type === 'Effect') {
      yield tag;
    } else {
      if (tag.type === CloseNodeTag) {
        if (indentLevel === 0) throw new Error('imbalanced tag stack');
        indentLevel--;
      }
      if (indent) {
        if (!first) {
          yield buildToken(null, '\n');
        }
        yield buildToken(null, indent.repeat(indentLevel));
      }
      yield tag;
      if (tag.type === OpenNodeTag && !tag.value.selfClosing) {
        indentLevel++;
      }

      prevTag = tag;
    }
    first = false;
  }

  yield buildToken(null, '\n');
}

export const writeCSTMLStrategy = (tags, options = {}) =>
  new StreamIterable(__writeCSTMLStrategy(tags, options));

function* __printEnhancer(instrs) {
  let co = new Coroutine(getStreamIterator(instrs));
  let names = emptyStack;
  let currentRef;

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield wait(co.current);
    }

    if (co.done) break;

    let instr = co.value;

    if (instr.type === 'Effect') {
      let { verb, value: effect } = instr.value;

      if (verb === 'write') {
        let { value } = effect.value;
        if (isString(value)) {
          yield instr;
        } else {
          for (let tag of streamFromTree(value)) {
            let currentName = names.value;
            if (tag.type === OpenNodeTag) {
              let tagName = tag.value.name;

              names = names.push(tagName);

              if (tagName === Symbol.for('Alternative')) {
                yield buildAnsiPushEffect('reset');
              } else if (
                tagName === Symbol.for('Character') ||
                (currentName === Symbol.for('Pattern') &&
                  ['openToken', 'closeToken', 'flags'].includes(currentRef?.name)) ||
                (currentName === Symbol.for('Matcher') && tagName === Symbol.for('String')) ||
                (tagName === Symbol.for('String') &&
                  currentName === Symbol.for('TreeNodeMatcherOpen')) ||
                (currentName === Symbol.for('SpamexString') && currentRef.name !== 'content')
              ) {
                yield buildAnsiPushEffect('bold orange');
              } else if (
                tagName === Symbol.for('LiteralTag') ||
                (tagName === Symbol.for('String') && currentRef.name === 'literalValue')
              ) {
                if (
                  tagName === Symbol.for('LiteralTag') ||
                  currentName === Symbol.for('OpenNodeTag')
                ) {
                  yield buildAnsiPushEffect('bold green');
                } else {
                  yield buildAnsiPushEffect();
                }
              } else if (currentName === Symbol.for('TagString') && currentRef.name !== 'content') {
                yield buildAnsiPushEffect('bold green');
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
                (currentRef?.name === 'sigilToken' &&
                  currentName === Symbol.for('ExecInstructionLine')) ||
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

            if (tag.type === CloseNodeTag || (tag.type === OpenNodeTag && tag.value.selfClosing)) {
              names = names.pop();
              yield buildAnsiPopEffect();
            }
          }
        }
      } else {
        yield instr;
      }
    } else {
      yield instr;
    }

    co.advance();
  }
}

export const printEnhancer = (print) => {
  return (instrs) => new StreamIterable(__printEnhancer(print(instrs)));
};

export const generateOutput = (tags, options = {}) => {
  return options.format
    ? writePrettyCSTMLStrategy(tags, options)
    : writeCSTMLStrategy(tags, options);
};
