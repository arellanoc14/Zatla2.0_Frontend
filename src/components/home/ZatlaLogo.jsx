import React from "react";

// ZATLA wordmark: the T is a sprout. This is the brand's own artwork — the logo
// plate texture from the ZATLA light model (public/brand/zatla-logo.png, with a
// transparent background), so the mark on the site is the mark on the fixture.
//
// `className` sets the font-size, and the image is 1em tall, so every place that
// sized the old vector mark by font-size (loaders, headers) keeps working. Pass
// `height` to size it directly instead.
export const ZATLA_LOGO_SRC = "/brand/zatla-logo.png";
export const ZATLA_LOGO_RATIO = 2184 / 569; // width ÷ height of the artwork

export default function ZatlaLogo({ className = "", title = "ZATLA", height = null, style = {} }) {
  const h = height ?? "1em";
  return (
    <img
      src={ZATLA_LOGO_SRC}
      alt={title}
      draggable={false}
      className={`inline-block select-none ${className}`}
      style={{ height: h, width: "auto", ...style }}
      width={2184}
      height={569}
    />
  );
}
