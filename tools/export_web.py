"""Export StemmaLM snapshots for the in-browser model: one flat little-endian fp16 file per
snapshot (mXX.bin) plus a manifest of tensor names, shapes and offsets shared by all snapshots.
head.weight is tied to tok.weight and is not stored twice."""
import json
import pathlib
import sys

import numpy as np
import torch


def main(indiv, out):
    indiv, out = pathlib.Path(indiv), pathlib.Path(out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = None
    for p in sorted((indiv / "ckpt").glob("m*.pt")):
        sd = {k: v for k, v in torch.load(p, map_location="cpu").items() if k != "head.weight"}
        if manifest is None:
            off, tensors = 0, []
            for k, v in sd.items():
                tensors.append({"name": k, "shape": list(v.shape), "offset": off})
                off += v.numel()
            manifest = {"dtype": "float16", "n_values": off, "tensors": tensors,
                        "vocab": json.loads((indiv / "vocab.json").read_text()),
                        "snapshots": []}
        flat = np.concatenate([sd[t["name"]].to(torch.float16).numpy().ravel() for t in manifest["tensors"]])
        flat.astype("<f2").tofile(out / f"{p.stem}.bin")
        manifest["snapshots"].append(int(p.stem[1:]))
    (out / "manifest.json").write_text(json.dumps(manifest))
    print("exported", len(manifest["snapshots"]), "snapshots,", manifest["n_values"], "values each")


if __name__ == "__main__":
    main(*sys.argv[1:3])
