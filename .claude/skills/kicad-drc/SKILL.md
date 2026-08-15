---
name: kicad-drc
description: Run KiCAD design rule checks (DRC/ERC), review violations, and fix common issues. Use when validating a PCB design or schematic for errors.
argument-hint: [board-or-schematic-path]
---

# KiCAD Design Rule Check & Validation

You are an expert PCB design reviewer. Help the user validate their design and fix violations.

## Workflow

### 1. Check current design rules
```
get_design_rules(boardPath)
```
Review what rules are configured. Suggest improvements if needed.

### 2. Run DRC on the PCB
```
run_drc(boardPath)
```
This checks:
- Clearance violations (traces too close)
- Track width violations (below minimum)
- Via drill violations
- Unconnected nets (ratsnest)
- Courtyard overlaps (components too close)
- Edge clearance violations

### 3. Run ERC on the schematic
```
run_erc(schematicPath)
```
This checks:
- Unconnected pins
- Missing power flags
- Conflicting pin types (output driving output)
- Missing references

### 4. Review violations
- Call `get_drc_violations` for detailed violation list
- Call `check_clearance` to verify specific component clearances
- Call `check_courtyard_overlaps` to find overlapping footprints

### 5. Fix common issues

**Clearance violations:**
- Move components apart with `move_component`
- Reroute traces with more spacing using `route_pad_to_pad`
- Adjust design rules if the clearance is too strict: `set_design_rules`

**Unconnected nets:**
- Route missing connections with `route_pad_to_pad`
- Or use `autoroute` to complete remaining connections

**Courtyard overlaps:**
- Move overlapping components with `move_component`
- Check actual physical clearance — sometimes courtyard overlaps are acceptable

**Missing power flags (ERC):**
- Add `PWR_FLAG` symbols on power nets in the schematic

**Schematic connectivity issues:**
- `find_orphaned_wires` — wires not connected to anything
- `list_floating_labels` — labels without matching connections
- `snap_to_grid` — fix off-grid components causing connectivity breaks

### 6. Re-run checks
After fixing issues, re-run DRC/ERC to verify all violations are resolved.

## Design rule recommendations by use case

### Standard 2-layer board (JLCPCB/PCBWay)
- Clearance: 0.2mm
- Track width: 0.2mm (min 0.15mm)
- Via diameter: 0.8mm
- Via drill: 0.4mm

### Fine-pitch / BGA
- Clearance: 0.1mm
- Track width: 0.1mm
- Via diameter: 0.5mm
- Via drill: 0.25mm (HDI process required)

### High-current power
- Clearance: 0.3mm+
- Track width: 1.0mm+ (depends on current)
- Via diameter: 1.0mm+
- Via drill: 0.5mm+

## Setting up net classes
For mixed designs with different requirements:
```
create_netclass(boardPath, name="Power", trackWidth=0.5, clearance=0.3)
assign_net_to_class(boardPath, net="VCC", className="Power")
assign_net_to_class(boardPath, net="GND", className="Power")
```

## Important notes

- Run DRC iteratively during layout, not just at the end
- Zero DRC errors is the goal before exporting Gerber files
- Some ERC warnings (like unconnected pins on unused IC features) can be suppressed with no-connect flags
- Courtyard overlaps are warnings — intentional overlaps (like stacking) may be acceptable
