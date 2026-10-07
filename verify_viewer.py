"""Browser verification and model artifact export; run with isolated Playwright."""
import argparse
import json
from pathlib import Path
import struct

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "verification"


def canvas_pixels(path):
    image = Image.open(path).convert("RGB")
    samples = list(image.resize((160, 100)).getdata())
    colorful = sum(max(p) - min(p) > 35 for p in samples)
    assert colorful > 120, f"Blank or unframed canvas: {colorful} colorful pixels"
    return {"colorful_pixels": colorful, "sampled_pixels": len(samples)}


def check_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2 and length == len(data)
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    assert chunk_type == 0x4E4F534A
    doc = json.loads(data[20:20 + chunk_length])
    names = [n.get("name", "") for n in doc["nodes"]]
    assert any("细胞核" in n for n in names)
    assert any("细胞质" in n for n in names)
    return {"bytes": len(data), "nodes": len(names), "meshes": len(doc.get("meshes", [])), "named_parts": [n for n in names if " · " in n]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    errors, report = [], {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(args.url, wait_until="networkidle")
        page.wait_for_function("window.cellViewer && document.querySelector('#loading').hidden")
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "desktop.png"), full_page=True)
        canvas = page.locator("canvas")
        canvas.screenshot(path=str(OUT / "desktop-canvas.png"))
        report["desktop_canvas"] = canvas_pixels(OUT / "desktop-canvas.png")
        assert page.locator(".part-row").count() == 24
        before = page.evaluate("cellViewer.camera.position.toArray()")
        box = canvas.bounding_box()
        page.mouse.move(box["x"] + box["width"] * .5, box["y"] + box["height"] * .6)
        page.mouse.down()
        page.mouse.move(box["x"] + box["width"] * .7, box["y"] + box["height"] * .65, steps=12)
        page.mouse.up()
        page.wait_for_timeout(400)
        after = page.evaluate("cellViewer.camera.position.toArray()")
        assert sum(abs(a - b) for a, b in zip(before, after)) > .5
        report["rotation"] = True
        page.click("#reset")
        page.click('[data-view="plant"]')
        assert page.locator(".part-row").count() == 12
        row = page.locator('[data-key="plant:vacuole"]')
        row.locator("input").uncheck()
        assert page.evaluate("!cellViewer.groups.get('plant:vacuole').visible")
        page.click("#show-all")
        assert page.evaluate("cellViewer.groups.get('plant:vacuole').visible")
        row.locator("button").click()
        assert "中央液泡" in page.locator("#detail-name").inner_text()
        report["selection_and_visibility"] = True
        page.click("#move")
        point = page.evaluate("""async () => {
            const THREE = await import('three');
            const g = cellViewer.groups.get('plant:vacuole');
            const point = g.getWorldPosition(new THREE.Vector3()).project(cellViewer.camera);
            const rect = cellViewer.renderer.domElement.getBoundingClientRect();
            return { x: rect.x + (point.x + 1) * rect.width / 2, y: rect.y + (1 - point.y) * rect.height / 2 };
        }""")
        original = page.evaluate("cellViewer.groups.get('plant:vacuole').position.toArray()")
        cell_original = page.evaluate("cellViewer.plant.position.toArray()")
        page.mouse.move(point["x"], point["y"])
        page.mouse.down()
        page.mouse.move(point["x"] + 65, point["y"] - 20, steps=10)
        page.mouse.up()
        moved = page.evaluate("cellViewer.groups.get('plant:vacuole').position.toArray()")
        assert sum(abs(a - b) for a, b in zip(original, moved)) > .1
        assert cell_original == page.evaluate("cellViewer.plant.position.toArray()")
        report["organelle_drag"] = True
        page.click("#reset")
        assert original == page.evaluate("cellViewer.groups.get('plant:vacuole').position.toArray()")
        page.click("#move")
        page.mouse.move(point["x"], point["y"])
        page.mouse.down()
        page.mouse.move(point["x"] + 55, point["y"] - 15, steps=10)
        page.mouse.up()
        assert cell_original != page.evaluate("cellViewer.plant.position.toArray()")
        report["whole_cell_drag"] = True
        page.click("#reset")
        page.locator("#explode").evaluate("e => {e.value = 50; e.dispatchEvent(new Event('input', {bubbles:true}));}")
        assert page.evaluate("cellViewer.groups.get('plant:vacuole').position.y") > original[1]
        page.locator("#opacity").evaluate("e => {e.value = 35; e.dispatchEvent(new Event('input', {bubbles:true}));}")
        assert page.evaluate("cellViewer.groups.get('plant:wall').children[0].material.opacity") == .35
        report["sliders"] = True
        page.click("#reset")
        page.locator("#opacity").evaluate("e => {e.value = 65; e.dispatchEvent(new Event('input', {bubbles:true}));}")
        page.click("#auto")
        auto_before = page.evaluate("cellViewer.camera.position.toArray()")
        page.wait_for_timeout(500)
        auto_after = page.evaluate("cellViewer.camera.position.toArray()")
        assert auto_before != auto_after
        report["auto_rotation"] = True
        page.click("#reset")
        page.click("#reference")
        assert page.locator("#reference-dialog img").evaluate("e => e.complete && e.naturalWidth > 0")
        page.click("#close-reference")
        report["reference_image"] = True
        for view in ("plant", "animal", "both"):
            page.click(f'[data-view="{view}"]')
            with page.expect_download() as info:
                page.click("#export")
            destination = ROOT / "models" / f"{view}-cells.glb"
            info.value.save_as(destination)
            report[f"{view}_glb"] = check_glb(destination)
        page.screenshot(path=str(OUT / "desktop.png"), full_page=True)
        mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1, is_mobile=True, has_touch=True)
        mobile.on("pageerror", lambda e: errors.append(str(e)))
        mobile.goto(args.url, wait_until="networkidle")
        mobile.wait_for_function("window.cellViewer")
        mobile.wait_for_timeout(500)
        mobile.screenshot(path=str(OUT / "mobile.png"), full_page=True)
        mobile.locator("canvas").screenshot(path=str(OUT / "mobile-canvas.png"))
        report["mobile_canvas"] = canvas_pixels(OUT / "mobile-canvas.png")
        assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
        mobile.click('[data-view="animal"]')
        assert mobile.locator(".part-row").count() == 12
        mobile.screenshot(path=str(OUT / "mobile-animal.png"), full_page=True)
        report["mobile_no_horizontal_overflow"] = True
        assert not errors, errors
        report["browser_errors"] = errors
        browser.close()
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
