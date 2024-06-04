/* global process Promise */

import { i } from '@bablr/boot';
import * as cstml from '@bablr/language-cstml';
import { streamParse } from 'bablr/enhanceable';
import { Coroutine } from '@bablr/coroutine';
import {
  StreamIterable,
  getStreamIterator,
  generatePrettyCSTML as generatePrettyCSTMLStream,
} from '@bablr/agast-helpers/stream';
import { evaluate } from '@bablr/ansi-vm';
import { buildString } from '@bablr/agast-vm-helpers';

function* __higlightStrategy(tokens) {
  const co = new Coroutine(
    getStreamIterator(streamParse(cstml, 'Document', generatePrettyCSTMLStream(tokens))),
  );

  let currentType;
  let currentRef;

  co.advance();

  for (;;) {
    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.done) break;

    const token = co.value;

    if (token.type === 'OpenNodeTag') {
      if (
        currentType === 'Literal' ||
        (token.value.type === 'String' && currentRef.name === 'intrinsicValue')
      ) {
        yield i`push(bold green)`;
      } else if (token.value.type === 'String') {
        yield i`push(bold white)`;
      } else if (token.value.type === 'Identifier') {
        if (currentType === 'Punctuator' && currentRef.name === 'type') {
          yield i`push(whiteBright bold)`;
        } else if (currentType === 'Reference') {
          yield i`push(gray)`;
        } else {
          yield i`push()`;
        }
      } else {
        yield i`push()`;
      }
      currentType = token.value.type;
    }

    if (token.type === 'Reference') {
      currentRef = token.value;
    }

    if (token.type === 'CloseNodeTag') {
      yield i`pop()`;
    }

    if (token.type === 'Literal') {
      yield i`write(${buildString(token.value)})`;
    } else if (token.type === 'OpenNodeTag' && token.value.flags.intrinsic) {
      yield i`write(${buildString(token.value.intrinsicValue)})`;
      yield i`pop()`;
    }

    co.advance();
  }
}

export const higlightStrategy = (tokens) => {
  return () => new StreamIterable(__higlightStrategy(tokens));
};

export const generateColorfulCSTML = (tokens) => evaluate(higlightStrategy(tokens));

export const generateCSTML = (tokens) => generatePrettyCSTMLStream(tokens);
