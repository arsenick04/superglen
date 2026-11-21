# Quaternius nature source

`public/env/quaternius-nature.glb` contains four mobile LODs derived from the
[Ultimate Stylized Nature Pack](https://quaternius.com/packs/ultimatestylizednature.html)
by Quaternius (CC0 1.0). The runtime file contains no source textures: the build
script samples them into vertex colours and reduces each tree to 800–1,400
triangles so repeated city trees remain suitable for phones.

The source FBX and PNG files are intentionally not committed. Download the pack,
then rebuild with:

```bash
blender -b --python scripts/quaternius-nature.py -- /path/to/sources public/env/quaternius-nature.glb
```

The Godot port used during this conversion is maintained by Walter H. Palladino
at `walterpalladino/godot-quaternius-ultimate-stylized-nature` under the MIT
license; its license is reproduced in `LICENSE-port.txt`.
