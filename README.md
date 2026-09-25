# BFF data visuals

Interactive charts embedded on the [Beyond Fossil Fuels](https://beyondfossilfuels.org/) website.

Beyond Fossil Fuels tracks Europe's move away from coal and gas in the power sector. This repository holds the interactive charts that show that tracking on the website. Each chart is a small standalone web page, published with GitHub Pages and embedded on the site with an iframe.

The charts are built to be:

- **Kept up to date easily:** each chart reads its figures from a published data source, so new figures appear without editing the chart.
- **Consistent:** fonts, colours and chart styles are defined once and shared by every chart.
- **Responsive:** charts adapt to any width, from phones to full-width pages, and show tooltips on hover or tap.
- **Adjustable without code:** open any chart with `?design` at the end of its address for a panel where you can adjust its look and export the result.

Browse all charts in the [gallery](https://beyond-fossil-fuels.github.io/data-visuals/).

## Structure

```
index.html          gallery listing every chart, with its embed code
shared/
  brand.js          shared brand settings: fonts, colours, chart and arrow styles
  v1/               shared code and styles used by every chart
<chart-name>/
  index.html        one folder per chart: its settings and drawing code
```

## How it grows

- **New chart:** add a new folder with its own `index.html`, built on the shared code, and add it to the gallery list.
- **New look for every chart:** change `shared/brand.js`.
- **New shared features:** go into a new version folder (`shared/v2/`, ...), so charts that are already embedded keep working unchanged until they're moved over.

## Embedding

Each chart's embed code is in the gallery. Add the small auto-height script shown there once per site, so embedded charts resize to fit their content.
