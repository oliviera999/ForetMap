from pathlib import Path

# map-views.jsx
p = Path("src/components/map-views.jsx")
t = p.read_text(encoding="utf-8")
t = t.replace(
    '  return (\n    <div className="map-view-root" style={{ minHeight: embedded ? 320 : 380 }}>',
    '  return (\n    <div className={`map-view-root ${embedded ? \'map-view-root--embedded\' : \'map-view-root--solo\'}`}>',
    1,
)
old_box = """        <div ref={containerRef}
          style={{ width: '100%', maxWidth: '100%', maxHeight: '100%', aspectRatio: mapAspect,
            overflow: 'hidden', position: 'relative', background: '#eef2ee',
            cursor, touchAction, userSelect: 'none', WebkitUserSelect: 'none' }}
          onClick={onMapClick}>"""
new_box = """        <div ref={containerRef}
          style={{
            boxSizing: 'border-box',
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            minWidth: 0,
            aspectRatio: mapAspect,
            overflow: 'hidden',
            position: 'relative',
            background: '#eef2ee',
            cursor,
            touchAction,
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
          onClick={onMapClick}>"""
if old_box not in t:
    raise SystemExit("container block not found")
t = t.replace(old_box, new_box, 1)
p.write_text(t, encoding="utf-8")
print("map-views OK")

# App.jsx
a = Path("src/App.jsx")
t2 = a.read_text(encoding="utf-8")
needle = "  const teacherMapChromeVisible = !loading && (useSplitMapTasks || (!useSplitMapTasks && tab === 'map'));\n"
add = needle + "  /** Barre d'outils carte compacte (laptop) + élève sur onglet carte / split — aligné sur le comportement mobile. */\n  const studentMapPageChromeVisible = !loading && (useSplitMapTasks || (!useSplitMapTasks && tab === 'map'));\n"
if needle not in t2 or "studentMapPageChromeVisible" in t2:
    pass
if "studentMapPageChromeVisible" not in t2:
    t2 = t2.replace(needle, add, 1)
old_main = '          <div className={`main ${useWideMain ? \'main--wide\' : \'\'}`}>'
new_main = '          <div className={`main ${useWideMain ? \'main--wide\' : \'\'} ${studentMapPageChromeVisible ? \'main--map-visible\' : \'\'}`}>'
# only replace student branch - first occurrence might be wrong. Find student fragment.
idx = t2.find("{effectiveIsTeacher ? (")
if idx < 0:
    raise SystemExit("no teacher ternary")
# student branch is "} : (" after teacher block - search for unique pattern
marker = "      ) : (\n        <>\n          <div className={`main ${useWideMain ? 'main--wide' : ''}`}>"
if marker not in t2:
    raise SystemExit("student main marker not found")
t2 = t2.replace(marker, marker.replace("`}>`", "`} ${studentMapPageChromeVisible ? 'main--map-visible' : ''}`}>", 1).replace(
    "<div className={`main ${useWideMain ? 'main--wide' : ''}`}>",
    "<div className={`main ${useWideMain ? 'main--wide' : ''} ${studentMapPageChromeVisible ? 'main--map-visible' : ''}`}>",
    1,
)
a.write_text(t2, encoding="utf-8")
print("App.jsx OK")
