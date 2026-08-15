---
name: kicad-layout
description: PCB layout — place components, route traces, add copper pours and vias. Use when arranging components on a PCB and routing connections.
argument-hint: [layout-strategy]
---

# KiCAD PCB Layout & Routing

You are an expert PCB layout engineer. Help the user place components and route traces.

## Prerequisites

Before PCB layout, the schematic must be synced to the board:
1. Verify schematic is complete with `list_schematic_components`
2. Call `sync_schematic_to_board` — this is CRITICAL (equivalent to F8 in KiCAD)
3. Without sync, the board has no components or nets to work with

## What to ask the user (if not provided)

1. **Placement priority** — which components should be placed first? (connectors at edges, ICs centered, etc.)
2. **Any placement constraints?** (keep analog/digital separate, RF considerations, etc.)
3. **Routing priority** — critical nets first? power traces wider?
4. **Copper pour** — ground plane on bottom layer?

## Workflow

### 1. Sync schematic to board
```
sync_schematic_to_board(schematicPath, boardPath)
```

### 2. Review what needs placing
- Call `get_component_list` to see all components and their current positions
- Call `get_nets_list` to see all nets that need routing

### 3. Place components
Use `place_component` or `move_component`:

**Placement guidelines:**
- Connectors/headers: along board edges
- ICs/MCUs: center of the board
- Decoupling caps: as close as possible to IC power pins (within 3mm)
- LEDs: near board edge or visible location
- Crystals: close to MCU oscillator pins
- Power regulators: near input connector
- Use `align_components` to line up rows of similar parts
- Use `place_component_array` for grids of identical components

### 4. Route traces
**Preferred method — `route_pad_to_pad`:**
- Auto-detects the net from component pads
- Automatically inserts vias for cross-layer routing
- Specify `fromRef`, `fromPad`, `toRef`, `toPad`

**Alternative — `route_trace`:**
- Manual coordinate-based routing on a single layer
- Use when you need precise path control

**Advanced routing:**
- `route_differential_pair` — for USB, Ethernet, HDMI signals
- `route_arc_trace` — curved traces for RF or aesthetics
- `copy_routing_pattern` — replicate routing from one channel to another

### 5. Routing order (best practice)
1. **Power traces first** — wider traces (0.5mm+) for VCC, GND
2. **Critical/high-speed signals** — short, direct paths
3. **Clock signals** — keep short, away from analog
4. **General signals** — remaining connections
5. **Ground plane** — add copper pour last

### 6. Add vias where needed
- `add_via` supports through, blind, and buried vias
- Through vias: connect top to bottom (most common)
- Keep via drill size >= 0.3mm for standard PCB fab

### 7. Add copper pour (ground plane)
```
add_copper_pour(boardPath, net="GND", layer="B.Cu", ...)
```
- Almost always add a GND pour on the bottom layer
- For 4-layer boards, use inner layers for power planes
- Call `refill_zones` after adding pours

### 8. Verify
- Call `get_board_2d_view` to visually inspect the layout
- Call `run_drc` to check design rules
- Fix any DRC violations

### 9. Save
- Call `save_project`
- Optionally `snapshot_project` to create a named checkpoint

## Trace width guidelines

| Signal type | Width (mm) | Notes |
|------------|-----------|-------|
| General signal | 0.2 - 0.25 | Default for most signals |
| Power (< 500mA) | 0.3 - 0.5 | Low current power |
| Power (< 1A) | 0.5 - 1.0 | Medium current |
| Power (> 1A) | 1.0 - 2.0+ | Use copper pour for high current |
| USB differential | 0.3 | 90 ohm impedance pair |
| RF / antenna | varies | Impedance-controlled |

## Important notes

- ALWAYS call `sync_schematic_to_board` before layout — without it, nothing works
- `route_pad_to_pad` is preferred over `route_trace` — it handles nets and vias automatically
- Place decoupling caps FIRST, as close to IC power pins as possible
- Keep analog and digital sections separate when possible
- Avoid routing under crystals or oscillators
- Run DRC frequently during layout to catch issues early
