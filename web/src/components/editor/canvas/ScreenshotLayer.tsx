/**
 * ScreenshotLayer — renders the page screenshot as a background image.
 */
import React from 'react';

interface Props {
  url: string;
  width: number | string;
  height: number | string;
}

export const ScreenshotLayer = React.memo(function ScreenshotLayer({ url, width, height }: Props) {
  return (
    <img
      src={url}
      alt="Page Screenshot"
      className="canvas-screenshot"
      style={{ width, height }}
      draggable={false}
    />
  );
});
