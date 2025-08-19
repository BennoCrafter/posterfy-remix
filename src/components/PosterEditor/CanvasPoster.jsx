/* eslint-disable react/prop-types */
import { useEffect } from 'react';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { generateLogoWatermark } from '../svgs/LogoName.jsx';

const CanvasPoster = ({ onImageReady, posterData, generatePoster, onTitleSizeAdjust, customFont }) => {
  useEffect(() => {
    const pxToPt = (px) => (px * 72) / 300; // 300dpi
    const hexToRgb = (hex) => {
      const bigint = parseInt(hex.replace('#', ''), 16);
      return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
    };
    const hexToPdfRgb = (hex) => {
      const c = hexToRgb(hex);
      return rgb(c.r / 255, c.g / 255, c.b / 255);
    };

    const rasterizeSvgToPngArrayBuffer = async (svgString, widthPx, heightPx, scale = 3) => {
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await new Promise((res) => (img.onload = res));
      const canvas = document.createElement('canvas');
      canvas.width = widthPx * scale;
      canvas.height = heightPx * scale;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      return await new Promise((resolve) => canvas.toBlob((b) => b.arrayBuffer().then(resolve), 'image/png', 1));
    };

    const fetchArrayBuffer = async (url) => {
      const res = await fetch(url);
      return await res.arrayBuffer();
    };

    const generatePdf = async () => {
      if (!generatePoster) return;

      const widthPx = 2480;
      const heightPx = 3508;
      posterData.marginSide = parseInt(posterData.marginSide) || 0;
      posterData.marginTop = parseInt(posterData.marginTop) || 0;
      posterData.marginCover = parseInt(posterData.marginCover) || 0;
      posterData.marginBackground = parseInt(posterData.marginBackground) || 0;

      const pdfDoc = await PDFDocument.create();

      let embeddedFont = null;
      try {
        if (customFont && (typeof customFont === 'string') && (customFont.startsWith('http') || /\.(ttf|otf|woff2?|woff)$/i.test(customFont))) {
          const fontBytes = await fetchArrayBuffer(customFont);
          embeddedFont = await pdfDoc.embedFont(fontBytes);
        } else {
          embeddedFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        }
      } catch (e) {
        embeddedFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      }

      const page = pdfDoc.addPage([pxToPt(widthPx), pxToPt(heightPx)]);
      const px = (v) => pxToPt(v);

      // Fill background
      page.drawRectangle({
        x: 0,
        y: 0,
        width: px(widthPx),
        height: px(heightPx),
        color: hexToPdfRgb(posterData.backgroundColor),
      });

      // Draw cover image
      const loadAndEmbedImage = async (url) => {
        const ab = await fetchArrayBuffer(url);
        try {
          return await pdfDoc.embedPng(ab);
        } catch (e) {
          return await pdfDoc.embedJpg(ab);
        }
      };

      const coverUrl = posterData.useUncompressed ? posterData.uncompressedAlbumCover : posterData.albumCover;
      if (coverUrl) {
        const coverImage = await loadAndEmbedImage(coverUrl);
        const coverW = widthPx - posterData.marginCover * 2;
        const coverH = coverW;
        const coverX = posterData.marginCover;
        const coverY = posterData.marginCover;
        // PDF origin is bottom-left, so Y = heightPx - coverY - coverH
        page.drawImage(coverImage, {
          x: px(coverX),
          y: px(heightPx - coverY - coverH),
          width: px(coverW),
          height: px(coverH),
        });

        // Fade
        if (posterData.useFade) {
          const rgbObj = hexToRgb(posterData.backgroundColor);
          const gradientSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${coverW}" height="${3000 - posterData.marginBackground}">
              <defs>
                <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0.5" stop-color="rgba(${rgbObj.r},${rgbObj.g},${rgbObj.b},0)"/>
                  <stop offset="0.8" stop-color="${posterData.backgroundColor}"/>
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#g)"/>
            </svg>
          `;
          const gradBuf = await rasterizeSvgToPngArrayBuffer(gradientSvg, coverW, 3000 - posterData.marginBackground, 2);
          const gradImage = await pdfDoc.embedPng(gradBuf);
          page.drawImage(gradImage, {
            x: px(0),
            y: px(heightPx - (3000 - posterData.marginBackground)),
            width: px(widthPx),
            height: px(2500 - posterData.marginBackground),
            opacity: 1,
          });
        }
      }

      // Draw background rectangle (lower part)
      page.drawRectangle({
        x: 0,
        y: 0,
        width: px(widthPx),
        height: px(heightPx - 2480 + posterData.marginBackground),
        color: hexToPdfRgb(posterData.backgroundColor),
      });

      // Album info (title auto-fit)
      let titleFontSizePx = posterData.titleSize ? parseInt(posterData.titleSize) : 230;
      const fontFamily = embeddedFont;
      if (!posterData.userAdjustedTitleSize && !posterData.initialTitleSizeSet) {
        let titleFontSizePt = pxToPt(titleFontSizePx);
        let measuredWidthPt = fontFamily.widthOfTextAtSize(posterData.albumName || '', titleFontSizePt);
        const maxWidthPt = pxToPt(2480 - posterData.marginSide * 2);
        while (measuredWidthPt > maxWidthPt && titleFontSizePx > 10) {
          titleFontSizePx -= 1;
          titleFontSizePt = pxToPt(titleFontSizePx);
          measuredWidthPt = fontFamily.widthOfTextAtSize(posterData.albumName || '', titleFontSizePt);
        }
        onTitleSizeAdjust && onTitleSizeAdjust(titleFontSizePx, true);
      }
      const titleFontSizePt = pxToPt(titleFontSizePx);
      const textColor = hexToPdfRgb(posterData.textColor);

      // Draw album name
      const drawText = (text, xPx, yPx, sizePx, options = {}) => {
        const sizePt = pxToPt(sizePx);
        page.drawText(text || '', {
          x: px(xPx),
          y: px(heightPx - yPx - sizePx),
          size: sizePt,
          font: fontFamily,
          color: options.color || textColor,
          opacity: options.opacity,
        });
      };

      if (posterData.showTracklist) {
        drawText(posterData.albumName, posterData.marginSide, 2500 + posterData.marginTop, titleFontSizePx);
      } else {
        drawText(posterData.albumName, posterData.marginSide, 2790 + posterData.marginTop, titleFontSizePx);
      }

      // Draw artists
      let artistsFontSizePx = posterData.artistsSize ? parseInt(posterData.artistsSize) : 110;
      if (posterData.showTracklist) {
        drawText(posterData.artistsName, posterData.marginSide, (2500 + posterData.marginTop) + artistsFontSizePx * 1.3, artistsFontSizePx);
      } else {
        drawText(posterData.artistsName, posterData.marginSide, (2820 + posterData.marginTop) + artistsFontSizePx, artistsFontSizePx);
      }

      // Draw release info
      const releaseSizePx = 70;
      drawText(posterData.titleRelease, posterData.marginSide, 3310, releaseSizePx);
      const titleReleaseWidthPt = fontFamily.widthOfTextAtSize(posterData.titleRelease || '', pxToPt(releaseSizePx));
      const titleReleaseWidthPx = (titleReleaseWidthPt * 300) / 72;
      drawText(posterData.titleRuntime, posterData.marginSide + titleReleaseWidthPx + 100, 3310, releaseSizePx);

      // Draw runtime and release date (smaller, faded)
      const smallSizePx = 60;
      drawText(posterData.runtime, posterData.marginSide + titleReleaseWidthPx + 100, 3390, smallSizePx, { opacity: 0.7 });
      drawText(posterData.releaseDate, posterData.marginSide, 3390, smallSizePx, { opacity: 0.7 });

      // Draw colored bars
      page.drawRectangle({ x: px(2045 - posterData.marginSide), y: px(heightPx - 3368 - 30), width: px(145), height: px(30), color: hexToPdfRgb(posterData.color1) });
      page.drawRectangle({ x: px(2190 - posterData.marginSide), y: px(heightPx - 3368 - 30), width: px(145), height: px(30), color: hexToPdfRgb(posterData.color2) });
      page.drawRectangle({ x: px(2335 - posterData.marginSide), y: px(heightPx - 3368 - 30), width: px(145), height: px(30), color: hexToPdfRgb(posterData.color3) });

      // Draw tracklist
      if (posterData.showTracklist) {
        const fontSizePx = posterData.tracksSize ? parseInt(posterData.tracksSize) : 50;
        let paddingMusic = posterData.marginSide + 10;
        let maxWidth = 0;
        let paddingColumn = 0;

        const marginTop = parseInt(posterData.marginTop || 0);
        const rectY = parseInt(posterData.artistsSize)
          ? (2500 + marginTop) + parseInt(posterData.artistsSize) * 1.3 + 130
          : (2500 + marginTop) + (110 * 1.2) + 130;
        const rectHeight = 500;
        const rectWidthPx = widthPx - (posterData.marginSide * 2);
        const rectX = parseInt(posterData.marginSide);
        const maxTextHeight = rectY + rectHeight - 10 - parseInt(posterData.marginTop);

        let textHeight = rectY;

        (posterData.tracklist || '').split('\n').forEach((track) => {
          if (textHeight + fontSizePx * 1.3 >= maxTextHeight) {
            textHeight = rectY;
            paddingMusic = maxWidth + (fontSizePx * 2.5) + paddingColumn;
            if (paddingMusic >= rectX + rectWidthPx) return;
            paddingColumn = paddingMusic - (fontSizePx * 2.5);
            maxWidth = 0;
          }
          const measuredWidthPt = fontFamily.widthOfTextAtSize(track, pxToPt(fontSizePx));
          const measuredWidthPx = (measuredWidthPt * 300) / 72;
          const textWidthPx = measuredWidthPx + posterData.marginSide;
          if (textWidthPx > maxWidth) {
            maxWidth = textWidthPx;
          }
          drawText(track, paddingMusic, textHeight, fontSizePx);
          textHeight += (fontSizePx * 1.3);
        });
      }

      // Watermark
      if (posterData.useWatermark) {
        const svgString = generateLogoWatermark(posterData.textColor, 500, 134);
        const wmBuf = await rasterizeSvgToPngArrayBuffer(svgString, 500, 134, 3);
        const wmImage = await pdfDoc.embedPng(wmBuf);
        page.drawImage(wmImage, {
          x: px(widthPx - 70 - 500),
          y: px(heightPx - 50 - 134),
          width: px(500),
          height: px(134),
          opacity: 0.5,
        });
      }

      // Scannable
      try {
        const rgbForScannable = hexToRgb(posterData.backgroundColor);
        const luminance = (c) => {
          const val = c / 255;
          return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
        };
        const lum = 0.2126 * luminance(rgbForScannable.r) + 0.7152 * luminance(rgbForScannable.g) + 0.0722 * luminance(rgbForScannable.b);
        const contrastColor = lum > 0.179 ? 'black' : 'white';
        const targetColor = posterData.textColor.replace('#', '');
        const svgUrl = `https://scannables.scdn.co/uri/plain/svg/${posterData.backgroundColor.replace('#', '')}/${contrastColor}/640/spotify:album:${posterData.albumID}`;
        const scannableResp = await fetch(svgUrl);
        let svgText = await scannableResp.text();

        if (contrastColor === 'black') {
          svgText = svgText.replace(/fill="#000000"/g, `fill="${posterData.textColor}"`);
        } else {
          svgText = svgText.replace(/fill="#ffffff"/g, `fill="${posterData.textColor}"`);
        }
        svgText = svgText.replace(posterData.backgroundColor, 'transparent');

        const scannableBuf = await rasterizeSvgToPngArrayBuffer(svgText, 640, 640, 3);
        const scImg = await pdfDoc.embedPng(scannableBuf);
        page.drawImage(scImg, {
          x: px(2020 - posterData.marginSide),
          y: px(heightPx - 3235 - 120),
          width: px(480),
          height: px(120),
        });
      } catch (e) {
        // ignore scannable errors
      }

      // finalize pdf
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(blob);
      onImageReady && onImageReady(pdfUrl);
    };

    generatePdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatePoster, posterData, onImageReady]);

  return null;
};

export default CanvasPoster;
