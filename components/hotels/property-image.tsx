"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import {
  canOptimizePropertyImage,
  FALLBACK_PROPERTY_IMAGE,
  getSafePropertyImageUrl
} from "@/lib/property-images";

type PropertyImageProps = Omit<ImageProps, "src" | "unoptimized" | "onError"> & {
  src: string;
};

export function PropertyImage({ src, alt, ...props }: PropertyImageProps) {
  const safeSrc = getSafePropertyImageUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const currentSrc = failedSrc === safeSrc ? FALLBACK_PROPERTY_IMAGE : safeSrc;

  return (
    <Image
      {...props}
      src={currentSrc}
      alt={alt}
      unoptimized={!canOptimizePropertyImage(currentSrc)}
      onError={() => {
        if (currentSrc !== FALLBACK_PROPERTY_IMAGE) setFailedSrc(safeSrc);
      }}
    />
  );
}
