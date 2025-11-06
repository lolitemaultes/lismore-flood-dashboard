# Version 3 Upcoming Features & Changes

**Flood Map Water Level Simulation**
- Realistic Flood water simulation via terrain map

**Localised Rise & Fall Prediction**
- The use of models trained on previous flood and forecast data to calculate the most accurate predictions possible

**Dashboard Restyling for V3**
- Overhaul of current styling
- Adding completely different mobile/tablet support

**Code Restructure / Cleaner Architecture**
- Separation of css and js to maintain clean directory

**LOLITEMAULTES Original Weather Radar Map**
- Implement original interactive rain radar map
- The aggregation of multiple free radar APIs to get the most accurate result

**Bug Fixes**
- Fixing bugs as they show

**Reset Maps on Tab Switch**
- Resetting map view and element when the tab is unfocused

**Better Flood Map Statistic Method**
- Ensuring that certain affect stats are included even when the affect level rises e.g. Street level reached > gate level reached > floor height reached, all stay ticked as affected

**Fix Singular Outage Area Zooming**
- Fix bug where singular outage categories zoom in too far when fit to view is selected

**Single fetch functionality**
- Fetching live data at selected interval and startup through server.js
- Using fetched data after fetch occurs so data is not loading at request through HTML
- This will also fix bugs such as data "not being available" at times
