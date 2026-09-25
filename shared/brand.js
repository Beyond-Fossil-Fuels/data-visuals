/* ================================================================
 * BFF BRAND SETTINGS: shared by every graphic in this repository.
 * Change a value here and every graphic follows once it's published.
 * A graphic can still override any of these in its own SETTINGS block.
 * Easier: open any graphic with ?design, adjust the Brand sections,
 * then use "Download brand.js" and replace this file with it.
 * ================================================================ */
var BRAND = {
  // ---- Fonts ----
  font: "Inter",                               // Main font (a Google Fonts name, or an Adobe Fonts name when adobeKitId is set)
  titleFont: "",                               // Font for main titles only (empty = same as main font)
  adobeKitId: "",                              // Adobe Fonts web project ID, e.g. abc1def (empty = not used)
  titleSize: 46,                               // Main title size in px (shrinks on small screens)
  titleWeight: 800,                            // Main title boldness
  headingSize: 21,                             // Chart heading size in px
  headingWeight: 700,                          // Chart heading boldness
  legendSize: 14.5,                            // Legend text size in px
  axisSize: 15,                                // Axis label size in px
  tooltipSize: 13,                             // Tooltip text size in px
  footerSize: 24,                              // Footer text size in px

  // ---- Colours ----
  background: "#ffffff",                       // Page background
  textColor: "#000000",                        // Title and footer text
  headingColor: "#000000",                     // Chart headings and legend text
  axisColor: "#000000",                        // Axis numbers and labels
  gridColor: "#eceef0",                        // Horizontal grid lines

  // ---- Layout ----
  titleAlign: "center",                        // Main title alignment
  legendAlign: "right",                        // Legend alignment when charts sit side by side
  maxWidth: 1100,                              // Widest a graphic gets, in px
  stackBelow: 640,                             // Below this width (px) charts stack vertically

  // ---- Chart style ----
  areaOpacity: 0.85,                           // How solid coloured areas are (0 = invisible, 1 = solid)
  lineWidth: 2,                                // Line along the top of each area, in px (0 = none)
  showDots: true,                              // Show a dot at every data point
  dotSize: 4.5,                                // Dot radius in px
  showGrid: true,                              // Show horizontal grid lines

  // ---- Arrow style ----
  arrowColor: "#000000",                       // Arrow colour
  arrowThickness: 8,                           // Line thickness in px
  arrowHeadSize: 18,                           // Arrowhead size in px
  arrowHeadStyle: "open",                      // Arrowhead: open chevron or filled triangle
  arrowLineStyle: "solid",                     // Line style

  // ---- Palette: colours graphics refer to by name, e.g. S.gasOperating ----
  palette: {
    "Brand colours": {
      yellow: "#fef751",
      coral: "#ff8171",
      skyBlue: "#8edfff",
      lavender: "#a29dff",
      mint: "#66e9b6",
      orange: "#ff7307",
      darkBlue: "#559bfa",
      pink: "#ff8cc7",
      green: "#43c680",
    },
    "Neutrals": {
      warmWhite: "#fffaf2",
      warmGrey: "#f7f3ed",
      grey: "#eceef0",
      lightGrey: "#f8f8f8",
      white: "#ffffff",
      black: "#000000",
    },
    "Gas plant status": {
      gasAnnounced: "#FFA3A3",
      gasPreConstruction: "#F46245",
      gasConstruction: "#F92B21",
      gasShelved: "#AFA36A",
      gasOperating: "#A954D1",
      gasMothballed: "#CFA7E5",
      gasRetired: "#86E649",
      gasCancelled: "#46BE50",
      gasInstalled: "#A954D1",
      gasInDevelopment: "#F46245",
    },
    "Coal plant status": {
      coalPlanned: "#FFA3A3",
      coalConstruction: "#F92B21",
      coalCancelled: "#46BE50",
      coalRetired: "#86E649",
      coalRetires2030Latest: "#CFA7E5",
      coalRetiresAfter2030: "#A954D1",
      coalNoRetirementDate: "#660A70",
    },
    "Coal phase-out map": {
      phaseoutNoDiscussion: "#d80505",
      phaseoutAfter2030: "#ffaa00",
      phaseoutUnderDiscussion: "#f96500",
      phaseout2030OrEarlier: "#bfe649",
      phaseoutNoCoal: "#46be50",
    },
    "Energy sources": {
      coal: "#260C07",
      otherFossil: "#9B8881",
      gas: "#6D330C",
      solar: "#FFE36E",
      bioenergy: "#BCCC5C",
      wind: "#2A720C",
      otherRenewables: "#6D846B",
      hydro: "#21599C",
      nuclear: "#8AA0B5",
      solarAndWind: "#86e649",
      bess: "#ff8cc7",
    },
  },
};
