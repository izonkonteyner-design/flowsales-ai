"use client";

import { useState } from "react";

type QuoteDocumentImageProps = {
  src: string;
  alt: string;
  className?: string;
};

export function QuoteDocumentImage({ src, alt, className }: QuoteDocumentImageProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return null;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className ?? "h-16 w-16 rounded-2xl object-cover ring-1 ring-slate-200"} onError={() => setVisible(false)} />;
}
