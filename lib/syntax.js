/* global process Promise */

import emptyStack from '@iter-tools/imm-stack';
import { StreamIterable, getStreamIterator, wait, continue_ } from '@bablr/agast-helpers/stream';
import { OpenNodeTag, CloseNodeTag, ReferenceTag } from '@bablr/agast-helpers/symbols';
import { freezeRecord, isFrozen } from '@bablr/agast-helpers/object';
import { parseTag } from '@bablr/agast-helpers/builders';
import { ansiRules, buildOpenNodeTag, printOpenNodeTag } from '@bablr/io-vm-node';
import { writeCSTML, writePrettyCSTML } from '@bablr/helpers/builders';

export const enhanceTagWithStyles = (tag, styles) => {
  if (tag.type !== OpenNodeTag) throw new Error();

  let { flags, type, name, literalValue, attributes, selfClosing } = tag.value;

  let ansiStyle = `\x1B[${styles
    .split(' ')
    .map((name) => ansiRules[name])
    .join(';')}m`;

  return printOpenNodeTag(
    buildOpenNodeTag(flags, type, name, literalValue, attributes, selfClosing, ansiStyle),
  );
};

function* __style(instrs) {
  let iter = getStreamIterator(instrs);
  let step;
  let names = emptyStack;
  let currentRef;

  for (;;) {
    step = iter.next();
    while (step === null || step instanceof Promise) {
      if (step === null) yield continue_(), (step = iter.next());
      if (step instanceof Promise) step = yield wait(step);
    }
    if (step.done) break;

    let tag = parseTag(step.value);

    let currentName = names.value;
    if (tag.type === OpenNodeTag) {
      let tagName = tag.value.name;

      names = names.push(tagName);

      if (
        tagName === Symbol.for('Alternative') ||
        (currentName === Symbol.for('Call') && currentRef.name === 'arguments') ||
        (tagName === null && tag.value.flags.token && [',', ', '].includes(tag.value.literalValue))
      ) {
        yield enhanceTagWithStyles(tag, 'reset');
      } else if (
        tagName === Symbol.for('Character') ||
        (currentName === Symbol.for('Pattern') &&
          ['openToken', 'closeToken', 'flags'].includes(currentRef?.name)) ||
        (currentName === Symbol.for('SpamexString') && tagName === Symbol.for('String')) ||
        (tagName === Symbol.for('String') && currentName === Symbol.for('TreeNodeMatcherOpen')) ||
        (currentName === Symbol.for('SpamexString') && currentRef.name !== 'content')
      ) {
        yield enhanceTagWithStyles(tag, 'bold orange');
      } else if (
        tagName === Symbol.for('LiteralTag') ||
        (tagName === Symbol.for('String') && currentRef.name === 'literalValue')
      ) {
        if (tagName === Symbol.for('LiteralTag') || currentName === Symbol.for('OpenNodeTag')) {
          yield enhanceTagWithStyles(tag, 'bold green');
        } else {
          yield step.value;
        }
      } else if (currentName === Symbol.for('TagString') && currentRef.name !== 'content') {
        yield enhanceTagWithStyles(tag, 'bold green');
      } else if (tagName === Symbol.for('EscapeSequence')) {
        yield enhanceTagWithStyles(tag, 'bold cyan');
      } else if (tagName === Symbol.for('Identifier')) {
        if (
          currentName === Symbol.for('ReferenceTag') ||
          currentName === Symbol.for('ReferenceMatcher')
        ) {
          yield enhanceTagWithStyles(tag, 'bold gray');
        } else {
          yield step.value;
        }
      } else if (
        tagName === Symbol.for('EnterProductionLine') ||
        tagName === Symbol.for('LeaveProductionLine')
      ) {
        yield enhanceTagWithStyles(tag, 'blue bold');
      } else if (tagName === Symbol.for('ExecInstructionLine')) {
        yield enhanceTagWithStyles(tag, 'magenta bold');
      } else if (tagName === Symbol.for('BindingTag') || tagName === Symbol.for('BindingMatcher')) {
        yield enhanceTagWithStyles(tag, 'bold gray');
      } else if (tagName === null && tag.value.flags.token) {
        if (
          currentName === Symbol.for('ReferenceTag') ||
          currentName === Symbol.for('ReferenceMatcher') ||
          currentName === Symbol.for('ReferenceFlags')
        ) {
          yield enhanceTagWithStyles(tag, 'bold gray');
        } else {
          yield step.value;
        }
      } else {
        yield step.value;
      }
    } else {
      yield step.value;
    }

    if (tag.type === ReferenceTag) {
      currentRef = tag.value;
    }

    if (tag.type === CloseNodeTag || (tag.type === OpenNodeTag && tag.value.selfClosing)) {
      names = names.pop();
    }
  }
}

export const style = (instrs) => new StreamIterable(__style(instrs));

export function writeOutput(tags, options = freezeRecord({})) {
  if (!isFrozen(options)) throw new Error();
  return options.compact ? writeCSTML(tags, options) : writePrettyCSTML(tags, options);
}
