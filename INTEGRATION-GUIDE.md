# ANALYTICS MODULE - INTEGRATION GUIDE

## NEW MODULE: Rapportage & Analytics

Generate detailed performance reports for up to 7 skaters with PDF export!

---

## 📦 WHAT'S INCLUDED

**Files:**
- `modules/analytics/analytics.js` - Main module logic
- `modules/analytics/analytics.css` - Styling
- `integration-steps.md` - This file

---

## 🔧 INSTALLATION STEPS

### Step 1: Copy Module Files

Copy the `modules/analytics/` folder to your SILO-6 project:

```
SILO-6/
├─ modules/
│  ├─ analytics/         ← NEW MODULE
│  │  ├─ analytics.js
│  │  └─ analytics.css
│  ├─ headtohead/
│  ├─ biography/
│  └─ ...
```

---

### Step 2: Register Module in Router

Find your router file (likely `core/router.js` or `app.js`) and add the analytics module:

**Add import:**
```javascript
import { mountAnalytics } from "./modules/analytics/analytics.js";
```

**Add route:**
```javascript
const routes = {
  home: mountHome,
  headtohead: mountHeadToHead,
  biography: mountBiography,
  filters: mountFilters,
  analytics: mountAnalytics,  // ← ADD THIS
  // ... other routes
};
```

---

### Step 3: Add CSS Import

In your main HTML file (likely `index.html`) or CSS loader, add:

```html
<link rel="stylesheet" href="modules/analytics/analytics.css">
```

Or if you have a CSS bundler:
```css
@import "modules/analytics/analytics.css";
```

---

### Step 4: Add Menu Button

In your home module (`modules/home/home.js`), add a navigation button:

**Find the menu section and add:**
```javascript
menuBtn("Rapportage & Analytics", "Genereer rapporten", "analytics"),
```

**Example:**
```javascript
const menu = el("div", { class:"menu-grid" }, [
  menuBtn("Dashboard", "Overzicht", "dashboard"),
  menuBtn("Head-to-Head", "Vergelijk rijders", "headtohead"),
  menuBtn("Biografie", "Rijder profiel", "biography"),
  menuBtn("Rapportage & Analytics", "Genereer rapporten", "analytics"),  // ← ADD
  menuBtn("World Tour Klassementen", "...", "filters"),
  menuBtn("Settings", "Upload data", "settings")
]);
```

---

### Step 5: Test Installation

1. **Refresh browser**
2. **Check home menu** - Should see "Rapportage & Analytics" button
3. **Click button** - Should navigate to analytics module
4. **Verify interface:**
   - Report type selector
   - Rider count dropdown (1-7)
   - Rider selection fields
   - Filter sections (Tournament, Distance, Season, Run)
   - Generate button

---

## ✨ FEATURES

### 🎯 Rider Selection
- Select **1 to 7 skaters** for analysis
- Searchable dropdowns
- Clear rider names

### 🔍 Filtering System
Same filters as Head-to-Head:
- **Toernooi:** OS, WK, WKJ, EK, WC/WT, NK
- **Afstand:** 500m, 1000m, 1500m
- **Seizoen:** All available years
- **Run:** None, All, Final A, Final B

### 📊 Generated Report Includes

**For Each Rider:**
1. **Key Statistics**
   - Total races
   - Podium finishes (with percentage)
   - Gold, Silver, Bronze counts
   - Best position
   - Average position
   - Consistency score (0-10)

2. **Recent Form**
   - Last 5 race positions
   - Includes remarks (DNF, DQ, etc.)

3. **Detailed Results Table**
   - Date, Tournament, Location
   - Distance, Run type, Position
   - Notes/Remarks
   - Sorted newest first
   - Podium rows highlighted

### 📥 Export Options
- **Download PDF** - High-quality PDF document
- **Print** - Browser print dialog

---

## 🎯 USAGE EXAMPLES

### Example 1: Compare 3 Sprinters on 500m WC

**Setup:**
```
Aantal Rijders: 3
Riders: 
  - DANDJINOU William
  - VAN 'T WOUT Jens
  - OTTERSPEER Jan
Filters:
  - Toernooi: WC/WT
  - Afstand: 500m
  - Seizoen: 2024, 2025, 2026
  - Run: Final A
```

**Click "Genereer Rapport"**

**Result:**
- Detailed stats for each rider
- All their 500m WC Final A results
- Comparison of podium rates
- Recent form analysis

**Export:**
- Download as PDF for sharing
- Or print for offline review

