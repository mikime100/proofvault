// AG Studio's look, set from the same tokens as the rest of the dashboard (index.css).
// Studio renders its own UI, so Tailwind classes cannot reach it; its theme params can.
import { studioTheme } from 'ag-studio';

const ink = '#0f172a';
const muted = '#64748b';
const border = '#e5e7eb';
const divider = '#f1f5f9';
const canvas = '#f8fafc';
const brand = '#0070e0';
const navy = '#001c64';
const font = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Chart series colours: brand blue and navy first, then calm hues that still tell series apart.
const palette = [brand, navy, '#0ea5e9', '#64748b', '#b45309', '#047857'];
const paletteParams = Object.fromEntries(
  palette.flatMap((c, i) => [
    [`chartPaletteFills${i + 1}Color`, c],
    [`chartPaletteStrokes${i + 1}Color`, c],
  ]),
);

export const proofvaultStudioTheme = studioTheme.withParams({
  // Shared
  accentColor: brand,
  backgroundColor: '#ffffff',
  foregroundColor: ink,
  textColor: ink,
  subtleTextColor: muted,
  iconColor: muted,
  borderColor: border,
  borderRadius: 8,
  fontFamily: font,
  fontSize: 14,
  rowHoverColor: divider,
  menuBorder: { color: border },
  menuShadow: '0 8px 24px rgb(15 23 42 / 0.08)',
  popupShadow: '0 8px 24px rgb(15 23 42 / 0.08)',
  focusShadow: `0 0 0 3px rgb(0 112 224 / 0.2)`,
  toggleButtonOnBackgroundColor: brand,
  tooltipBackgroundColor: ink,
  tooltipTextColor: '#ffffff',

  // Frame: panels float as white cards on the light canvas, like the dashboard's cards.
  studioWrapperBackgroundColor: canvas,
  studioWrapperBorder: false,
  studioWrapperSpacing: 12,
  studioPanelContainerBackgroundColor: '#ffffff',
  studioPanelContainerBorder: { color: border },
  studioPanelContainerBorderRadius: 12,
  studioPanelDividerColor: 'transparent',
  studioPanelDividerActiveColor: brand,
  studioPanelHeaderFontSize: 14,
  studioPanelHeaderFontWeight: 600,
  studioPanelSectionBorderColor: divider,
  studioPanelItemBorderRadius: 8,
  studioPanelWidth: 240,
  studioAiPanelWidth: 320,
  studioFormLabelColor: muted,
  studioToggleButtonActiveBackgroundColor: brand,
  studioToggleButtonActiveBorderColor: brand,
  studioToggleButtonActiveColor: brand,
  studioPopupBorderRadius: 12,

  // Canvas and widgets
  studioCanvasBackgroundColor: canvas,
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 12,
  studioCanvasGridLineColor: '#e8edf3',
  studioCanvasFontFamily: font,
  studioWidgetBackgroundColor: '#ffffff',
  studioWidgetBorder: { color: border },
  studioWidgetBorderRadius: 12,
  studioWidgetShadow: 'none',
  studioWidgetPadding: 12,
  studioWidgetSelectedBorderColor: brand,
  studioWidgetResizeBorderColor: brand,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: ink,
  studioWidgetSubtitleTextColor: muted,
  studioWidgetCaptionTextColor: muted,

  // Tables inside widgets
  gridHeaderBackgroundColor: canvas,
  gridHeaderTextColor: muted,
  gridHeaderFontWeight: 500,
  gridRowBorder: { color: divider },
  gridColumnBorder: false,
  gridRowHoverColor: canvas,
  gridWrapperBorderRadius: 8,

  // Charts inside widgets
  chartFontFamily: font,
  chartTextColor: ink,
  chartSubtleTextColor: muted,
  chartAxisLabelColor: muted,
  chartGridLineColor: divider,
  chartAxisLineColor: border,
  chartLegendLabelColor: muted,
  chartTooltipBackgroundColor: '#ffffff',
  chartTooltipTextColor: ink,
  chartTooltipBorder: { color: border },
  ...paletteParams,
});
