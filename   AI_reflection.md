# AI Reflection — Assignment 1

## What AI helped with
AI helped me:
- Plan the minimal file structure for the assignment.
- Break the visualization into clear components (data parsing, filtering, grouping, rendering, updating).
- Implement required interactions: hover tooltip and click-to-toggle max/min.
- Add a temperature color legend and mini sparkline inside each matrix cell.

## What I verified and changed myself
- I verified the last-10-years filtering by checking the max year and confirming only 10 unique years are shown.
- I checked the tooltip values against the underlying cell aggregation (monthly max/min).
- I adjusted layout constants (margins, sizes) for readability.
- I ensured functions and constants are grouped and commented to meet readability/maintainability rubric.

## What I learned
- How to group time-series data into (year, month) cells and derive monthly aggregates.
- How to update D3 marks efficiently (update fills and paths) when interaction toggles state.
- How to build a simple SVG gradient legend that matches a sequential color scale.
