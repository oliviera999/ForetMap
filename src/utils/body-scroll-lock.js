let bodyScrollLockCount = 0;
let previousBodyOverflow = '';

function lockBodyScroll() {
  if (typeof document === 'undefined' || !document.body) {
    return () => {};
  }

  const body = document.body;
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
    if (bodyScrollLockCount === 0) {
      body.style.overflow = previousBodyOverflow || '';
      previousBodyOverflow = '';
    }
  };
}

export { lockBodyScroll };
