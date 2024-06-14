import { Coroutine } from '@bablr/coroutine';
import { getStreamIterator } from '@bablr/agast-helpers/stream';

export const writeLinesToWritableStream = async (from, to) => {
  const co = new Coroutine(getStreamIterator(from));

  let buf = '';

  for (;;) {
    co.advance();

    if (co.current instanceof Promise) {
      co.current = await co.current;
    }

    if (co.done) break;

    const chr = co.value;

    buf += chr;

    if (chr === '\n') {
      if (!to.write(buf)) {
        await to.once('drain');
      }
      buf = '';
    }
  }

  to.write(buf);
};