---

### Example 2: Analyze Single Rider Across All Distances

**Setup:**
```
Aantal Rijders: 1
Riders:
  - NUIS Kjeld
Filters:
  - Toernooi: WK
  - Afstand: All (500m, 1000m, 1500m)
  - Seizoen: 2025, 2026
  - Run: All
```

**Result:**
- Complete WK performance overview
- Performance across all distances
- Consistency analysis
- Full race history

---

### Example 3: Scout 7 Young Talents

**Setup:**
```
Aantal Rijders: 7
Riders: [7 junior riders]
Filters:
  - Toernooi: WKJ, NK
  - Afstand: 1000m
  - Seizoen: 2026
  - Run: Final A
```

**Result:**
- Side-by-side comparison of 7 riders
- Junior championship performance
- Identify top performers
- Track improvement trends

---

## 📐 REPORT STRUCTURE

```
┌───────────────────────────────────────────┐
│ 📊 RIJDER PERFORMANCE ANALYSE             │
│ Gegenereerd: 12-02-2026                   │
│ Dataset: SILO-6                           │
│ Filters: WC/WT | 1000m | 2024-2026 | ... │
├───────────────────────────────────────────┤
│ 1. SAMENVATTING                           │
│ • DANDJINOU William (45 races)            │
│ • VAN 'T WOUT Jens (38 races)            │
│ • SIGHEL Pietro (32 races)               │
├───────────────────────────────────────────┤
│ 2. DANDJINOU WILLIAM                      │
│                                           │
│ [Stats Grid - 8 Key Metrics]             │
│                                           │
│ Recente Vorm: 1 — 2 — 1 — 3 — 2         │
│                                           │
│ [Detailed Results Table]                  │
├───────────────────────────────────────────┤
│ 3. VAN 'T WOUT JENS                      │
│ [Same structure as above]                 │
├───────────────────────────────────────────┤
│ 4. SIGHEL PIETRO                         │
│ [Same structure as above]                 │
└───────────────────────────────────────────┘
```

---

## 🎨 STYLING

### Light Report Theme
Reports use a professional light theme:
- White background
- Dark text (#1a1a1a)
- Cyan accents (#52e8e8)
- Clean typography
- Professional layout

### Print Optimized
- Removes UI controls
- Optimizes for paper
- Prevents page breaks in tables
- Clean margins

---

## 🔧 TECHNICAL DETAILS

### PDF Generation
Uses **jsPDF** library (loaded via CDN):
```javascript
https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
```

Auto-loaded when module mounts. No manual setup needed.

### Statistics Calculated
- **Podium Rate:** (Podiums / Total Races) × 100
- **Consistency Score:** 10 - standard_deviation(positions)
  - Higher score = more consistent
  - Based on position variance
- **Recent Form:** Last 5 races chronologically

### Data Processing
- Filters applied before calculations
- Results sorted by date (newest first)
- Podium positions: 1, 2, 3
- Medal icons: 🥇🥈🥉

---

## 🚀 FUTURE ENHANCEMENTS

**Phase 2 (Potential):**
- Distance Analysis Report (compare riders on specific distance)
- Season Summary Report (complete season overview)
- Tournament Report (single event deep-dive)
- Charts and visualizations
- Win probability predictions
- Custom report templates
- Email export option

---

## ✅ VERIFICATION CHECKLIST

After installation:

```
□ Analytics folder copied to modules/
□ Module imported in router
□ Route registered
□ CSS loaded
□ Menu button added
□ Browser refreshed
□ Menu shows "Rapportage & Analytics"
□ Click navigates to analytics module
□ Can select riders (1-7)
□ Can set filters
□ Can generate report
□ Report displays correctly
□ PDF download works
□ Print works
```

---

## 🐛 TROUBLESHOOTING

**Problem: Module not appearing in menu**
→ Check router registration and imports

**Problem: Styling looks wrong**
→ Verify CSS file is loaded in HTML

**Problem: PDF download fails**
→ Wait 2 seconds after page load (jsPDF loading)
→ Check browser console for errors

**Problem: No riders in dropdown**
→ Ensure dataset has Skaters tab
→ Check data is loaded

**Problem: "Geen resultaten"**
→ Select at least one filter
→ Select at least one rider

---

## 📞 SUPPORT

If you encounter issues:
1. Check browser console (F12) for errors
2. Verify all integration steps completed
3. Test with sample data
4. Check file paths are correct

---

**Enjoy generating powerful analytics reports!** 📊✨
