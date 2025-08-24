/* eslint-disable react/prop-types */
import { useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import { generateLogoWatermark } from "../svgs/LogoName.jsx";

const PdfPoster = ({
  onImageReady,
  posterData,
  generatePoster,
  onTitleSizeAdjust,
  customFont,
}) => {
  const pdfRef = useRef(null);

  useEffect(() => {
    const generatePosterContent = async () => {
      if (!generatePoster) return;

      // Create PDF with A4 dimensions in points (595.28 x 841.89)
      // We'll scale to match canvas dimensions (2480 x 3508)
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: [595.28, 841.89],
      });
      pdf.addFont(
        "../../assets/fonts/Montserrat-Bold.ttf",
        "Montserrat",
        "normal",
      );

      // Scale factor to convert from canvas coordinates to PDF coordinates
      const scaleX = 595.28 / 2480;
      const scaleY = 841.89 / 3508;

      posterData.marginSide = parseInt(posterData.marginSide) || 0;
      posterData.marginTop = parseInt(posterData.marginTop) || 0;
      posterData.marginCover = parseInt(posterData.marginCover) || 0;
      posterData.marginBackground = parseInt(posterData.marginBackground) || 0;

      const loadCoverImage = async (url) => {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = url;
        });
      };

      const imageToDataURL = (img) => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL("image/jpeg", 0.8);
      };

      const drawWaterMark = async () => {
        const svgString = generateLogoWatermark(posterData.textColor, 500, 134);
        const svgBlob = new Blob([svgString], {
          type: "image/svg+xml;charset=utf-8",
        });
        const url = URL.createObjectURL(svgBlob);

        const image = new Image();
        image.src = url;

        return new Promise((resolve) => {
          image.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = 500;
            canvas.height = 134;
            ctx.drawImage(image, 0, 0);
            const dataURL = canvas.toDataURL("image/png");

            // Add watermark to PDF with opacity
            pdf.setGState(pdf.GState({ opacity: 0.5 }));
            pdf.addImage(
              dataURL,
              "PNG",
              (2480 - 70 - 500) * scaleX,
              50 * scaleY,
              500 * scaleX,
              134 * scaleY,
            );
            pdf.setGState(pdf.GState({ opacity: 1 }));

            URL.revokeObjectURL(url);
            resolve();
          };
        });
      };

      const hexToRgb = (hex) => {
        const bigint = parseInt(hex.replace("#", ""), 16);
        return {
          r: (bigint >> 16) & 255,
          g: (bigint >> 8) & 255,
          b: bigint & 255,
        };
      };

      const getContrast = (rgb) => {
        const luminance = (c) => {
          const val = c / 255;
          return val <= 0.03928
            ? val / 12.92
            : Math.pow((val + 0.055) / 1.055, 2.4);
        };
        const lum =
          0.2126 * luminance(rgb.r) +
          0.7152 * luminance(rgb.g) +
          0.0722 * luminance(rgb.b);
        return lum > 0.179 ? "black" : "white";
      };

      const drawBackground = () => {
        const rgb = hexToRgb(posterData.backgroundColor);
        pdf.setFillColor(rgb.r, rgb.g, rgb.b);
        pdf.rect(0, 0, 595.28, 841.89, "F");
      };

      const drawCover = async () => {
        try {
          const coverUrl = posterData.useUncompressed
            ? await posterData.uncompressedAlbumCover
            : posterData.albumCover;

          const coverImage = await loadCoverImage(coverUrl);
          const coverDataURL = imageToDataURL(coverImage);

          const coverSize = (2480 - posterData.marginCover * 2) * scaleX;
          pdf.addImage(
            coverDataURL,
            "JPEG",
            posterData.marginCover * scaleX,
            posterData.marginCover * scaleY,
            coverSize,
            coverSize,
          );

          // Add fade effect if enabled
          if (posterData.useFade) {
            // Create gradient effect using multiple rectangles with varying opacity
            const rgb = hexToRgb(posterData.backgroundColor);
            const fadeHeight = (2500 - posterData.marginBackground) * scaleY;
            const startY = fadeHeight * 0.5;

            for (let i = 0; i < 20; i++) {
              const alpha = (i / 19) * 0.8; // From 0 to 0.8 opacity
              const y = startY + (fadeHeight * 0.3 * i) / 19;
              const height = (fadeHeight * 0.3) / 19;

              pdf.setGState(pdf.GState({ opacity: alpha }));
              pdf.setFillColor(rgb.r, rgb.g, rgb.b);
              pdf.rect(0, y, 595.28, height, "F");
            }
            pdf.setGState(pdf.GState({ opacity: 1 }));
          }
        } catch (error) {
          console.error("Error loading cover image:", error);
        }
      };

      const drawAlbumInfos = () => {
        let titleFontSize = posterData.titleSize
          ? parseInt(posterData.titleSize)
          : 230;
        const fontFamily = customFont || "Helvetica";

        // Calculate title size if not user-adjusted
        if (
          !posterData.userAdjustedTitleSize &&
          !posterData.initialTitleSizeSet
        ) {
          pdf.setFont(fontFamily, "bold");
          pdf.setFontSize(titleFontSize * scaleX);
          let titleWidth = pdf.getTextWidth(posterData.albumName);
          const maxWidth = (2480 - posterData.marginSide * 2) * scaleX;

          while (titleWidth > maxWidth && titleFontSize > 20) {
            titleFontSize -= 1;
            pdf.setFontSize(titleFontSize * scaleX);
            titleWidth = pdf.getTextWidth(posterData.albumName);
          }

          onTitleSizeAdjust(titleFontSize, true);
        }

        // Set text color
        const textRgb = hexToRgb(posterData.textColor);
        pdf.setTextColor(textRgb.r, textRgb.g, textRgb.b);

        // Draw album name
        pdf.setFont(fontFamily, "bold");
        pdf.setFontSize(titleFontSize * scaleX);
        const titleY = posterData.showTracklist
          ? (2500 + posterData.marginTop) * scaleY
          : (2790 + posterData.marginTop) * scaleY;
        pdf.text(posterData.albumName, posterData.marginSide * scaleX, titleY);

        // Draw artist name
        const artistsFontSize = posterData.artistsSize
          ? parseInt(posterData.artistsSize)
          : 110;
        pdf.setFontSize(artistsFontSize * scaleX);
        const artistY = posterData.showTracklist
          ? (2500 + posterData.marginTop + artistsFontSize * 1.3) * scaleY
          : (2820 + posterData.marginTop + artistsFontSize) * scaleY;
        pdf.text(
          posterData.artistsName,
          posterData.marginSide * scaleX,
          artistY,
        );

        // Draw release info
        pdf.setFontSize(70 * scaleX);
        pdf.text(
          posterData.titleRelease,
          posterData.marginSide * scaleX,
          3310 * scaleY,
        );
        const releaseWidth = pdf.getTextWidth(posterData.titleRelease);
        pdf.text(
          posterData.titleRuntime,
          posterData.marginSide * scaleX + releaseWidth + 100 * scaleX,
          3310 * scaleY,
        );

        // Draw runtime and release date with transparency
        pdf.setGState(pdf.GState({ opacity: 0.7 }));
        pdf.setFontSize(60 * scaleX);
        pdf.text(
          posterData.runtime,
          posterData.marginSide * scaleX + releaseWidth + 100 * scaleX,
          3390 * scaleY,
        );
        pdf.text(
          posterData.releaseDate,
          posterData.marginSide * scaleX,
          3390 * scaleY,
        );
        pdf.setGState(pdf.GState({ opacity: 1 }));

        // Draw color bars
        const barY = 3368 * scaleY;
        const barWidth = 145 * scaleX;
        const barHeight = 30 * scaleY;

        const color1Rgb = hexToRgb(posterData.color1);
        pdf.setFillColor(color1Rgb.r, color1Rgb.g, color1Rgb.b);
        pdf.rect(
          (2045 - posterData.marginSide) * scaleX,
          barY,
          barWidth,
          barHeight,
          "F",
        );

        const color2Rgb = hexToRgb(posterData.color2);
        pdf.setFillColor(color2Rgb.r, color2Rgb.g, color2Rgb.b);
        pdf.rect(
          (2190 - posterData.marginSide) * scaleX,
          barY,
          barWidth,
          barHeight,
          "F",
        );

        const color3Rgb = hexToRgb(posterData.color3);
        pdf.setFillColor(color3Rgb.r, color3Rgb.g, color3Rgb.b);
        pdf.rect(
          (2335 - posterData.marginSide) * scaleX,
          barY,
          barWidth,
          barHeight,
          "F",
        );
      };

      const drawTracklist = () => {
        const textRgb = hexToRgb(posterData.textColor);
        pdf.setTextColor(textRgb.r, textRgb.g, textRgb.b);

        let paddingMusic = (posterData.marginSide + 10) * scaleX;
        let maxWidth = 0;
        let paddingColumn = 0;
        const fontSize = posterData.tracksSize
          ? parseInt(posterData.tracksSize)
          : 50;
        pdf.setFont(customFont || "Helvetica", "bold");
        pdf.setFontSize(fontSize * scaleX);
        const musicSize = fontSize * scaleY;

        const marginTop = parseInt(posterData.marginTop || 0);
        const rectY = parseInt(posterData.artistsSize)
          ? (2500 + marginTop + parseInt(posterData.artistsSize) * 1.3 + 130) *
            scaleY
          : (2500 + marginTop + 110 * 1.2 + 130) * scaleY;
        const rectHeight = 500 * scaleY;
        const rectWidth = (2480 - posterData.marginSide * 2) * scaleX;
        const rectX = parseInt(posterData.marginSide) * scaleX;
        const maxTextHeight =
          rectY +
          rectHeight -
          10 * scaleY -
          parseInt(posterData.marginTop) * scaleY;

        let textHeight = rectY;

        posterData.tracklist.split("\n").forEach((track) => {
          if (textHeight + musicSize * 1.3 >= maxTextHeight) {
            textHeight = rectY;
            paddingMusic = maxWidth + musicSize * 2.5 + paddingColumn;
            if (paddingMusic >= rectX + rectWidth) return;
            paddingColumn = paddingMusic - musicSize * 2.5;
            maxWidth = 0;
          }
          const textWidth =
            pdf.getTextWidth(`${track}`) + posterData.marginSide * scaleX;
          if (textWidth > maxWidth) {
            maxWidth = textWidth;
          }
          pdf.text(`${track}`, paddingMusic, textHeight);
          textHeight += musicSize * 1.3;
        });
      };

      const drawScannable = async () => {
        try {
          const rgb = hexToRgb(posterData.backgroundColor);
          const contrastColor = getContrast(rgb);
          const targetColor = posterData.textColor;

          const svgUrl = `https://scannables.scdn.co/uri/plain/svg/${posterData.backgroundColor.replace("#", "")}/${contrastColor}/640/spotify:album:${posterData.albumID}`;

          const response = await fetch(svgUrl);
          let svgText = await response.text();

          if (contrastColor === "black") {
            svgText = svgText.replace(
              /fill="#000000"/g,
              `fill="${targetColor}"`,
            );
          } else {
            svgText = svgText.replace(
              /fill="#ffffff"/g,
              `fill="${targetColor}"`,
            );
          }

          svgText = svgText.replace(posterData.backgroundColor, "transparent");

          const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
          const updatedSvgUrl = URL.createObjectURL(svgBlob);

          const image = new Image();
          image.src = updatedSvgUrl;

          return new Promise((resolve) => {
            image.onload = function () {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              canvas.width = 480;
              canvas.height = 120;
              ctx.drawImage(image, 0, 0);
              const dataURL = canvas.toDataURL("image/png");

              pdf.addImage(
                dataURL,
                "PNG",
                (2020 - posterData.marginSide) * scaleX,
                3235 * scaleY,
                480 * scaleX,
                120 * scaleY,
              );

              URL.revokeObjectURL(updatedSvgUrl);
              resolve();
            };
          });
        } catch (error) {
          console.error("Error loading scannable:", error);
        }
      };

      // Generate PDF content
      drawBackground();
      await drawCover();
      drawAlbumInfos();

      if (posterData.showTracklist) {
        drawTracklist();
      }

      if (posterData.useWatermark) {
        await drawWaterMark();
      }

      await drawScannable();

      // Convert PDF to data URL and call onImageReady
      const pdfDataUrl = pdf.output("dataurlstring");
      onImageReady(pdfDataUrl);
    };

    generatePosterContent();
  }, [generatePoster, posterData, onImageReady, onTitleSizeAdjust, customFont]);

  return null; // No visual component needed
};

export default PdfPoster;
