# QUICK REFERENCE: CODE INSERTION POINTS

## File: modules/headtohead/headtohead.js

### INSERTION 1: Analytics State Variables
**Location:** After line 1250  
**After:** `const tSet = new Set();`  
**Add:**
```javascript
let mode = "compare";
const analyticsRiders = Array(7).fill("");
let analyticsRiderCount = 3;
```

---

### INSERTION 2: Analytics Functions
**Location:** Around line 1475  
**Before:** The final `render();` call near end of mountHeadToHead  
**Add:** ALL code from `CODE-TO-ADD-FUNCTIONS.txt`

---

### INSERTION 3: Mode Toggle UI
**Location:** Around line 1338  
**Find:** `root.appendChild(sectionCard({`  
**Replace the sectionCard call with:**  
See INSTALL-GUIDE.md Step 5 for full code

---

### INSERTION 4: jsPDF Library Loader  
**Location:** End of mountHeadToHead (around line 1480)  
**Before:** Final closing `}`  
**Add:**
```javascript
if(typeof window.jspdf === "undefined"){
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  document.head.appendChild(script);
}
```

---

## File: modules/headtohead/headtohead.css

**Action:** Replace entire file with the version in this package  
**Or:** Append the analytics styles from the end of the provided CSS file

---

## TESTING CHECKLIST

After all insertions:
- [ ] No syntax errors
- [ ] File commits successfully
- [ ] Hard refresh browser
- [ ] Module loads without errors
- [ ] Mode toggle appears
- [ ] Compare mode still works
- [ ] Analytics mode loads
- [ ] Can select 7 riders
- [ ] Can generate reports
- [ ] PDF download works
- [ ] Print works

---

## IF ERRORS OCCUR

1. Check console for syntax errors
2. Verify all 4 insertions were made
3. Check line numbers match (may vary slightly)
4. Ensure no duplicate code
5. Verify CSS was updated

**Send error screenshot if needed!**
