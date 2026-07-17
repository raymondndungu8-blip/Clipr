'use strict';

/**
 * Minimal promise semaphore: `const limit = createLimit(2)` then
 * `limit(() => doWork())` — at most N tasks run at once, the rest queue FIFO.
 */
function createLimit(max) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= max || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

module.exports = { createLimit };
