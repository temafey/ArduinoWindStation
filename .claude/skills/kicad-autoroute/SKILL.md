---
name: kicad-autoroute
description: Autoroute a PCB using Freerouting — check prerequisites, run the autorouter, and import results. Use when you want automatic trace routing.
argument-hint: [board-path]
---

# KiCAD Autorouting with Freerouting

You are an expert in PCB autorouting. Help the user automatically route their PCB traces.

## Prerequisites check

Always start by verifying Freerouting is available:
```
check_freerouting()
```

**Requirements:**
- Freerouting JAR file at `~/.kicad-mcp/freerouting.jar` (v2.0.1+)
- Java 21+ OR Docker/Podman installed
- Download from: https://github.com/freerouting/freerouting/releases

## Before autorouting

1. **Schematic must be synced** — `sync_schematic_to_board` if not done
2. **Components must be placed** — autorouting only routes traces, it does not place components
3. **Design rules should be set** — `set_design_rules` for track width, clearance, via size
4. **Optionally pre-route critical nets** — manually route power, high-speed, or sensitive signals first; the autorouter will work around them

## Run autorouting

### Basic autoroute
```
autoroute(boardPath)
```
Uses defaults: 20 passes, 300 second timeout.

### Custom settings
```
autoroute(
  boardPath,
  maxPasses=30,       # more passes = better optimization (default: 20)
  timeout=600         # seconds before giving up (default: 300)
)
```

### Best-of-N attempts
```
autoroute(
  boardPath,
  attempts=3,                    # run 3 times, keep best result
  passSchedule=[10, 20, 30]      # different pass counts per attempt
)
```

### Target specific nets
```
autoroute(
  boardPath,
  targetNets=["USB_D+", "USB_D-", "CLK"]   # prioritize these nets
)
```

## Manual workflow (more control)

If you need to use Freerouting GUI or a different autorouter:

1. **Export DSN** — `export_dsn(boardPath, outputPath)`
2. **Run external autorouter** on the .dsn file
3. **Import SES** — `import_ses(boardPath, sesPath)` to bring routes back

## After autorouting

1. **Run DRC** — `run_drc` to check for violations
2. **Visual inspection** — `get_board_2d_view` to review the routing
3. **Refill zones** — `refill_zones` if you have copper pours
4. **Manual cleanup** — fix any suboptimal routes with `route_pad_to_pad` or `modify_trace`
5. **Save** — `save_project`

## Tips for better autorouting results

- **Place components well** — good placement = good routing. The autorouter can't fix bad placement.
- **Pre-route power** — manually route VCC and GND with wide traces before autorouting
- **Add a ground pour** after autorouting, not before — `add_copper_pour` on B.Cu for GND
- **Use more passes** — `maxPasses=40` takes longer but produces cleaner routes
- **Try multiple attempts** — `attempts=3` runs the autorouter 3 times and keeps the best result
- **Set proper design rules** — the autorouter respects track width and clearance settings

## Troubleshooting

**"No unrouted connections"** — all nets are already routed, or schematic wasn't synced
**"Freerouting not found"** — download the JAR and place at `~/.kicad-mcp/freerouting.jar`
**"Java not found"** — install Java 21+ or Docker
**Incomplete routing** — increase `maxPasses` and `timeout`, or manually route difficult nets first
**DRC violations after routing** — adjust design rules to match fab capabilities, then re-route

## Important notes

- Autorouting works best on boards with fewer than ~200 connections
- Always manually review autorouted results — the autorouter optimizes for completion, not signal integrity
- Critical signals (clocks, differential pairs, analog) should be manually routed
- The autorouter modifies the .kicad_pcb file directly — use `snapshot_project` beforehand as a backup
