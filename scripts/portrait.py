"""
Turn a photo into the about-page portrait map.

    python scripts/portrait.py path/to/photo.jpg

Writes public/portrait/sam.png: a 128x128 greyscale + alpha PNG.
  grey  = brightness (contrast-stretched)
  alpha = the person, cut out from the background
DotPortrait.astro reads that file and draws it as dots, so a new photo
only needs this script rerun, no code changes.

Needs: pip install rembg onnxruntime pillow
Best photos: front-on, even light, plain background, head and shoulders,
roughly square with the head in the upper middle.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps
from rembg import remove, new_session

SIZE = 128
OUT = Path(__file__).resolve().parent.parent / 'public' / 'portrait' / 'sam.png'

src = Image.open(sys.argv[1]).convert('RGB')
# Centre-crop to a square, then work at 1024px (plenty for 128 samples).
src = ImageOps.fit(src, (1024, 1024), Image.LANCZOS)

cut = remove(src, session=new_session('u2net_human_seg'))  # RGBA
alpha = cut.split()[3]

# Brightness of the person only: composite on white, greyscale, then
# stretch the contrast so the darkest and lightest 1% use the full range.
grey = Image.alpha_composite(Image.new('RGBA', cut.size, 'white'), cut).convert('L')
grey = ImageOps.autocontrast(grey, cutoff=1)

out = Image.merge('LA', (grey.resize((SIZE, SIZE), Image.BOX), alpha.resize((SIZE, SIZE), Image.BOX)))
OUT.parent.mkdir(parents=True, exist_ok=True)
out.save(OUT, optimize=True)
print(f'wrote {OUT} ({OUT.stat().st_size} bytes)')
