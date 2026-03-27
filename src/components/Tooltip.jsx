import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

const OPEN_DELAY_MS = 300;
const LONG_PRESS_MS = 400;
const TOUCH_VISIBLE_MS = 3000;

function Tooltip({ children, text, position = 'top' }) {
  const [open, setOpen] = useState(false);
  const [resolvedPosition, setResolvedPosition] = useState(position);
  const wrapperRef = useRef(null);
  const bubbleRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const touchHideTimerRef = useRef(null);
  const tooltipId = useId();

  const content = useMemo(() => String(text || '').trim(), [text]);

  useEffect(() => {
    return () => {
      window.clearTimeout(hoverTimerRef.current);
      window.clearTimeout(longPressTimerRef.current);
      window.clearTimeout(touchHideTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open || !wrapperRef.current || !bubbleRef.current) return;
    const hostRect = wrapperRef.current.getBoundingClientRect();
    const bubbleRect = bubbleRef.current.getBoundingClientRect();
    const margin = 12;
    let next = position;
    if (position === 'top' && hostRect.top - bubbleRect.height - margin < 0) next = 'bottom';
    if (position === 'bottom' && hostRect.bottom + bubbleRect.height + margin > window.innerHeight) next = 'top';
    if (position === 'left' && hostRect.left - bubbleRect.width - margin < 0) next = 'right';
    if (position === 'right' && hostRect.right + bubbleRect.width + margin > window.innerWidth) next = 'left';
    setResolvedPosition(next);
  }, [open, position]);

  if (!React.isValidElement(children)) return children;
  if (!content) return children;

  const closeTooltip = () => {
    window.clearTimeout(hoverTimerRef.current);
    window.clearTimeout(longPressTimerRef.current);
    window.clearTimeout(touchHideTimerRef.current);
    setOpen(false);
  };

  const scheduleOpen = () => {
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };

  const childProps = {
    onMouseEnter: (event) => {
      children.props.onMouseEnter?.(event);
      scheduleOpen();
    },
    onMouseLeave: (event) => {
      children.props.onMouseLeave?.(event);
      closeTooltip();
    },
    onFocus: (event) => {
      children.props.onFocus?.(event);
      setOpen(true);
    },
    onBlur: (event) => {
      children.props.onBlur?.(event);
      closeTooltip();
    },
    onTouchStart: (event) => {
      children.props.onTouchStart?.(event);
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = window.setTimeout(() => {
        setOpen(true);
        window.clearTimeout(touchHideTimerRef.current);
        touchHideTimerRef.current = window.setTimeout(() => setOpen(false), TOUCH_VISIBLE_MS);
      }, LONG_PRESS_MS);
    },
    onTouchEnd: (event) => {
      children.props.onTouchEnd?.(event);
      window.clearTimeout(longPressTimerRef.current);
    },
    onTouchCancel: (event) => {
      children.props.onTouchCancel?.(event);
      window.clearTimeout(longPressTimerRef.current);
    },
    'aria-describedby': open ? tooltipId : children.props['aria-describedby'],
  };

  return (
    <span className="fm-tooltip-wrap" ref={wrapperRef}>
      {React.cloneElement(children, childProps)}
      {open && (
        <span
          id={tooltipId}
          className={`fm-tooltip fm-tooltip--${resolvedPosition}`}
          role="tooltip"
          ref={bubbleRef}
        >
          {content}
          <span className="fm-tooltip__arrow" aria-hidden />
        </span>
      )}
    </span>
  );
}

export { Tooltip };
